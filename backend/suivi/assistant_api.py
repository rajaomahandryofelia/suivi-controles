from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .assistant_brief import construire_brief
from .assistant_ia import ErreurAssistant, cle_configuree, nettoyer_messages, repondre
from .assistant_outils import construire_instruction, declarations_pour, executer

# Protège le quota gratuit de l'IA : un utilisateur ne peut pas la saturer à lui seul
MAX_PAR_MINUTE = 10
MAX_PAR_JOUR = 150


def _autorise(utilisateur):
    """Compte la demande. Renvoie False si l'utilisateur a dépassé sa limite."""
    for fenetre, duree, maximum in (("minute", 60, MAX_PAR_MINUTE), ("jour", 86400, MAX_PAR_JOUR)):
        cle = f"maki:{utilisateur.id}:{fenetre}"
        cache.add(cle, 0, duree)
        try:
            if cache.incr(cle) > maximum:
                return False
        except ValueError:  # la clé vient d'expirer
            cache.set(cle, 1, duree)
    return True


class AssistantStatutView(APIView):
    """L'interface demande si Maki est relié à son moteur d'IA."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"disponible": cle_configuree()})


class AssistantBriefView(APIView):
    """GET -> le brief du jour de l'utilisateur (calculé sur place, sans moteur d'IA)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(construire_brief(request.user))


class AssistantMessageView(APIView):
    """POST {"messages": [{"role": "user" | "assistant", "texte": "..."}]}
    -> {"reponse": "...", "actions": [...]}

    `actions` : propositions d'action que l'utilisateur doit confirmer (aucune n'est exécutée ici)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            messages = nettoyer_messages(request.data.get("messages"))
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        if not _autorise(request.user):
            return Response(
                {"detail": "Vous posez beaucoup de questions : patientez un instant avant de continuer."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        propositions = []
        try:
            texte = repondre(
                messages,
                construire_instruction(request.user),
                declarations_pour(request.user),
                lambda nom, args: executer(request.user, nom, args, propositions),
            )
        except ErreurAssistant as e:
            return Response(
                {"detail": e.message, "code": e.code},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"reponse": texte, "actions": propositions})