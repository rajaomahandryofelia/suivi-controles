from django.db import transaction
from django.db.models import Count, Max, Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from comptes.permissions import DirecteurOuLectureSeule
from controles.models import Mission, NonConformite

from .models import (
    CritereControle,
    ElementInventaire,
    ModeleGrille,
    ParametreScore,
    Partenaire,
    Site,
    TypeSite,
)
from .serializers import (
    CritereControleSerializer,
    ElementInventaireSerializer,
    MissionHistoriqueSerializer,
    ModeleGrilleSerializer,
    NonConformiteHistoriqueSerializer,
    ParametreScoreSerializer,
    PartenaireSerializer,
    SiteSerializer,
    TypeSiteSerializer,
)


class BaseReferentielViewSet(viewsets.ModelViewSet):
    """Tout le monde consulte ; seul le Directeur modifie."""

    permission_classes = [DirecteurOuLectureSeule]


class PartenaireViewSet(BaseReferentielViewSet):
    # Requis par le routeur pour nommer les routes ; la vraie requête est dans get_queryset()
    queryset = Partenaire.objects.all()
    serializer_class = PartenaireSerializer

    def get_queryset(self):
        # Nombre de sites de chaque partenaire, calculé en une seule requête SQL
        return Partenaire.objects.annotate(nombre_sites=Count("sites")).order_by("nom")

    def destroy(self, request, *args, **kwargs):
        """Un partenaire qui a encore des sites ne se supprime pas."""
        partenaire = self.get_object()
        if partenaire.sites.exists():
            raise ValidationError(
                "Ce partenaire a encore des sites : retirez-le de ses sites avant de le supprimer."
            )
        return super().destroy(request, *args, **kwargs)


class TypeSiteViewSet(BaseReferentielViewSet):
    # Requis par le routeur pour nommer les routes ; la vraie requête est dans get_queryset()
    queryset = TypeSite.objects.all()
    serializer_class = TypeSiteSerializer

    def get_queryset(self):
        # Nombre de sites et de modèles de grille de chaque type, en une seule requête SQL
        return TypeSite.objects.annotate(
            nombre_sites=Count("sites", distinct=True),
            nombre_modeles=Count("modeles_grille", distinct=True),
        ).order_by("libelle")

    def destroy(self, request, *args, **kwargs):
        """Un type qui a encore des sites ou des modèles de grille ne se supprime pas."""
        type_site = self.get_object()
        if type_site.sites.exists() or type_site.modeles_grille.exists():
            raise ValidationError(
                "Ce type est encore utilisé par des sites ou des modèles de grille : il ne peut pas être supprimé."
            )
        return super().destroy(request, *args, **kwargs)


class SiteViewSet(BaseReferentielViewSet):
    # Requis par le routeur pour nommer les routes ; la vraie requête est dans get_queryset()
    queryset = Site.objects.all()
    serializer_class = SiteSerializer
    filterset_fields = ["type_site", "est_actif", "partenaire"]

    def get_queryset(self):
        # Une seule requête SQL : on compte les contrôles (missions clôturées), les
        # non-conformités ouvertes et on récupère la date du dernier contrôle.
        # distinct=True évite de compter deux fois à cause des jointures multiples.
        return (
            Site.objects.select_related("type_site", "partenaire")
            .prefetch_related("elements")
            .annotate(
                nombre_controles=Count(
                    "missions",
                    filter=Q(missions__statut=Mission.Statut.CLOTUREE),
                    distinct=True,
                ),
                non_conformites_ouvertes=Count(
                    "non_conformites",
                    filter=Q(non_conformites__statut=NonConformite.Statut.OUVERTE),
                    distinct=True,
                ),
                dernier_controle=Max(
                    "missions__date_fin_reelle",
                    filter=Q(missions__statut=Mission.Statut.CLOTUREE),
                ),
            )
            .order_by("nom")
        )

    def destroy(self, request, *args, **kwargs):
        """Un site déjà contrôlé ne se supprime pas : on le désactive (l'historique est conservé)."""
        site = self.get_object()
        if site.missions.exists() or site.non_conformites.exists():
            raise ValidationError(
                "Ce site a un historique de contrôles : désactivez-le au lieu de le supprimer."
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["get"])
    def historique(self, request, pk=None):
        """Fiche d'un site : ses missions et ses non-conformités, les plus récentes d'abord."""
        site = self.get_object()
        missions = site.missions.select_related("controleur", "rapport").order_by(
            "-date_prevue", "-heure_prevue"
        )
        non_conformites = site.non_conformites.order_by("-date_detection", "-id")
        return Response(
            {
                "missions": MissionHistoriqueSerializer(missions, many=True).data,
                "non_conformites": NonConformiteHistoriqueSerializer(
                    non_conformites, many=True
                ).data,
            }
        )


class ElementInventaireViewSet(BaseReferentielViewSet):
    queryset = ElementInventaire.objects.all().order_by("site", "type")
    serializer_class = ElementInventaireSerializer


class ModeleGrilleViewSet(BaseReferentielViewSet):
    # Requis par le routeur pour nommer les routes ; la vraie requête est dans get_queryset()
    queryset = ModeleGrille.objects.all()
    serializer_class = ModeleGrilleSerializer

    def get_queryset(self):
        return (
            ModeleGrille.objects.select_related("type_site")
            .prefetch_related("criteres")
            .annotate(nombre_missions=Count("missions", distinct=True))
            .order_by("nom")
        )

    def destroy(self, request, *args, **kwargs):
        """Un modèle déjà utilisé par des missions ne se supprime pas : on le désactive."""
        modele = self.get_object()
        if modele.missions.exists():
            raise ValidationError(
                "Ce modèle est utilisé par des missions : désactivez-le au lieu de le supprimer."
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def reordonner(self, request, pk=None):
        """Remet les critères dans l'ordre donné : {"ordre": [id, id, ...]}."""
        modele = self.get_object()
        try:
            ids = [int(i) for i in request.data.get("ordre", [])]
        except (TypeError, ValueError):
            raise ValidationError("La liste des critères est invalide.")
        existants = list(modele.criteres.values_list("id", flat=True))
        if sorted(ids) != sorted(existants):
            raise ValidationError("La liste des critères est incomplète ou invalide.")

        with transaction.atomic():
            for position, critere_id in enumerate(ids, start=1):
                CritereControle.objects.filter(pk=critere_id, modele=modele).update(ordre=position)

        return Response(self.get_serializer(self.get_object()).data)


class CritereControleViewSet(BaseReferentielViewSet):
    queryset = CritereControle.objects.all()
    serializer_class = CritereControleSerializer

    def destroy(self, request, *args, **kwargs):
        """Un critère déjà répondu dans un contrôle ne se supprime pas (l'historique est conservé)."""
        critere = self.get_object()
        if critere.reponses.exists():
            raise ValidationError(
                "Ce critère a déjà été utilisé dans des contrôles : il ne peut pas être supprimé."
            )
        return super().destroy(request, *args, **kwargs)


class ParametreScoreViewSet(BaseReferentielViewSet):
    queryset = ParametreScore.objects.all().order_by("cle")
    serializer_class = ParametreScoreSerializer