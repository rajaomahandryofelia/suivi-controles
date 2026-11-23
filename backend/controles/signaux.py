from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import Mission

# Les changements qui concernent le contrôleur (pas le démarrage ni la clôture)
CHAMPS_SUIVIS = (
    "controleur_id",
    "site_id",
    "modele_grille_id",
    "date_prevue",
    "heure_prevue",
    "date_fin_prevue",
    "heure_fin_prevue",
)


def _envoyer(destinataire_id, message):
    # Import ici pour éviter tout import circulaire au démarrage de Django
    from suivi.models import Notification

    Notification.objects.create(destinataire_id=destinataire_id, message=message[:500])


def _date(valeur):
    return valeur.strftime("%d/%m/%Y") if hasattr(valeur, "strftime") else str(valeur)


def _heure(valeur):
    return valeur.strftime("%H:%M") if hasattr(valeur, "strftime") else str(valeur)[:5]


def _creneau(mission):
    if mission.heure_prevue and mission.date_fin_prevue and mission.heure_fin_prevue:
        return (
            f"du {_date(mission.date_prevue)} à {_heure(mission.heure_prevue)} "
            f"au {_date(mission.date_fin_prevue)} à {_heure(mission.heure_fin_prevue)}"
        )
    return f"le {_date(mission.date_prevue)}"


def _texte_affectation(mission):
    return (
        f"Nouvelle mission : contrôle du site « {mission.site.nom} » "
        f"{_creneau(mission)}. Elle vous est affectée."
    )


@receiver(pre_save, sender=Mission)
def memoriser_ancien_etat(sender, instance, **kwargs):
    # On garde l'ancienne version pour savoir ce qui a changé
    instance._ancien = (
        sender.objects.filter(pk=instance.pk).first() if instance.pk else None
    )


@receiver(post_save, sender=Mission)
def notifier_enregistrement(sender, instance, created, **kwargs):
    mission = instance

    if created:
        _envoyer(mission.controleur_id, _texte_affectation(mission))
        return

    ancien = getattr(mission, "_ancien", None)
    if ancien is None or mission.statut != Mission.Statut.PLANIFIEE:
        return
    if not any(getattr(ancien, c) != getattr(mission, c) for c in CHAMPS_SUIVIS):
        return

    if ancien.controleur_id != mission.controleur_id:
        _envoyer(
            ancien.controleur_id,
            f"La mission du site « {ancien.site.nom} » ({_creneau(ancien)}) "
            "ne vous est plus affectée.",
        )
        _envoyer(mission.controleur_id, _texte_affectation(mission))
    else:
        _envoyer(
            mission.controleur_id,
            f"La mission du site « {mission.site.nom} » a été modifiée : "
            f"{_creneau(mission)}.",
        )


@receiver(post_delete, sender=Mission)
def notifier_suppression(sender, instance, **kwargs):
    if instance.statut != Mission.Statut.PLANIFIEE:
        return
    _envoyer(
        instance.controleur_id,
        f"La mission du site « {instance.site.nom} » ({_creneau(instance)}) "
        "a été supprimée.",
    )