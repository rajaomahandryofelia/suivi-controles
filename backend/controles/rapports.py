from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from comptes.permissions import est_directeur
from suivi.notifications import notifier_rapport_traite
from suivi.services import recalculer_score

from .models import Mission, Rapport
from .regles_non_conformites import appliquer_validation


class RapportSerializer(serializers.ModelSerializer):
    site = serializers.IntegerField(source="mission.site_id", read_only=True)
    site_nom = serializers.CharField(source="mission.site.nom", read_only=True)
    controleur_nom = serializers.CharField(
        source="mission.controleur.get_full_name", read_only=True
    )
    date_mission = serializers.DateField(source="mission.date_prevue", read_only=True)
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)
    fichier_pdf = serializers.SerializerMethodField()

    class Meta:
        model = Rapport
        fields = [
            "id",
            "mission",
            "site",
            "site_nom",
            "controleur_nom",
            "date_mission",
            "date_generation",
            "fichier_pdf",
            "score_conformite",
            "statut",
            "statut_libelle",
            "motif_rejet",
            "date_validation",
            "directeur",
        ]
        read_only_fields = fields

    def get_fichier_pdf(self, rapport):
        request = self.context.get("request")
        url = rapport.fichier_pdf.url
        return request.build_absolute_uri(url) if request else url


class RapportRejetSerializer(serializers.Serializer):
    motif = serializers.CharField(max_length=500)


class RapportViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Rapports de mission.

    - Le Directeur voit tous les rapports, les valide ou les rejette.
      Un rejet rouvre la mission (« en cours ») pour que le contrôleur la corrige.
    - Un contrôleur ne voit que les rapports de ses propres missions
      (en lecture seule : il y trouve le PDF, le statut et le motif de rejet).
    """

    serializer_class = RapportSerializer

    def get_queryset(self):
        rapports = Rapport.objects.select_related(
            "mission__site", "mission__controleur"
        ).order_by("-date_generation")

        user = self.request.user
        if not est_directeur(user):
            rapports = rapports.filter(mission__controleur=user)

        # Filtre facultatif : /api/controles/rapports/?statut=GENERE
        statut = self.request.query_params.get("statut")
        if statut:
            rapports = rapports.filter(statut=statut)
        return rapports

    def _exiger_directeur(self, request):
        if not est_directeur(request.user):
            raise PermissionDenied("Seul le Directeur peut traiter un rapport.")

    def _verifier_traitable(self, rapport):
        if rapport.statut != Rapport.Statut.GENERE:
            return Response(
                {"detail": "Ce rapport a déjà été traité."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    @action(detail=True, methods=["post"])
    def valider(self, request, pk=None):
        """Ton `validerRapport(idRapport)` : valide, puis recalcule le score du site."""
        self._exiger_directeur(request)
        rapport = self.get_object()
        erreur = self._verifier_traitable(rapport)
        if erreur:
            return erreur

        rapport.statut = Rapport.Statut.VALIDE
        rapport.directeur = request.user
        rapport.date_validation = timezone.localdate()
        rapport.motif_rejet = ""
        rapport.save()

        # Les corrections annoncées sont vérifiées avec les réponses de ce contrôle,
        # AVANT le calcul du score (une non-conformité vérifiée ne pèse plus)
        appliquer_validation(rapport.mission)

        score = recalculer_score(rapport.mission.site)
        notifier_rapport_traite(rapport)

        return Response(
            {
                "rapport": RapportSerializer(rapport, context={"request": request}).data,
                "score": {
                    "valeur": score.valeur,
                    "niveau": score.niveau,
                    "niveau_libelle": score.get_niveau_display(),
                },
            }
        )

    @action(detail=True, methods=["post"])
    def rejeter(self, request, pk=None):
        """Ton `rejeterRapport(idRapport, motif)`."""
        self._exiger_directeur(request)
        rapport = self.get_object()
        erreur = self._verifier_traitable(rapport)
        if erreur:
            return erreur

        donnees = RapportRejetSerializer(data=request.data)
        donnees.is_valid(raise_exception=True)

        with transaction.atomic():
            rapport.statut = Rapport.Statut.REJETE
            rapport.directeur = request.user
            rapport.date_validation = timezone.localdate()
            rapport.motif_rejet = donnees.validated_data["motif"]
            rapport.save()

            # La mission est rouverte : le contrôleur corrige sa grille puis la clôture
            # de nouveau (la fin réelle est effacée, elle sera enregistrée à la clôture).
            mission = rapport.mission
            mission.statut = Mission.Statut.EN_COURS
            mission.date_fin_reelle = None
            mission.latitude_fin = None
            mission.longitude_fin = None
            mission.save()

        notifier_rapport_traite(rapport)

        return Response(
            RapportSerializer(rapport, context={"request": request}).data
        )