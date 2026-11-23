"""Relances automatiques des impayés et alertes d'expiration des conventions.

Se lance à la main (python manage.py relancer_impayes) ou automatiquement une fois
par jour si RELANCES_AUTOMATIQUES = True dans settings.py."""

import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from suivi.models import Notification

from .emails import envoyer_relance
from .journal import journaliser
from .models import Convention, Echeance, JournalConvention, Relance

logger = logging.getLogger(__name__)

# Réglages (en jours) : à adapter à la pratique de la DPC
JOURS_RAPPEL = 3  # rappel dans les 3 jours qui précèdent l'échéance
JOURS_RETARD = 7  # relance quand l'échéance a 7 jours de retard
JOURS_RETARD_FINAL = 30  # dernier rappel à 30 jours de retard
JOURS_MAX_RETARD = 90  # au-delà, c'est géré à la main par le Directeur
JOURS_ALERTE_EXPIRATION = 60  # alerte 60 jours avant la fin d'une convention

_derniere_execution = None


def _type_applicable(echeance, aujourdhui):
    """Type de relance qui correspond à la situation de l'échéance, ou None."""
    ecart = (aujourdhui - echeance.date_echeance).days  # positif = en retard
    if -JOURS_RAPPEL <= ecart <= 0:
        return Relance.Type.RAPPEL
    if JOURS_RETARD <= ecart < JOURS_RETARD_FINAL:
        return Relance.Type.RETARD
    if JOURS_RETARD_FINAL <= ecart <= JOURS_MAX_RETARD:
        return Relance.Type.RETARD_FINAL
    return None


def _notifier_directeurs(message):
    directeurs = get_user_model().objects.filter(role="DIRECTEUR", is_active=True)
    for directeur in directeurs:
        Notification.objects.create(destinataire=directeur, message=message)


def executer_relances(simuler=False):
    aujourdhui = timezone.localdate()
    stats = {"rappels": 0, "retards": 0, "retards_finaux": 0, "sans_email": 0}
    cle = {
        Relance.Type.RAPPEL: "rappels",
        Relance.Type.RETARD: "retards",
        Relance.Type.RETARD_FINAL: "retards_finaux",
    }

    echeances = (
        Echeance.objects.filter(
            date_echeance__range=(
                aujourdhui - timedelta(days=JOURS_MAX_RETARD),
                aujourdhui + timedelta(days=JOURS_RAPPEL),
            ),
            convention__statut__in=[
                Convention.Statut.ACTIVE,
                Convention.Statut.SUSPENDUE,
                Convention.Statut.EXPIREE,
            ],
        )
        .exclude(statut=Echeance.Statut.PAYE)
        .select_related("convention__partenaire", "convention__site")
        .prefetch_related("relances", "paiements")
    )

    for echeance in echeances:
        type_relance = _type_applicable(echeance, aujourdhui)
        if type_relance is None or echeance.reste_a_payer <= 0:
            continue
        # Le rappel avant échéance ne concerne que les conventions actives
        if (
            type_relance == Relance.Type.RAPPEL
            and echeance.convention.statut != Convention.Statut.ACTIVE
        ):
            continue
        # Déjà envoyée : on n'envoie pas deux fois la même
        if any(r.type == type_relance for r in echeance.relances.all()):
            continue

        stats[cle[type_relance]] += 1
        if not echeance.convention.partenaire.email:
            stats["sans_email"] += 1
        if simuler:
            continue

        envoye = envoyer_relance(echeance, type_relance)
        Relance.objects.create(
            echeance=echeance, type=type_relance, email_envoye=envoye
        )
    return stats


def appliquer_expirations(simuler=False):
    """Passe en « expirée » les conventions dont la date de fin est dépassée et
    prévient le Directeur des conventions qui expirent bientôt."""
    aujourdhui = timezone.localdate()
    stats = {"expirees": 0, "alertes_expiration": 0}

    expirees = Convention.objects.select_related("partenaire", "site").filter(
        statut=Convention.Statut.ACTIVE, date_fin__lt=aujourdhui
    )
    for convention in expirees:
        stats["expirees"] += 1
        if simuler:
            continue
        convention.statut = Convention.Statut.EXPIREE
        convention.save(update_fields=["statut"])
        journaliser(
            convention,
            JournalConvention.Action.STATUT,
            None,
            "De « Active » à « Expirée » (automatique : date de fin dépassée)",
        )
        _notifier_directeurs(
            f"La convention {convention.reference} ({convention.partenaire.nom}, "
            f"site {convention.site.nom}) a expiré le {convention.date_fin:%d/%m/%Y}."
        )

    bientot = Convention.objects.select_related("partenaire", "site").filter(
        statut=Convention.Statut.ACTIVE,
        date_fin__gte=aujourdhui,
        date_fin__lte=aujourdhui + timedelta(days=JOURS_ALERTE_EXPIRATION),
        alerte_expiration_le__isnull=True,
    )
    for convention in bientot:
        stats["alertes_expiration"] += 1
        if simuler:
            continue
        convention.alerte_expiration_le = aujourdhui
        convention.save(update_fields=["alerte_expiration_le"])
        _notifier_directeurs(
            f"La convention {convention.reference} ({convention.partenaire.nom}, "
            f"site {convention.site.nom}) expire le {convention.date_fin:%d/%m/%Y}. "
            "Pensez à la renouveler."
        )
    return stats


def executer_tout(simuler=False):
    """Relances + expirations. Résume le résultat dans la cloche du Directeur."""
    stats = {"simulation": simuler}
    stats.update(executer_relances(simuler))
    stats.update(appliquer_expirations(simuler))

    envoyees = stats["rappels"] + stats["retards"] + stats["retards_finaux"]
    if not simuler and envoyees:
        message = (
            f"Relances du jour : {stats['rappels']} rappel(s), "
            f"{stats['retards']} relance(s) de retard, "
            f"{stats['retards_finaux']} dernier(s) rappel(s)."
        )
        if stats["sans_email"]:
            message += (
                f" {stats['sans_email']} partenaire(s) sans adresse e-mail : "
                "à contacter autrement."
            )
        _notifier_directeurs(message)
    return stats


def executer_si_necessaire():
    """Une fois par jour et par processus, seulement si l'option est activée.
    Ne doit jamais faire échouer la requête qui la déclenche."""
    global _derniere_execution
    if not getattr(settings, "RELANCES_AUTOMATIQUES", False):
        return
    aujourdhui = timezone.localdate()
    if _derniere_execution == aujourdhui:
        return
    _derniere_execution = aujourdhui
    try:
        executer_tout()
    except Exception:
        logger.exception("Échec des relances automatiques")