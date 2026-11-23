import logging

from .models import JournalConvention

logger = logging.getLogger(__name__)


def journaliser(convention, action, auteur=None, detail="", reference=""):
    """Ajoute une ligne à l'historique. Ne doit jamais faire échouer l'action
    qui l'appelle : une erreur d'écriture du journal est seulement signalée."""
    try:
        # auteur peut être un utilisateur anonyme (système) : on ne garde que les vrais comptes
        if auteur is not None and not getattr(auteur, "is_authenticated", False):
            auteur = None
        JournalConvention.objects.create(
            convention=convention,
            reference_convention=reference or (convention.reference if convention else ""),
            action=action,
            detail=detail[:500],
            auteur=auteur,
        )
    except Exception:
        logger.exception("Échec d'écriture de l'historique des conventions")