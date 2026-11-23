from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from comptes.permissions import est_directeur
from referentiels.serializers import CritereControleSerializer
from suivi.models import Notification
from suivi.notifications import notifier_mission_creee

from .documents import generer_pdf_officiel
from .echeances import _debut, appliquer_echeances
from .gestion_missions import GestionMissionMixin
from .models import Mission, ReponseCritere, Tournee
from .ordres import delivrer_ordre_mission, ordre_mission_de, url_verification
from .serializers import (
    DemarrageSerializer,
    GrilleSoumissionSerializer,
    MissionCreationSerializer,
    MissionSerializer,
    PhotoSerializer,
    ReponseCritereSerializer,
)
from .services import (
    calculer_score_conformite,
    criteres_non_conformes_sans_photo,
    criteres_obligatoires_manquants,
    generer_rapport_pdf,
)


class MissionViewSet(
    GestionMissionMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Missions de contrôle.

    - Le Directeur voit toutes les missions, en crée, les modifie et les supprime
      tant qu'elles sont planifiées.
    - Un contrôleur ne voit que ses propres missions.
    """

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # Les missions dont l'heure de début ou de fin est arrivée changent d'état toutes seules
        appliquer_echeances()

    def get_queryset(self):
        missions = Mission.objects.select_related(
            "site",
            "controleur",
            "controleur__carte_professionnelle",
            "modele_grille",
            "ordre_mission",
            "tournee__ordre_mission",
        )
        user = self.request.user
        if not est_directeur(user):
            missions = missions.filter(controleur=user)

        # Filtre facultatif : /api/controles/missions/?statut=PLANIFIEE
        statut = self.request.query_params.get("statut")
        if statut:
            missions = missions.filter(statut=statut)
        return missions

    def get_serializer_class(self):
        if self.action == "create":
            return MissionCreationSerializer
        return MissionSerializer

    def _verifier_controleur(self, mission, request):
        """Seul le contrôleur à qui la mission est confiée agit dessus."""
        if mission.controleur_id != request.user.id:
            raise PermissionDenied("Cette mission ne vous est pas confiée.")

    def _verifier_ouverture(self, mission):
        """Rien ne se fait sur une mission avant son heure de début prévue."""
        if mission.heure_prevue is None:
            return
        debut = _debut(mission)
        if timezone.now() < debut:
            raise ValidationError(
                {
                    "detail": (
                        "Cette mission n'est pas encore ouverte : elle commence le "
                        f"{timezone.localtime(debut):%d/%m/%Y à %H:%M}."
                    )
                }
            )

    def _verifier_pieces(self, mission):
        """Pièces officielles exigées avant de partir en contrôle :
        - carte professionnelle valide ;
        - mission dans une tournée : tournée validée, ordre de mission et
          ordre de route de la tournée ;
        - mission isolée : son propre ordre de mission (pas d'ordre de route,
          il ne concerne que les déplacements d'une tournée)."""
        carte = getattr(mission.controleur, "carte_professionnelle", None)
        if carte is None:
            raise ValidationError(
                {"detail": "Vous n'avez pas de carte professionnelle enregistrée."}
            )
        if not carte.est_valide_le(mission.date_prevue):
            raise ValidationError(
                {"detail": "Votre carte professionnelle est expirée ou pas encore valable."}
            )

        if mission.tournee_id:
            tournee = mission.tournee
            if tournee.statut != Tournee.Statut.VALIDEE:
                raise ValidationError(
                    {"detail": "La tournée de cette mission n'est pas encore validée."}
                )
            if not hasattr(tournee, "ordre_mission"):
                raise ValidationError(
                    {"detail": "L'ordre de mission n'a pas été délivré pour cette tournée."}
                )
            if not hasattr(tournee, "ordre_route"):
                raise ValidationError(
                    {"detail": "L'ordre de route n'a pas été délivré pour cette tournée."}
                )
        elif ordre_mission_de(mission) is None:
            raise ValidationError(
                {"detail": "Aucun ordre de mission n'a été délivré pour cette mission."}
            )

    # ---- Créer une mission -------------------------------------------------

    def create(self, request, *args, **kwargs):
        # Seul le Directeur crée des missions
        if not est_directeur(request.user):
            raise PermissionDenied("Seul le Directeur peut créer une mission.")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mission = serializer.save(directeur=request.user)

        # Le contrôleur est prévenu dans sa cloche
        notifier_mission_creee(mission)

        return Response(
            MissionSerializer(mission).data, status=status.HTTP_201_CREATED
        )

    # ---- Ordre de mission d'une mission isolée -----------------------------

    @action(detail=True, methods=["post"], url_path="delivrer-ordre")
    def delivrer_ordre(self, request, pk=None):
        """Le Directeur délivre l'ordre de mission d'une mission hors tournée."""
        if not est_directeur(request.user):
            raise PermissionDenied("Réservé au Directeur.")
        mission = self.get_object()

        ordre = delivrer_ordre_mission(mission, request.user)

        Notification.objects.create(
            destinataire=mission.controleur,
            message=(
                f"Un ordre de mission vous a été délivré pour le contrôle de "
                f"{mission.site.nom} le {mission.date_prevue:%d/%m/%Y} : {ordre.numero}."
            ),
        )
        # On relit la mission pour renvoyer l'ordre fraîchement créé
        return Response(MissionSerializer(self.get_object()).data)

    @action(detail=True, methods=["get"], url_path="ordre-mission")
    def ordre_mission_pdf(self, request, pk=None):
        """PDF de l'ordre de mission propre à une mission isolée
        (celui d'une tournée se télécharge depuis la tournée)."""
        mission = self.get_object()
        om = getattr(mission, "ordre_mission", None)
        if om is None:
            raise NotFound("Aucun ordre de mission propre n'a été délivré pour cette mission.")

        site = mission.site
        carte = getattr(mission.controleur, "carte_professionnelle", None)
        directeur = om.delivre_par.get_full_name() if om.delivre_par else ""
        quand = f"{mission.date_prevue:%d/%m/%Y}"
        if mission.heure_prevue:
            quand += f" à {mission.heure_prevue:%H:%M}"

        pdf = generer_pdf_officiel(
            titre="Ordre de mission",
            numero=om.numero,
            lignes=[
                ("Délivré le", f"{om.date_emission:%d/%m/%Y}"),
                ("Contrôleur", mission.controleur.get_full_name()),
                ("Carte professionnelle", f"N° {carte.numero}" if carte else "Non enregistrée"),
                ("Date de la mission", quand),
                ("Site à contrôler", f"{site.nom} ({site.get_appartenance_display()})"),
                ("Localisation", site.localisation),
            ],
            paragraphes=[
                "Le contrôleur désigné ci-dessus est chargé d'effectuer le contrôle du site "
                "mentionné. Il doit présenter sa carte professionnelle à son arrivée sur le site."
            ],
            url_verification=url_verification(om.numero),
            signataire=directeur,
        )
        reponse = HttpResponse(pdf, content_type="application/pdf")
        reponse["Content-Disposition"] = f'inline; filename="{om.numero}.pdf"'
        return reponse

    # ---- Démarrer une mission ----------------------------------------------

    @action(detail=True, methods=["post"])
    def demarrer(self, request, pk=None):
        """Démarrer une mission : enregistre l'heure et la position GPS."""
        mission = self.get_object()
        self._verifier_controleur(mission, request)
        self._verifier_ouverture(mission)

        if mission.statut != Mission.Statut.PLANIFIEE:
            return Response(
                {"detail": "Seule une mission planifiée peut être démarrée."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Carte professionnelle, ordre de mission (et ordre de route pour une tournée)
        self._verifier_pieces(mission)

        position = DemarrageSerializer(data=request.data)
        position.is_valid(raise_exception=True)

        mission.statut = Mission.Statut.EN_COURS
        mission.date_debut_reelle = timezone.now()
        mission.latitude_debut = position.validated_data["latitude"]
        mission.longitude_debut = position.validated_data["longitude"]
        mission.save()

        return Response(MissionSerializer(mission).data)

    # ---- Remplir la grille de contrôle -------------------------------------

    @action(detail=True, methods=["get", "post"])
    def grille(self, request, pk=None):
        """GET : ouvrir la grille (critères + réponses déjà saisies).
        POST : soumettre les réponses."""
        mission = self.get_object()

        if request.method == "GET":
            # Un contrôleur n'ouvre pas la grille avant l'heure de début prévue
            if not est_directeur(request.user):
                self._verifier_ouverture(mission)
            criteres = mission.modele_grille.criteres.all()
            reponses = mission.reponses.select_related("critere").prefetch_related(
                "photos"
            )
            return Response(
                {
                    "mission": MissionSerializer(mission).data,
                    "criteres": CritereControleSerializer(criteres, many=True).data,
                    "reponses": ReponseCritereSerializer(reponses, many=True).data,
                }
            )

        # POST : soumettreGrille
        self._verifier_controleur(mission, request)
        self._verifier_ouverture(mission)
        if mission.statut != Mission.Statut.EN_COURS:
            return Response(
                {"detail": "La grille ne se remplit que pendant une mission en cours."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = GrilleSoumissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        saisies = serializer.validated_data["reponses"]

        # Ton `verifierDonneesControle()`
        deja_vus = set()
        for saisie in saisies:
            critere = saisie["critere"]
            if critere.modele_id != mission.modele_grille_id:
                return Response(
                    {"detail": f"Le critère {critere.id} n'appartient pas à cette grille."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if critere.id in deja_vus:
                return Response(
                    {"detail": f"Le critère {critere.id} est répondu deux fois."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            deja_vus.add(critere.id)

        # Ton `enregistrerControle()`
        with transaction.atomic():
            for saisie in saisies:
                ReponseCritere.objects.update_or_create(
                    mission=mission,
                    critere=saisie["critere"],
                    defaults={
                        "valeur": saisie["valeur"],
                        "est_conforme": saisie["est_conforme"],
                        "commentaire": saisie.get("commentaire", ""),
                    },
                )

        reponses = mission.reponses.select_related("critere").prefetch_related("photos")
        return Response(ReponseCritereSerializer(reponses, many=True).data)

    # ---- Joindre une photo -------------------------------------------------

    @action(
        detail=True,
        methods=["post"],
        parser_classes=[MultiPartParser, FormParser],
    )
    def photos(self, request, pk=None):
        """Joindre une photo à une réponse de la grille."""
        mission = self.get_object()
        self._verifier_controleur(mission, request)
        self._verifier_ouverture(mission)

        try:
            reponse = mission.reponses.get(pk=request.data.get("reponse"))
        except (ReponseCritere.DoesNotExist, ValueError, TypeError):
            return Response(
                {"detail": "Réponse introuvable : enregistre d'abord la grille."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PhotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # L'heure vient du serveur : elle fait foi, le téléphone ne peut pas la modifier
        photo = serializer.save(reponse=reponse, date_capture=timezone.now())
        return Response(PhotoSerializer(photo).data, status=status.HTTP_201_CREATED)

    # ---- Clôturer une mission ----------------------------------------------

    @action(detail=True, methods=["get"])
    def recapitulatif(self, request, pk=None):
        """Ton `afficherRecapitulatifMission()` : où en est la mission avant clôture."""
        mission = self.get_object()
        manquants = criteres_obligatoires_manquants(mission)
        sans_photo = criteres_non_conformes_sans_photo(mission)

        return Response(
            {
                "mission": MissionSerializer(mission).data,
                "nb_criteres": mission.modele_grille.criteres.count(),
                "nb_reponses": mission.reponses.count(),
                "criteres_manquants": CritereControleSerializer(manquants, many=True).data,
                # Critères non conformes pour lesquels aucune photo n'a été jointe
                "criteres_sans_photo": CritereControleSerializer(sans_photo, many=True).data,
                "score_provisoire": calculer_score_conformite(mission),
                "peut_etre_cloturee": (
                    mission.statut == Mission.Statut.EN_COURS
                    and not manquants.exists()
                    and not sans_photo.exists()
                ),
            }
        )

    @action(detail=True, methods=["post"])
    def cloturer(self, request, pk=None):
        """Clôturer la mission : vérifie, enregistre la fin, génère le rapport PDF."""
        mission = self.get_object()
        self._verifier_controleur(mission, request)
        self._verifier_ouverture(mission)

        if mission.statut != Mission.Statut.EN_COURS:
            return Response(
                {"detail": "Seule une mission en cours peut être clôturée."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        position = DemarrageSerializer(data=request.data)
        position.is_valid(raise_exception=True)

        # Ton `verifierDonneesMission()` -> branche « données incomplètes »
        manquants = criteres_obligatoires_manquants(mission)
        if manquants.exists():
            return Response(
                {
                    "detail": "Des critères obligatoires n'ont pas de réponse.",
                    "criteres_manquants": CritereControleSerializer(manquants, many=True).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Chaque constat de non-conformité doit être prouvé par au moins une photo
        sans_photo = criteres_non_conformes_sans_photo(mission)
        if sans_photo.exists():
            return Response(
                {
                    "detail": (
                        "Ajoutez au moins une photo pour chaque critère non conforme "
                        "avant de clôturer."
                    ),
                    "criteres_sans_photo": CritereControleSerializer(sans_photo, many=True).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Branche « données complètes » : cloturerMission() puis genererRapportPDF()
        with transaction.atomic():
            mission.statut = Mission.Statut.CLOTUREE
            mission.date_fin_reelle = timezone.now()
            mission.latitude_fin = position.validated_data["latitude"]
            mission.longitude_fin = position.validated_data["longitude"]
            mission.save()
            rapport = generer_rapport_pdf(mission)

        return Response(
            {
                "mission": MissionSerializer(mission).data,
                "rapport": {
                    "id": rapport.id,
                    "score_conformite": rapport.score_conformite,
                    "statut": rapport.statut,
                    "fichier_pdf": request.build_absolute_uri(rapport.fichier_pdf.url),
                },
            }
        )