from rest_framework.permissions import SAFE_METHODS, BasePermission


def est_directeur(user):
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, "role", None) == "DIRECTEUR")
    )


class DirecteurOuLectureSeule(BasePermission):
    """Tout utilisateur connecté peut consulter ;
    seul le Directeur peut créer, modifier ou supprimer."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return est_directeur(request.user)