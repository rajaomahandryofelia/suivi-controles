from datetime import datetime

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from comptes.models import Utilisateur
from comptes.permissions import est_directeur
from conventions.services import convention_active_pour
from referentiels.models import ModeleGrille, Site
from suivi.models import Notification

from .models import Mission, Tournee
from .ordres import delivrer_ordres
from .planificateur import calculer_ordre_optimal, estimer_distance_et_duree
from .serializers import verifier_creneau
from .tournees import TourneeSerializer


class EtapeSaisieSerializer(serializers.Serializer):
    """Un site à contrôler dans la mission."""

    site = serializers.PrimaryKeyRelatedField(queryset=Site.objects.all())
    # Facultatif : sinon on prend le modèle de grille actif du type du site
    modele_grille = serializers.PrimaryKeyRelatedField(
        queryset=ModeleGrille.objects.all(), required=False
    )


class AttributionSerializer(serializers.Serializer):
    """Ce que saisit le Directeur pour attribuer une mission (plusieurs sites)."""

    controleur = serializers.PrimaryKeyRelatedField(queryset=Utilisateur.objects.all())
    date_prevue = serializers.DateField()
    heure_prevue = serializers.TimeField()
    date_fin_prevue = serializers.DateField()
    heure_fin_prevue = serializers.TimeField()
    etapes = EtapeSaisieSerializer(many=True, allow_empty=False)
    derogation_convention = serializers.BooleanField(default=False)
    motif_derogation = serializers.CharField(
        max_length=500, required=False, allow_blank=True
    )
    # Obligatoires : la mission est validée tout de suite (ordre de mission et
    # ordre de route délivrés, contrôleur prévenu). Sans ordre, une mission
    # démarrerait seule à l'heure prévue sans pièce officielle.
    depart = serializers.CharField(max_length=255)
    transport = serializers.CharField(max_length=100)

    def validate_date_prevue(self, valeur):
        if valeur < timezone.localdate():
            raise serializers.ValidationError("La date prévue ne peut pas être passée.")
        return valeur

    def validate_controleur(self, controleur):
        if controleur.role != Utilisateur.Role.CONTROLEUR or not controleur.is_active:
            raise serializers.ValidationError("Ce contrôleur n'est pas disponible.")
        return controleur

    def validate(self, donnees):
        verifier_creneau(
            donnees["date_prevue"],
            donnees["heure_prevue"],
            donnees["date_fin_prevue"],
            donnees["heure_fin_prevue"],
        )

        if Tournee.objects.filter(
            controleur=donnees["controleur"], date=donnees["date_prevue"]
        ).exists():
            raise serializers.ValidationError(
                {
                    "controleur": (
                        "Ce contrôleur a déjà une mission ce jour-là. "
                        "Refusez-la ou choisissez une autre date."
                    )
                }
            )

        erreurs = []
        sites_vus = set()
        derogation_utilisee = False

        for etape in donnees["etapes"]:
            site = etape["site"]
            nom = site.nom

            if site.pk in sites_vus:
                erreurs.append(f"{nom} : ce site est indiqué deux fois.")
                continue
            sites_vus.add(site.pk)

            if not site.est_actif:
                erreurs.append(f"{nom} : ce site n'est plus suivi.")
                continue
            if site.latitude is None or site.longitude is None:
                erreurs.append(
                    f"{nom} : ce site n'a pas de coordonnées GPS "
                    "(nécessaires pour calculer l'itinéraire)."
                )
                continue

            # Modèle de grille : celui choisi, sinon le modèle actif du type du site
            modele = etape.get("modele_grille")
            if modele is None:
                modele = next(
                    (
                        m
                        for m in ModeleGrille.objects.filter(
                            type_site_id=site.type_site_id, est_actif=True
                        ).order_by("id")
                        if m.criteres.exists()
                    ),
                    None,
                )
                if modele is None:
                    erreurs.append(f"{nom} : aucun modèle de grille actif pour ce type de site.")
                    continue
            else:
                if not modele.est_actif:
                    erreurs.append(f"{nom} : ce modèle de grille n'est plus utilisable.")
                    continue
                if modele.type_site_id != site.type_site_id:
                    erreurs.append(f"{nom} : ce modèle ne correspond pas au type du site.")
                    continue
                if not modele.criteres.exists():
                    erreurs.append(f"{nom} : ce modèle ne contient aucun critère.")
                    continue
            etape["modele_grille"] = modele

            # RG39 : convention active exigée, sauf dérogation motivée du Directeur
            etape["derogation"] = False
            if site.partenaire_id and not convention_active_pour(
                site, donnees["date_prevue"]
            ):
                if donnees.get("derogation_convention"):
                    etape["derogation"] = True
                    derogation_utilisee = True
                else:
                    erreurs.append(
                        f"{nom} : ce partenaire n'a pas de convention active pour ce site. "
                        "Le Directeur peut passer outre en indiquant un motif."
                    )

        if erreurs:
            raise serializers.ValidationError({"etapes": erreurs})

        if derogation_utilisee and not donnees.get("motif_derogation", "").strip():
            raise serializers.ValidationError(
                {"motif_derogation": "Indiquez le motif de la dérogation."}
            )

        erreurs_route = {}
        if not donnees["depart"].strip():
            erreurs_route["depart"] = "Indiquez le point de départ."
        if not donnees["transport"].strip():
            erreurs_route["transport"] = "Indiquez le moyen de transport."
        if erreurs_route:
            raise serializers.ValidationError(erreurs_route)
        return donnees


class AttribuerMissionView(APIView):
    """Le Directeur attribue une mission : un contrôleur, un créneau et plusieurs
    sites en une seule action. Le système calcule l'itinéraire optimal."""

    def post(self, request):
        if not est_directeur(request.user):
            raise PermissionDenied("Seul le Directeur peut attribuer une mission.")

        serializer = AttributionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        depart = d["depart"].strip()
        transport = d["transport"].strip()

        with transaction.atomic():
            missions = []
            for etape in d["etapes"]:
                missions.append(
                    Mission.objects.create(
                        directeur=request.user,
                        controleur=d["controleur"],
                        site=etape["site"],
                        modele_grille=etape["modele_grille"],
                        date_prevue=d["date_prevue"],
                        heure_prevue=d["heure_prevue"],
                        date_fin_prevue=d["date_fin_prevue"],
                        heure_fin_prevue=d["heure_fin_prevue"],
                        derogation_convention=etape["derogation"],
                        motif_derogation=(
                            d.get("motif_derogation", "").strip() if etape["derogation"] else ""
                        ),
                    )
                )

            # Itinéraire : plus proche voisin pondéré par le risque
            ordre = calculer_ordre_optimal(missions)
            distance, duree = estimer_distance_et_duree(ordre)

            tournee = Tournee.objects.create(
                date=d["date_prevue"],
                controleur=d["controleur"],
                distance_estimee_km=distance,
                duree_estimee_min=duree,
            )
            for rang, mission in enumerate(ordre, start=1):
                mission.tournee = tournee
                mission.ordre_dans_tournee = rang
                mission.save(update_fields=["tournee", "ordre_dans_tournee"])

            # Refuse (400) si carte absente ou expirée : tout est alors annulé
            om, ordre_route = delivrer_ordres(tournee, request.user, depart, transport)
            tournee.statut = Tournee.Statut.VALIDEE
            tournee.save()

        Notification.objects.create(
            destinataire=tournee.controleur,
            message=(
                f"Une mission vous est confiée le {tournee.date:%d/%m/%Y} : "
                f"{len(ordre)} sites, environ {tournee.distance_estimee_km} km. "
                f"Ordre de mission {om.numero}, ordre de route {ordre_route.numero}."
            ),
        )

        # On relit la tournée pour renvoyer les pièces fraîchement créées
        tournee = Tournee.objects.get(pk=tournee.pk)
        return Response(TourneeSerializer(tournee).data, status=status.HTTP_201_CREATED)