"""Trajet du contrôleur pendant une mission : relevé de positions GPS.

POST /api/controles/missions/<id>/trajet/
    {"points": [{"latitude": .., "longitude": .., "precision_m": .., "releve_le": ".."}, ...]}
    Le téléphone envoie ses positions par lots (50 au maximum). Seul le contrôleur
    de la mission peut envoyer.

GET /api/controles/missions/<id>/trajet/
    Le tracé et son résumé. Réservé au Directeur et au contrôleur de la mission.
"""

from datetime import timedelta
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from comptes.models import Utilisateur

from .geotrajet import PAS_MIN_M, alleger, distance_m
from .models import Mission, PointTrajet
from .tracabilite import SEUIL_ECART_M, _ecart_m

# Envoi
TAILLE_LOT_MAX = 50
ANCIENNETE_MAX = timedelta(hours=24)  # un téléphone resté hors réseau peut envoyer plus tard
TOLERANCE_FUTUR = timedelta(minutes=2)  # petit décalage d'horloge du téléphone

# Résumé
TROU_MIN = timedelta(minutes=5)  # silence plus long : le suivi a été interrompu
POINTS_MAX_AFFICHES = 1500  # au-delà, le tracé est allégé pour la carte


class PointSaisieSerializer(serializers.Serializer):
    """Une position relevée par le téléphone."""

    # Les coordonnées sont arrondies à 6 décimales par le serveur : le téléphone n'a pas à le faire
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    precision_m = serializers.FloatField(
        min_value=0, max_value=100000, required=False, allow_null=True
    )
    releve_le = serializers.DateTimeField()


class LotPointsSerializer(serializers.Serializer):
    points = PointSaisieSerializer(many=True, allow_empty=False)

    def validate_points(self, points):
        if len(points) > TAILLE_LOT_MAX:
            raise ValidationError(
                f"Envoyez {TAILLE_LOT_MAX} points au maximum à la fois."
            )
        return points


def _resume(points, site):
    """Distance, durée, silences et approche du site, calculés sur tous les points."""
    if not points:
        return {
            "nb_points": 0,
            "distance_m": 0,
            "debut": None,
            "fin": None,
            "duree_min": 0,
            "trous": [],
            "ecart_min_site_m": None,
            "seuil_ecart_m": SEUIL_ECART_M,
        }

    distance = 0.0
    trous = []
    ecart_min = None

    for i, point in enumerate(points):
        ecart = _ecart_m(point.latitude, point.longitude, site)
        if ecart is not None and (ecart_min is None or ecart < ecart_min):
            ecart_min = ecart

        if i == 0:
            continue
        avant = points[i - 1]
        pas = distance_m(
            float(avant.latitude),
            float(avant.longitude),
            float(point.latitude),
            float(point.longitude),
        )
        if pas >= PAS_MIN_M:
            distance += pas

        silence = point.releve_le - avant.releve_le
        if silence >= TROU_MIN:
            trous.append(
                {
                    "du": avant.releve_le,
                    "au": point.releve_le,
                    "minutes": int(silence.total_seconds() // 60),
                }
            )

    debut, fin = points[0].releve_le, points[-1].releve_le
    return {
        "nb_points": len(points),
        "distance_m": int(round(distance)),
        "debut": debut,
        "fin": fin,
        "duree_min": int((fin - debut).total_seconds() // 60),
        "trous": trous,
        "ecart_min_site_m": ecart_min,
        "seuil_ecart_m": SEUIL_ECART_M,
    }


def _coordonnee(valeur):
    return float(valeur) if valeur is not None else None


class TrajetView(APIView):
    """Envoi (contrôleur) et lecture (Directeur, ou contrôleur de la mission) du trajet."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        mission = get_object_or_404(Mission, pk=pk)
        if mission.controleur_id != request.user.id:
            raise PermissionDenied("Cette mission ne vous est pas confiée.")
        if mission.statut == Mission.Statut.PLANIFIEE:
            raise ValidationError(
                {"detail": "Le trajet s'enregistre une fois la mission commencée."}
            )

        lot = LotPointsSerializer(data=request.data)
        lot.is_valid(raise_exception=True)
        recus = lot.validated_data["points"]

        # Fenêtre de temps acceptée pour l'heure des relevés
        maintenant = timezone.now()
        plus_ancien = maintenant - ANCIENNETE_MAX
        plus_recent = maintenant + TOLERANCE_FUTUR
        if mission.statut == Mission.Statut.CLOTUREE and mission.date_fin_reelle:
            plus_recent = min(plus_recent, mission.date_fin_reelle + TOLERANCE_FUTUR)

        retenus = {}  # un seul point par instant, même dans un lot
        for p in recus:
            quand = p["releve_le"]
            if quand < plus_ancien or quand > plus_recent:
                continue
            precision = p.get("precision_m")
            retenus[quand] = PointTrajet(
                mission=mission,
                latitude=Decimal(f"{p['latitude']:.6f}"),
                longitude=Decimal(f"{p['longitude']:.6f}"),
                precision_m=round(precision) if precision is not None else None,
                releve_le=quand,
            )

        # Un envoi réessayé après une coupure ne crée pas de doublons (contrainte d'unicité)
        avant = mission.points_trajet.count()
        PointTrajet.objects.bulk_create(list(retenus.values()), ignore_conflicts=True)
        enregistres = mission.points_trajet.count() - avant

        return Response(
            {
                "recus": len(recus),
                "enregistres": enregistres,
                "ignores": len(recus) - enregistres,
            }
        )

    def get(self, request, pk):
        mission = get_object_or_404(
            Mission.objects.select_related("site", "controleur"), pk=pk
        )
        est_directeur = request.user.role == Utilisateur.Role.DIRECTEUR
        if not est_directeur and mission.controleur_id != request.user.id:
            raise PermissionDenied("Ce trajet ne vous est pas accessible.")

        points = list(
            mission.points_trajet.only("latitude", "longitude", "precision_m", "releve_le")
        )
        affiches = alleger(points, POINTS_MAX_AFFICHES)
        site = mission.site

        return Response(
            {
                "mission": mission.id,
                "statut": mission.statut,
                "controleur": mission.controleur.get_full_name() or mission.controleur.username,
                "site": {
                    "nom": site.nom,
                    "latitude": _coordonnee(getattr(site, "latitude", None)),
                    "longitude": _coordonnee(getattr(site, "longitude", None)),
                },
                "points": [
                    {
                        "latitude": float(p.latitude),
                        "longitude": float(p.longitude),
                        "precision_m": p.precision_m,
                        "releve_le": p.releve_le,
                    }
                    for p in affiches
                ],
                "allege": len(affiches) < len(points),
                "resume": _resume(points, site),
            }
        )