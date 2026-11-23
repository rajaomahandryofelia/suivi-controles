"""Tâches quotidiennes de suivi.

1. Non-conformités en retard : chaque Directeur reçoit UNE alerte par non-conformité
   dont le délai de correction est dépassé. On repère les alertes déjà envoyées grâce
   à `type_alerte` (« NC_RETARD_<id> ») : aucune table ni migration en plus, et lancer
   la tâche plusieurs fois par jour n'envoie jamais deux fois la même alerte.
2. Scores de risque : les pénalités augmentent quand les délais sont dépassés, donc le
   score d'un site change avec le temps. On le recalcule chaque jour, mais seulement
   pour les sites déjà notés (au moins un rapport validé) et seulement si la valeur
   a changé : l'historique ne se remplit pas de lignes identiques.

Les messages d'alerte commencent par « Non-conformité » : c'est ce que la cloche
reconnaît pour ouvrir la page des non-conformités.
"""

from django.utils import timezone

from comptes.models import Utilisateur
from controles.models import NonConformite
from referentiels.models import Site

from .models import Alerte, Niveau
from .services import calculer_valeur, lire_parametres, recalculer_score

# Plus la gravité est élevée, plus l'alerte l'est
NIVEAU_PAR_GRAVITE = {
    NonConformite.Gravite.MINEURE: Niveau.MOYEN,
    NonConformite.Gravite.MAJEURE: Niveau.ELEVE,
    NonConformite.Gravite.CRITIQUE: Niveau.CRITIQUE,
}


def signaler_non_conformites_en_retard(simuler=False):
    """Renvoie le nombre d'alertes créées (ou qui seraient créées en mode simulation)."""
    aujourdhui = timezone.localdate()
    directeurs = list(
        Utilisateur.objects.filter(role=Utilisateur.Role.DIRECTEUR, is_active=True)
    )
    en_retard = NonConformite.objects.filter(
        statut=NonConformite.Statut.OUVERTE,
        date_limite_correction__lt=aujourdhui,
    ).select_related("site")

    crees = 0
    for nc in en_retard:
        type_alerte = f"NC_RETARD_{nc.pk}"
        jours = (aujourdhui - nc.date_limite_correction).days
        message = (
            f"Non-conformité en retard sur « {nc.site.nom} » : {nc.description[:120]} "
            f"(délai dépassé de {jours} jour{'s' if jours > 1 else ''})."
        )
        for directeur in directeurs:
            deja_envoyee = Alerte.objects.filter(
                destinataire=directeur, type_alerte=type_alerte
            ).exists()
            if deja_envoyee:
                continue
            crees += 1
            if not simuler:
                Alerte.objects.create(
                    destinataire=directeur,
                    message=message,
                    type_alerte=type_alerte,
                    niveau=NIVEAU_PAR_GRAVITE[nc.gravite],
                    site=nc.site,
                )
    return crees


def recalculer_scores_du_jour(simuler=False):
    """Renvoie le nombre de sites dont le score a changé."""
    parametres = lire_parametres()
    modifies = 0
    for site in Site.objects.filter(est_actif=True):
        dernier = site.scores.first()
        if dernier is None:
            continue  # jamais noté : on n'invente pas de score
        if calculer_valeur(site, parametres) == dernier.valeur:
            continue
        modifies += 1
        if not simuler:
            recalculer_score(site)
    return modifies