"""Création des notifications de l'application.

Toutes les notifications passent par ce fichier : les vues appellent une
fonction `notifier_...` et n'ont pas à connaître le texte des messages.

Les mots « rapport » et « mission » dans les messages servent à la cloche pour
ouvrir la bonne page : ne pas les retirer.
"""

import logging

from django.db import transaction

from comptes.models import Utilisateur

from .models import Notification

journal = logging.getLogger(__name__)

LIMITE_MESSAGE = 500  # longueur maximale du champ `message`


def _couper(texte):
    if len(texte) <= LIMITE_MESSAGE:
        return texte
    return texte[: LIMITE_MESSAGE - 1].rstrip() + "…"


def _date(valeur):
    return f"{valeur:%d/%m/%Y}" if hasattr(valeur, "strftime") else str(valeur)


def _nom(utilisateur):
    return utilisateur.get_full_name() or utilisateur.get_username()


def notifier(destinataire, message):
    """Crée une notification. Un échec ne doit jamais bloquer l'action principale
    (clôturer une mission, valider un rapport...) : on l'écrit dans le journal."""
    if destinataire is None:
        return None
    try:
        # Point de sauvegarde : une erreur ici n'annule pas la transaction de l'appelant
        with transaction.atomic():
            return Notification.objects.create(
                destinataire=destinataire, message=_couper(message)
            )
    except Exception:
        journal.exception("Notification impossible pour %s", destinataire)
        return None


def notifier_directeurs(message):
    directeurs = Utilisateur.objects.filter(
        role=Utilisateur.Role.DIRECTEUR, is_active=True
    )
    for directeur in directeurs:
        notifier(directeur, message)


# ---- Missions (le Directeur agit, le contrôleur est prévenu) ----

def notifier_mission_creee(mission):
    notifier(
        mission.controleur,
        f"Nouvelle mission : contrôle du site « {mission.site.nom} » "
        f"prévu le {_date(mission.date_prevue)}.",
    )


def notifier_mission_modifiee(mission, ancien_controleur, ancien_site_nom, ancienne_date):
    """Prévient le contrôleur de la modification ; si la mission change de main,
    l'ancien contrôleur est prévenu qu'elle ne lui est plus confiée."""
    if ancien_controleur.pk != mission.controleur_id:
        notifier(
            ancien_controleur,
            f"La mission « {ancien_site_nom} » du {_date(ancienne_date)} "
            "ne vous est plus confiée.",
        )
        notifier_mission_creee(mission)
        return
    notifier(
        mission.controleur,
        f"La mission « {mission.site.nom} » a été modifiée : "
        f"elle est prévue le {_date(mission.date_prevue)}.",
    )


def notifier_mission_supprimee(controleur, site_nom, date_prevue):
    notifier(
        controleur,
        f"La mission « {site_nom} » du {_date(date_prevue)} a été supprimée.",
    )


# ---- Rapports ----

def notifier_rapport_genere(rapport):
    """Le contrôleur a clôturé sa mission : les Directeurs ont un rapport à traiter."""
    mission = rapport.mission
    score = f"{float(rapport.score_conformite):.2f}".replace(".", ",")
    notifier_directeurs(
        f"Rapport à valider : mission « {mission.site.nom} » de "
        f"{_nom(mission.controleur)}, score de conformité {score} %."
    )


def notifier_rapport_traite(rapport):
    """Le Directeur a validé ou rejeté : le contrôleur est prévenu."""
    mission = rapport.mission
    if rapport.statut == rapport.Statut.VALIDE:
        message = f"Votre rapport du site « {mission.site.nom} » a été validé."
    else:
        message = (
            f"Votre rapport du site « {mission.site.nom} » a été rejeté : la mission est "
            f"de nouveau en cours, corrigez-la puis clôturez-la. Motif : {rapport.motif_rejet}"
        )
    notifier(mission.controleur, message)


# ---- Non-conformités ----
# Ces messages commencent toujours par « Non-conformité » : c'est ce que la cloche
# reconnaît pour ouvrir la page des non-conformités.

def notifier_non_conformite_corrigee(nc):
    """Le Directeur a marqué une non-conformité corrigée : le contrôleur qui l'avait
    constatée sait qu'il devra la vérifier à son prochain contrôle du site."""
    notifier(
        nc.reponse.mission.controleur,
        f"Non-conformité corrigée sur « {nc.site.nom} » : {nc.description[:150]}. "
        "À vérifier lors de votre prochain contrôle de ce site.",
    )


def notifier_non_conformites_rouvertes(site, nombre):
    """Lors d'un contrôle, des corrections annoncées n'étaient pas faites."""
    notifier_directeurs(
        f"Non-conformité toujours présente sur « {site.nom} » : {nombre} correction(s) "
        "annoncée(s) n'ont pas été confirmée(s) lors du dernier contrôle."
    )