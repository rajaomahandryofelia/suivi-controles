from rest_framework.routers import DefaultRouter

from .views import (
    CritereControleViewSet,
    ElementInventaireViewSet,
    ModeleGrilleViewSet,
    ParametreScoreViewSet,
    PartenaireViewSet,
    SiteViewSet,
    TypeSiteViewSet,
)

router = DefaultRouter()
router.register("partenaires", PartenaireViewSet)
router.register("types-site", TypeSiteViewSet)
router.register("sites", SiteViewSet)
router.register("elements-inventaire", ElementInventaireViewSet)
router.register("modeles-grille", ModeleGrilleViewSet)
router.register("criteres", CritereControleViewSet)
router.register("parametres-score", ParametreScoreViewSet)

urlpatterns = router.urls