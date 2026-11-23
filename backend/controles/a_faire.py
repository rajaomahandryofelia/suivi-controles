"""« À faire maintenant » : ce qui attend le Directeur, résumé en un seul appel."""

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from comptes.permissions import est_directeur

from .carte import _fin_prevue
from .models import Mission, NonConformite, Rapport
from .tracabilite import _nom

MAX_ELEMENTS = 3


class AFaireView(APIView):
    """GET /api/controles/a-faire/  (Directeur)"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not est_directeur(request.user):
            raise PermissionDenied("Cette page est réservée au Directeur.")

        maintenant = timezone.now()
        aujourdhui = timezone.localdate()

        # 1. Rapports générés, en attente de validation
        rapports = Rapport.objects.filter(statut=Rapport.Statut.GENERE).select_related(
            "mission__site", "mission__controleur"
        ).order_by("date_generation")
        rapports_elements = [
            {
                "id": r.pk,
                "site": r.mission.site.nom,
                "controleur": _nom(r.mission.controleur),
                "score": r.score_conformite,
            }
            for r in rapports[:MAX_ELEMENTS]
        ]

        # 2. Non-conformités ouvertes dont le délai est dépassé
        en_retard = NonConformite.objects.filter(
            statut=NonConformite.Statut.OUVERTE,
            date_limite_correction__lt=aujourdhui,
        ).select_related("site").order_by("date_limite_correction")
        retard_elements = [
            {
                "id": nc.pk,
                "site": nc.site.nom,
                "description": nc.description[:90],
                "gravite": nc.gravite,
                "gravite_libelle": nc.get_gravite_display(),
                "jours_retard": (aujourdhui - nc.date_limite_correction).days,
            }
            for nc in en_retard[:MAX_ELEMENTS]
        ]

        # 3. Corrections déclarées, à vérifier lors du prochain contrôle
        a_verifier = NonConformite.objects.filter(statut=NonConformite.Statut.CORRIGEE).count()

        # 4. Visites en cours dont l'heure de fin prévue est dépassée
        missions_en_retard = []
        for m in Mission.objects.filter(statut=Mission.Statut.EN_COURS).select_related(
            "site", "controleur"
        ):
            fin = _fin_prevue(m)
            if fin is not None and maintenant > fin:
                missions_en_retard.append(
                    {
                        "mission": m.pk,
                        "site": m.site.nom,
                        "controleur": _nom(m.controleur),
                        "fin_prevue": fin,
                    }
                )
        missions_en_retard.sort(key=lambda x: x["fin_prevue"])

        nombres = {
            "rapports": rapports.count(),
            "non_conformites_retard": en_retard.count(),
            "non_conformites_a_verifier": a_verifier,
            "missions_retard": len(missions_en_retard),
        }
        return Response(
            {
                "total": sum(nombres.values()),
                "rapports": {"nombre": nombres["rapports"], "elements": rapports_elements},
                "non_conformites_retard": {
                    "nombre": nombres["non_conformites_retard"],
                    "elements": retard_elements,
                },
                "non_conformites_a_verifier": {"nombre": a_verifier},
                "missions_retard": {
                    "nombre": nombres["missions_retard"],
                    "elements": missions_en_retard[:MAX_ELEMENTS],
                },
            }
        )