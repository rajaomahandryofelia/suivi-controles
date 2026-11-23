import re
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from comptes.models import Utilisateur
from comptes.permissions import est_directeur
from suivi.models import Notification

from .documents import generer_pdf_officiel
from .models import Mission, NonConformite, OrdreMission, OrdreRoute, Tournee
from .ordres import delivrer_ordres, pieces_tournee
from .planificateur import (
    calculer_ordre_optimal,
    decrire_tournee,
    estimer_distance_et_duree,
)
from .serializers import MissionSerializer
from .throttles import VerificationRateThrottle
from .verification import contexte_document, execution_publique

# Format des numéros : OM-2026-0007 / OR-2026-0007
FORMAT_NUMERO = re.compile(r"^(OM|OR)-\d{4}-\d{4,}$")


def _statut_global(missions):
    """État de la mission d'ensemble, déduit de ses étapes."""
    statuts = {m.statut for m in missions}
    if not statuts or statuts == {Mission.Statut.PLANIFIEE}:
        return Mission.Statut.PLANIFIEE, "Planifiée"
    if statuts == {Mission.Statut.CLOTUREE}:
        return Mission.Statut.CLOTUREE, "Clôturée"
    return Mission.Statut.EN_COURS, "En cours"


class TourneeSerializer(serializers.ModelSerializer):
    """La mission d'ensemble : contrôleur, créneau, itinéraire, pièces officielles
    et, pour chaque étape, tout ce qui concerne le site (grille, rapport, non-conformités)."""

    controleur_nom = serializers.CharField(
        source="controleur.get_full_name", read_only=True
    )
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)
    missions = serializers.SerializerMethodField()

    class Meta:
        model = Tournee
        fields = [
            "id",
            "date",
            "statut",
            "statut_libelle",
            "controleur",
            "controleur_nom",
            "distance_estimee_km",
            "duree_estimee_min",
            "missions",
        ]
        read_only_fields = fields

    def get_missions(self, tournee):
        missions = tournee.missions.select_related(
            "site", "controleur", "modele_grille"
        ).order_by("ordre_dans_tournee")
        return MissionSerializer(missions, many=True).data

    def to_representation(self, tournee):
        donnees = super().to_representation(tournee)
        # Les étapes expliquées (risque, distance, raison de l'ordre) pour l'interface
        missions = list(
            tournee.missions.select_related("site", "modele_grille", "rapport").order_by(
                "ordre_dans_tournee"
            )
        )
        description = decrire_tournee(missions)
        etapes = description["etapes"]

        par_id = {m.id: m for m in missions}
        for etape in etapes:
            mission = par_id.get(etape.get("mission"))
            if mission is None:
                continue

            # Ministère / hors ministère
            etape["appartenance"] = mission.site.appartenance

            # Tout ce qu'il faut pour voir l'étape sans changer de page
            etape["statut"] = mission.statut
            etape["statut_libelle"] = mission.get_statut_display()
            etape["modele_grille_nom"] = mission.modele_grille.nom
            etape["nb_criteres"] = mission.modele_grille.criteres.count()
            etape["nb_reponses"] = mission.reponses.count()
            etape["nb_non_conformites"] = NonConformite.objects.filter(
                reponse__mission=mission
            ).count()
            etape["date_debut_reelle"] = mission.date_debut_reelle
            etape["date_fin_reelle"] = mission.date_fin_reelle
            etape["derogation_convention"] = mission.derogation_convention
            etape["motif_derogation"] = mission.motif_derogation

            rapport = getattr(mission, "rapport", None)
            etape["rapport"] = (
                {
                    "id": rapport.id,
                    "statut": rapport.statut,
                    "statut_libelle": rapport.get_statut_display(),
                    "score_conformite": rapport.score_conformite,
                }
                if rapport
                else None
            )

        donnees["etapes"] = etapes
        donnees["distance_reference_km"] = description["distance_reference_km"]

        # Créneau (identique pour toutes les étapes) et état d'ensemble
        if missions:
            premiere = missions[0]
            donnees["date_prevue"] = premiere.date_prevue
            donnees["heure_prevue"] = premiere.heure_prevue
            donnees["date_fin_prevue"] = premiere.date_fin_prevue
            donnees["heure_fin_prevue"] = premiere.heure_fin_prevue
        code, libelle = _statut_global(missions)
        donnees["statut_global"] = code
        donnees["statut_global_libelle"] = libelle
        donnees["nb_etapes"] = len(missions)
        donnees["nb_etapes_cloturees"] = sum(
            1 for m in missions if m.statut == Mission.Statut.CLOTUREE
        )

        # Carte professionnelle, ordre de mission, ordre de route
        donnees.update(pieces_tournee(tournee))
        return donnees


class GenerationSerializer(serializers.Serializer):
    controleur = serializers.IntegerField()
    date = serializers.DateField()


class TourneeViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Missions d'ensemble (plusieurs sites) : le Directeur les attribue et les valide ;
    un contrôleur consulte les siennes."""

    serializer_class = TourneeSerializer

    def get_queryset(self):
        tournees = Tournee.objects.select_related(
            "controleur", "controleur__carte_professionnelle"
        ).order_by("-date", "-id")
        if not est_directeur(self.request.user):
            tournees = tournees.filter(
                controleur=self.request.user, statut=Tournee.Statut.VALIDEE
            )
        return tournees

    def _exiger_directeur(self, request):
        if not est_directeur(request.user):
            raise PermissionDenied("Réservé au Directeur.")

    @staticmethod
    def _liberer_missions(tournee):
        tournee.missions.update(tournee=None, ordre_dans_tournee=None)

    # ---- Générer l'itinéraire à partir de missions déjà planifiées ---------

    @action(detail=False, methods=["post"])
    def generer(self, request):
        """Regroupe les missions déjà planifiées d'un contrôleur à une date.
        (L'attribution directe se fait par POST missions/attribuer/.)"""
        self._exiger_directeur(request)
        donnees = GenerationSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)
        date = donnees.validated_data["date"]

        try:
            controleur = Utilisateur.objects.get(
                pk=donnees.validated_data["controleur"],
                role=Utilisateur.Role.CONTROLEUR,
                is_active=True,
            )
        except Utilisateur.DoesNotExist:
            return Response(
                {"detail": "Contrôleur introuvable ou inactif."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Tournee.objects.filter(
            controleur=controleur, date=date, statut=Tournee.Statut.VALIDEE
        ).exists():
            return Response(
                {"detail": "Ce contrôleur a déjà une mission validée ce jour-là."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # Une ancienne proposition non validée est remplacée
            for ancienne in Tournee.objects.filter(
                controleur=controleur, date=date, statut=Tournee.Statut.PROPOSEE
            ):
                self._liberer_missions(ancienne)
                ancienne.delete()

            missions = list(
                Mission.objects.select_related("site")
                .filter(
                    controleur=controleur,
                    date_prevue=date,
                    statut=Mission.Statut.PLANIFIEE,
                    tournee__isnull=True,
                )
            )
            if not missions:
                return Response(
                    {"detail": "Aucune mission planifiée pour ce contrôleur à cette date."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            ordre = calculer_ordre_optimal(missions)
            distance, duree = estimer_distance_et_duree(ordre)

            tournee = Tournee.objects.create(
                date=date,
                controleur=controleur,
                distance_estimee_km=distance,
                duree_estimee_min=duree,
            )
            for rang, mission in enumerate(ordre, start=1):
                mission.tournee = tournee
                mission.ordre_dans_tournee = rang
                mission.save(update_fields=["tournee", "ordre_dans_tournee"])

        return Response(TourneeSerializer(tournee).data, status=status.HTTP_201_CREATED)

    # ---- Accepter ou refuser la proposition --------------------------------

    @action(detail=True, methods=["post"])
    def valider(self, request, pk=None):
        """Vérifie la carte, délivre l'ordre de mission et l'ordre de route,
        enregistre et notifie le contrôleur."""
        self._exiger_directeur(request)
        tournee = self.get_object()
        if tournee.statut != Tournee.Statut.PROPOSEE:
            return Response(
                {"detail": "Seule une mission proposée peut être validée."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            om, ordre_route = delivrer_ordres(
                tournee,
                request.user,
                request.data.get("depart"),
                request.data.get("transport"),
            )
            tournee.statut = Tournee.Statut.VALIDEE
            tournee.save()

        Notification.objects.create(
            destinataire=tournee.controleur,
            message=(
                f"Une mission vous est confiée le {tournee.date:%d/%m/%Y} : "
                f"{tournee.missions.count()} sites, environ "
                f"{tournee.distance_estimee_km} km. "
                f"Ordre de mission {om.numero}, ordre de route {ordre_route.numero}."
            ),
        )
        return Response(TourneeSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def refuser(self, request, pk=None):
        """La proposition est abandonnée : les missions redeviennent isolées."""
        self._exiger_directeur(request)
        tournee = self.get_object()
        if tournee.statut != Tournee.Statut.PROPOSEE:
            return Response(
                {"detail": "Seule une mission proposée peut être refusée."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            self._liberer_missions(tournee)
            tournee.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ---- Documents officiels (PDF) -----------------------------------------

    @staticmethod
    def _url_verification(numero):
        """Adresse de la page publique du frontend, ouverte par le QR code."""
        base = str(settings.URL_APPLICATION).rstrip("/")
        return f"{base}/verifier?{urlencode({'numero': numero})}"

    @action(detail=True, methods=["get"], url_path="ordre-mission")
    def ordre_mission_pdf(self, request, pk=None):
        tournee = self.get_object()
        om = getattr(tournee, "ordre_mission", None)
        if om is None:
            raise NotFound("L'ordre de mission n'a pas encore été délivré.")

        carte = getattr(tournee.controleur, "carte_professionnelle", None)
        missions = tournee.missions.select_related("site").order_by("ordre_dans_tournee")
        sites = " ; ".join(
            f"{m.ordre_dans_tournee}. {m.site.nom} ({m.site.get_appartenance_display()})"
            for m in missions
        )
        directeur = om.delivre_par.get_full_name() if om.delivre_par else ""

        pdf = generer_pdf_officiel(
            titre="Ordre de mission",
            numero=om.numero,
            lignes=[
                ("Délivré le", f"{om.date_emission:%d/%m/%Y}"),
                ("Contrôleur", tournee.controleur.get_full_name()),
                ("Carte professionnelle", f"N° {carte.numero}" if carte else "Non enregistrée"),
                ("Date de la mission", f"{tournee.date:%d/%m/%Y}"),
                ("Sites à contrôler", sites),
            ],
            paragraphes=[
                "Le contrôleur désigné ci-dessus est chargé d'effectuer le contrôle des sites "
                "mentionnés. Il doit présenter sa carte professionnelle à son arrivée sur chaque site."
            ],
            url_verification=self._url_verification(om.numero),
            signataire=directeur,
        )
        reponse = HttpResponse(pdf, content_type="application/pdf")
        reponse["Content-Disposition"] = f'inline; filename="{om.numero}.pdf"'
        return reponse

    @action(detail=True, methods=["get"], url_path="ordre-route")
    def ordre_route_pdf(self, request, pk=None):
        tournee = self.get_object()
        ordre_route = getattr(tournee, "ordre_route", None)
        if ordre_route is None:
            raise NotFound("L'ordre de route n'a pas encore été délivré.")

        om = getattr(tournee, "ordre_mission", None)
        directeur = om.delivre_par.get_full_name() if om and om.delivre_par else ""

        pdf = generer_pdf_officiel(
            titre="Ordre de route",
            numero=ordre_route.numero,
            lignes=[
                ("Délivré le", f"{ordre_route.date_emission:%d/%m/%Y}"),
                ("Agent", tournee.controleur.get_full_name()),
                ("Date du déplacement", f"{tournee.date:%d/%m/%Y}"),
                ("Lieu de départ", ordre_route.depart),
                ("Première destination", ordre_route.destination),
                ("Moyen de transport", ordre_route.transport),
                ("Ordre de mission lié", om.numero if om else "-"),
            ],
            paragraphes=[
                "L'agent désigné est autorisé à effectuer le déplacement indiqué "
                "dans le cadre de sa mission de contrôle."
            ],
            url_verification=self._url_verification(ordre_route.numero),
            signataire=directeur,
        )
        reponse = HttpResponse(pdf, content_type="application/pdf")
        reponse["Content-Disposition"] = f'inline; filename="{ordre_route.numero}.pdf"'
        return reponse

    # ---- Vérification publique (cible de la page /verifier) ----------------

    @action(
        detail=False,
        methods=["get"],
        url_path="verifier",
        permission_classes=[AllowAny],
        authentication_classes=[],
        throttle_classes=[VerificationRateThrottle],
    )
    def verifier(self, request):
        """Accessible sans connexion : confirme qu'un numéro de document existe.
        Ne renvoie que le strict minimum (aucun e-mail, téléphone, identifiant interne,
        ni aucune coordonnée GPS). Une fois la mission clôturée, ajoute les heures de
        départ et d'arrivée."""
        numero = (request.query_params.get("numero") or "").strip().upper()
        introuvable = Response(
            {"authentique": False}, status=status.HTTP_404_NOT_FOUND
        )
        # Un numéro mal formé est traité comme inconnu, sans interroger la base
        if not FORMAT_NUMERO.match(numero):
            return introuvable

        document = (
            OrdreMission.objects.select_related(
                "tournee__controleur", "mission__controleur"
            )
            .filter(numero=numero)
            .first()
            or OrdreRoute.objects.select_related("tournee__controleur")
            .filter(numero=numero)
            .first()
        )
        if document is None:
            return introuvable

        controleur, date, missions, portee = contexte_document(document)
        return Response(
            {
                "authentique": True,
                "numero": document.numero,
                "type": "Ordre de mission"
                if isinstance(document, OrdreMission)
                else "Ordre de route",
                "portee": portee,
                "controleur": controleur.get_full_name(),
                "date_tournee": date,
                "delivre_le": document.date_emission,
                # None tant que la mission n'est pas clôturée
                "execution": execution_publique(missions),
            }
        )