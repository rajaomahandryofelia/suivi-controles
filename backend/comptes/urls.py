from django.urls import path

from .views import (
    AccepterDemandeView,
    CarteControleurView,
    ConnexionView,
    ControleurListView,
    DeconnexionView,
    DemandesInscriptionView,
    InscriptionView,
    MoiView,
    RefuserDemandeView,
)

urlpatterns = [
    path("connexion/", ConnexionView.as_view(), name="connexion"),
    path("inscription/", InscriptionView.as_view(), name="inscription"),
    path("deconnexion/", DeconnexionView.as_view(), name="deconnexion"),
    path("moi/", MoiView.as_view(), name="moi"),
    path("controleurs/", ControleurListView.as_view(), name="controleurs"),
    path("controleurs/<int:pk>/carte/", CarteControleurView.as_view(), name="controleur-carte"),
    path("demandes/", DemandesInscriptionView.as_view(), name="demandes"),
    path("demandes/<int:pk>/accepter/", AccepterDemandeView.as_view(), name="demande-accepter"),
    path("demandes/<int:pk>/refuser/", RefuserDemandeView.as_view(), name="demande-refuser"),
]