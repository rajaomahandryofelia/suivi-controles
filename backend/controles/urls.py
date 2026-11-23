from django.urls import path
from rest_framework.routers import DefaultRouter

from .a_faire import AFaireView
from .arrivee import ArriveeView
from .attribution import AttribuerMissionView
from .carte import CarteView
from .non_conformites import NonConformiteViewSet
from .rapports import RapportViewSet
from .tournees import TourneeViewSet
from .tracabilite import TracabiliteView, TracabilitePdfView
from .trajet import TrajetView
from .views import MissionViewSet
from .registre import OrdreViewSet

router = DefaultRouter()
router.register("missions", MissionViewSet, basename="mission")
router.register("rapports", RapportViewSet, basename="rapport")
router.register("non-conformites", NonConformiteViewSet, basename="non-conformite")
router.register("tournees", TourneeViewSet, basename="tournee")
router.register("ordres", OrdreViewSet, basename="ordre")

# Doit passer AVANT le routeur : sinon « attribuer » serait lu comme l'identifiant
# d'une mission (missions/<id>/).
urlpatterns = [
    path("missions/attribuer/", AttribuerMissionView.as_view(), name="mission-attribuer"),
    # Ce qui attend le Directeur (tableau de bord)
    path("a-faire/", AFaireView.as_view(), name="a-faire"),
    # Le contrôleur signale son arrivée sur le site (heure réelle + position GPS)
    path("missions/<int:pk>/arrivee/", ArriveeView.as_view(), name="mission-arrivee"),
    # Trajet du contrôleur : envoi des positions (contrôleur) et lecture du tracé
    path("missions/<int:pk>/trajet/", TrajetView.as_view(), name="mission-trajet"),
    # Carte en direct (Directeur) : avant « tracabilite/ » seul, pas de conflit mais plus lisible
    path("tracabilite/carte/", CarteView.as_view(), name="tracabilite-carte"),
    # Journal de traçabilité : qui a fait quoi, où, quand et jusqu'à quand
    path("tracabilite/", TracabiliteView.as_view(), name="tracabilite"),
    path("tracabilite/pdf/", TracabilitePdfView.as_view(), name="tracabilite-pdf"),
] + router.urls