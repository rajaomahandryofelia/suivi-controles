from rest_framework.routers import DefaultRouter

from .views import ConventionViewSet, EcheanceViewSet, PaiementViewSet

router = DefaultRouter()
router.register("conventions", ConventionViewSet, basename="convention")
router.register("echeances", EcheanceViewSet, basename="echeance")
router.register("paiements", PaiementViewSet, basename="paiement")

urlpatterns = router.urls