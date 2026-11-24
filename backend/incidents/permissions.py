from rest_framework.permissions import BasePermission


def est_directeur(user):
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, "role", None) == "DIRECTEUR")
    )


class EstDirecteur(BasePermission):
    """Seul le Directeur est autorisé (modifier, rétablir, supprimer un incident)."""

    message = "Seul le Directeur peut effectuer cette action."

    def has_permission(self, request, view):
        return est_directeur(request.user)