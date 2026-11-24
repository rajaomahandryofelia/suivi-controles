from collections import Counter

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import Incident, ids_incidents_recurrents
from .permissions import EstDirecteur
from .serializers import (
    IncidentSerializer,
    PieceJointeIncidentSerializer,
    RetablissementSerializer,
)


class IncidentViewSet(ModelViewSet):
    """Les incidents et interruptions de diffusion.

    - Tout utilisateur connecté peut consulter, déclarer un incident et joindre
      des preuves.
    - Seul le Directeur peut modifier, supprimer ou rétablir un incident.

    Filtres de la liste (paramètres d'URL, tous facultatifs) :
    statut, site, service, type, gravite, mois (format AAAA-MM).
    """

    serializer_class = IncidentSerializer

    def get_queryset(self):
        incidents = Incident.objects.select_related(
            "site", "element", "declare_par", "retabli_par"
        ).prefetch_related("pieces_jointes", "pieces_jointes__ajoutee_par")

        # Les filtres ne s'appliquent qu'à la liste
        if self.action != "list":
            return incidents

        parametres = self.request.query_params
        for champ in ("statut", "site", "service", "type", "gravite"):
            valeur = parametres.get(champ)
            if valeur:
                incidents = incidents.filter(**{champ: valeur})

        mois = parametres.get("mois")
        if mois:
            try:
                annee, numero = (int(partie) for partie in mois.split("-"))
                incidents = incidents.filter(
                    date_debut__year=annee, date_debut__month=numero
                )
            except ValueError:
                pass  # format invalide : on ignore le filtre
        return incidents

    def get_permissions(self):
        if self.action in ("update", "partial_update", "destroy", "retablir"):
            return [IsAuthenticated(), EstDirecteur()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(declare_par=self.request.user)

    @action(detail=True, methods=["post"], url_path="retablir")
    def retablir(self, request, pk=None):
        """Le Directeur marque l'incident comme rétabli."""
        incident = self.get_object()
        if incident.statut == Incident.Statut.RETABLI:
            return Response(
                {"detail": "Cet incident est déjà rétabli."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entree = RetablissementSerializer(
            data=request.data, context={"incident": incident}
        )
        entree.is_valid(raise_exception=True)

        incident.statut = Incident.Statut.RETABLI
        incident.date_retablissement = (
            entree.validated_data.get("date_retablissement") or timezone.now()
        )
        incident.retabli_par = request.user
        if "observations" in entree.validated_data:
            incident.observations = entree.validated_data["observations"]
        incident.save()

        return Response(self.get_serializer(incident).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="pieces",
        parser_classes=[MultiPartParser, FormParser],
    )
    def ajouter_piece(self, request, pk=None):
        """Joint une preuve (photo, capture d'écran, PDF) à l'incident."""
        incident = self.get_object()
        serializer = PieceJointeIncidentSerializer(
            data=request.data, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(incident=incident, ajoutee_par=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="statistiques")
    def statistiques(self, request):
        """Les indicateurs du tableau de bord pour le mois en cours."""
        maintenant = timezone.localtime()
        debut_mois = maintenant.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )

        ce_mois = list(
            Incident.objects.filter(date_debut__gte=debut_mois).select_related("site")
        )
        recurrents = ids_incidents_recurrents()

        # Par site : nombre d'incidents et durée cumulée
        par_site = {}
        for incident in ce_mois:
            ligne = par_site.setdefault(
                incident.site_id,
                {"site_id": incident.site_id, "site_nom": incident.site.nom,
                 "nombre": 0, "duree_minutes": 0},
            )
            ligne["nombre"] += 1
            ligne["duree_minutes"] += incident.duree_minutes

        plus_touches = sorted(
            par_site.values(),
            key=lambda ligne: (-ligne["nombre"], -ligne["duree_minutes"]),
        )[:5]

        return Response(
            {
                "mois": f"{maintenant:%Y-%m}",
                "incidents_ce_mois": len(ce_mois),
                # Tous les incidents encore en cours, quel que soit leur mois
                "non_resolus": Incident.objects.filter(
                    statut=Incident.Statut.EN_COURS
                ).count(),
                "sites_concernes": len(par_site),
                "duree_totale_minutes": sum(i.duree_minutes for i in ce_mois),
                "recurrents": sum(1 for i in ce_mois if i.id in recurrents),
                "par_type": dict(Counter(i.type for i in ce_mois)),
                "sites_les_plus_touches": plus_touches,
            }
        )