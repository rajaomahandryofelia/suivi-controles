from django.urls import path

from .assistant_api import AssistantBriefView, AssistantMessageView, AssistantStatutView
from .views import (
    NotificationLueView,
    NotificationListeView,
    TableauDeBordView,
    ToutLireView,
)

urlpatterns = [
    path("tableau-de-bord/", TableauDeBordView.as_view(), name="tableau-de-bord"),
    path("notifications/", NotificationListeView.as_view(), name="notifications"),
    path("notifications/tout-lire/", ToutLireView.as_view(), name="notifications-tout-lire"),
    path(
        "notifications/<int:pk>/lue/",
        NotificationLueView.as_view(),
        name="notification-lue",
    ),
    path("assistant/statut/", AssistantStatutView.as_view(), name="assistant-statut"),
    path("assistant/brief/", AssistantBriefView.as_view(), name="assistant-brief"),
    path("assistant/message/", AssistantMessageView.as_view(), name="assistant-message"),
]