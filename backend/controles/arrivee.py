"""« Je suis arrivé » : le contrôleur enregistre l'heure réelle et sa position GPS sur le site.

Les missions démarrent d'elles-mêmes à l'heure prévue, sans position (voir echeances.py).
Ce geste ajoute la preuve de présence : heure réelle d'arrivée + position GPS de début.
"""

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from comptes.models import Utilisateur
from suivi.models import Notification

from .models import Mission
from .serializers import DemarrageSerializer, MissionSerializer
from .tracabilite import SEUIL_ECART_M, _ecart_m


class ArriveeView(APIView):
    """POST /api/controles/missions/<id>/arrivee/  {latitude, longitude}"""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        mission = get_object_or_404(
            Mission.objects.select_related("site", "controleur"), pk=pk
        )
        if mission.controleur_id != request.user.id:
            raise PermissionDenied("Cette mission ne vous est pas confiée.")
        if mission.statut != Mission.Statut.EN_COURS:
            raise ValidationError(
                {"detail": "L'arrivée s'enregistre sur une mission en cours."}
            )
        if mission.latitude_debut is not None:
            raise ValidationError(
                {"detail": "Votre arrivée sur ce site est déjà enregistrée."}
            )

        position = DemarrageSerializer(data=request.data)
        position.is_valid(raise_exception=True)
        latitude = position.validated_data["latitude"]
        longitude = position.validated_data["longitude"]

        # L'heure du début devient l'heure réelle d'arrivée (et non l'heure prévue)
        mission.latitude_debut = latitude
        mission.longitude_debut = longitude
        mission.date_debut_reelle = timezone.now()
        mission.save(update_fields=["latitude_debut", "longitude_debut", "date_debut_reelle"])

        # Position trop éloignée du site : le Directeur est prévenu
        ecart = _ecart_m(latitude, longitude, mission.site)
        if ecart is not None and ecart > SEUIL_ECART_M:
            message = (
                f"Arrivée éloignée du site « {mission.site.nom} » : "
                f"{mission.controleur.get_full_name() or mission.controleur.username} "
                f"s'est signalé à {ecart} m du site (mission n° {mission.id})."
            )
            for directeur in Utilisateur.objects.filter(
                role=Utilisateur.Role.DIRECTEUR, is_active=True
            ):
                Notification.objects.create(destinataire=directeur, message=message)

        donnees = MissionSerializer(mission).data
        donnees["ecart_m"] = ecart
        return Response(donnees)