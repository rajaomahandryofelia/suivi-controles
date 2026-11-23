from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from comptes.models import Utilisateur
from comptes.permissions import est_directeur
from suivi.notifications import notifier_mission_modifiee, notifier_mission_supprimee

from .models import Mission
from .serializers import MissionSerializer, verifier_creneau


def _a_ordre_propre(mission):
    """Vrai si un ordre de mission a été délivré pour cette mission isolée
    (et non via sa tournée)."""
    return getattr(mission, "ordre_mission", None) is not None


class MissionModificationSerializer(serializers.ModelSerializer):
    """Les données que le Directeur peut changer sur une mission planifiée."""

    class Meta:
        model = Mission
        fields = [
            "site",
            "controleur",
            "modele_grille",
            "date_prevue",
            "heure_prevue",
            "date_fin_prevue",
            "heure_fin_prevue",
        ]

    def validate_date_prevue(self, valeur):
        # Une date inchangée reste acceptée, même si elle est maintenant passée
        if self.instance and valeur == self.instance.date_prevue:
            return valeur
        if valeur < timezone.localdate():
            raise serializers.ValidationError("La date prévue ne peut pas être passée.")
        return valeur

    def validate(self, donnees):
        mission = self.instance

        # L'ordre de mission est un document officiel nominatif (contrôleur, site,
        # date) : on ne change plus ces trois éléments une fois l'ordre délivré.
        if _a_ordre_propre(mission):
            raisons = {
                "controleur": "Le contrôleur ne peut plus changer : l'ordre de mission est déjà délivré.",
                "site": "Le site ne peut plus changer : l'ordre de mission est déjà délivré.",
                "date_prevue": "La date ne peut plus changer : l'ordre de mission est déjà délivré.",
            }
            erreurs = {
                nom: message
                for nom, message in raisons.items()
                if nom in donnees and donnees[nom] != getattr(mission, nom)
            }
            if erreurs:
                raise serializers.ValidationError(erreurs)

        def valeur(nom):
            return donnees.get(nom, getattr(mission, nom))

        site = valeur("site")
        modele = valeur("modele_grille")
        controleur = valeur("controleur")

        if "site" in donnees and not site.est_actif:
            raise serializers.ValidationError({"site": "Ce site n'est plus suivi."})
        if "modele_grille" in donnees and not modele.est_actif:
            raise serializers.ValidationError(
                {"modele_grille": "Ce modèle de grille n'est plus utilisable."}
            )
        if modele.type_site_id != site.type_site_id:
            raise serializers.ValidationError(
                {"modele_grille": "Ce modèle ne correspond pas au type du site."}
            )
        if "modele_grille" in donnees and not modele.criteres.exists():
            raise serializers.ValidationError(
                {"modele_grille": "Ce modèle ne contient aucun critère."}
            )
        if "controleur" in donnees and (
            controleur.role != Utilisateur.Role.CONTROLEUR or not controleur.is_active
        ):
            raise serializers.ValidationError(
                {"controleur": "Ce contrôleur n'est pas disponible."}
            )

        date_debut = valeur("date_prevue")
        heure_debut = valeur("heure_prevue")
        date_fin = valeur("date_fin_prevue")
        heure_fin = valeur("heure_fin_prevue")

        # Ancienne mission sans créneau complet et non touchée : on ne bloque pas
        if any(v is not None for v in (heure_debut, date_fin, heure_fin)):
            debut_change = any(
                nom in donnees and donnees[nom] != getattr(mission, nom)
                for nom in ("date_prevue", "heure_prevue")
            )
            verifier_creneau(
                date_debut, heure_debut, date_fin, heure_fin, verifier_passe=debut_change
            )
        return donnees


class GestionMissionMixin:
    """Modifier et supprimer une mission : Directeur seulement,
    et seulement tant qu'elle est planifiée."""

    def _verifier_modifiable(self, request, mission, verbe):
        if not est_directeur(request.user):
            raise PermissionDenied("Seul le Directeur peut modifier ou supprimer une mission.")
        if mission.statut != Mission.Statut.PLANIFIEE:
            raise serializers.ValidationError(
                f"Une mission démarrée ou clôturée ne peut plus être {verbe} : "
                "l'historique est conservé."
            )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        mission = self.get_object()
        self._verifier_modifiable(request, mission, "modifiée")

        # Ce qu'il faut savoir « d'avant » pour prévenir le bon contrôleur
        ancien_controleur = mission.controleur
        ancien_site_nom = mission.site.nom
        ancienne_date = mission.date_prevue

        serializer = MissionModificationSerializer(
            mission, data=request.data, partial=partial
        )
        serializer.is_valid(raise_exception=True)
        mission = serializer.save()

        notifier_mission_modifiee(mission, ancien_controleur, ancien_site_nom, ancienne_date)
        return Response(MissionSerializer(mission).data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        mission = self.get_object()
        self._verifier_modifiable(request, mission, "supprimée")

        # Un ordre délivré est conservé au registre : sa suppression ferait
        # disparaître un numéro officiel déjà imprimé ou remis au contrôleur.
        if _a_ordre_propre(mission):
            raise serializers.ValidationError(
                "Cette mission ne peut pas être supprimée : son ordre de mission "
                f"{mission.ordre_mission.numero} a déjà été délivré."
            )

        controleur = mission.controleur
        site_nom = mission.site.nom
        date_prevue = mission.date_prevue

        mission.delete()
        notifier_mission_supprimee(controleur, site_nom, date_prevue)
        return Response(status=status.HTTP_204_NO_CONTENT)