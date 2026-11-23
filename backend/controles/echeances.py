import logging
import time as horloge
from datetime import datetime, time

from django.db import transaction
from django.utils import timezone

from suivi.models import Notification

from .models import Mission
from .services import (
    criteres_non_conformes_sans_photo,
    criteres_obligatoires_manquants,
    generer_rapport_pdf,
)

journal = logging.getLogger(__name__)

# Le traitement tourne au plus une fois toutes les 15 secondes (il est déclenché par les requêtes)
INTERVALLE_SECONDES = 15
_derniere_execution = 0.0


def _instant(jour, heure):
    """Un jour et une heure saisis (heure locale) -> un instant avec fuseau horaire."""
    return timezone.make_aware(datetime.combine(jour, heure))


def _debut(mission):
    return _instant(mission.date_prevue, mission.heure_prevue)


def _fin(mission):
    return _instant(mission.date_fin_prevue, mission.heure_fin_prevue)


def _notifier_une_fois(destinataire, message):
    """Évite de renvoyer le même rappel à chaque passage du traitement."""
    if destinataire is None:
        return
    if not Notification.objects.filter(destinataire=destinataire, message=message).exists():
        Notification.objects.create(destinataire=destinataire, message=message)


def demarrer_missions_echues(maintenant):
    """Une mission planifiée dont l'heure de début est arrivée passe « En cours »."""
    aujourdhui = timezone.localdate()
    candidates = Mission.objects.filter(
        statut=Mission.Statut.PLANIFIEE,
        date_prevue__lte=aujourdhui,
        heure_prevue__isnull=False,
        date_fin_prevue__isnull=False,
        heure_fin_prevue__isnull=False,
    ).select_related("site", "controleur")

    for mission in candidates:
        debut, fin = _debut(mission), _fin(mission)
        # Hors de la plage prévue (trop tôt, ou déjà dépassée) : on ne touche à rien
        if not (debut <= maintenant < fin):
            continue

        with transaction.atomic():
            verrou = (
                Mission.objects.select_for_update()
                .filter(pk=mission.pk, statut=Mission.Statut.PLANIFIEE)
                .first()
            )
            if verrou is None:
                continue  # une autre requête vient de la démarrer
            verrou.statut = Mission.Statut.EN_COURS
            verrou.date_debut_reelle = debut
            verrou.save(update_fields=["statut", "date_debut_reelle"])

        Notification.objects.create(
            destinataire=mission.controleur,
            message=(
                f"La mission « {mission.site.nom} » a démarré automatiquement "
                f"({debut:%d/%m/%Y à %H:%M}). Ouvrez la grille pour la remplir."
            ),
        )


def cloturer_missions_echues(maintenant):
    """Une mission en cours dont l'heure de fin est arrivée est clôturée si sa grille est
    complète. Sinon elle reste en cours et le contrôleur et le Directeur sont prévenus."""
    aujourdhui = timezone.localdate()
    candidates = Mission.objects.filter(
        statut=Mission.Statut.EN_COURS,
        date_fin_prevue__isnull=False,
        date_fin_prevue__lte=aujourdhui,
        heure_fin_prevue__isnull=False,
    ).select_related("site", "controleur", "directeur")

    for mission in candidates:
        fin = _fin(mission)
        if fin > maintenant:
            continue

        manquants = criteres_obligatoires_manquants(mission)
        sans_photo = criteres_non_conformes_sans_photo(mission)
        grille_complete = mission.reponses.exists() and not manquants.exists()

        if not grille_complete or sans_photo.exists():
            detail = (
                "la grille est incomplète. Complétez-la, puis clôturez la mission."
                if not grille_complete
                else "il manque une photo pour un critère non conforme. "
                "Ajoutez-la, puis clôturez la mission."
            )
            message = (
                f"Mission n° {mission.id} (« {mission.site.nom} ») : l'échéance du "
                f"{fin:%d/%m/%Y à %H:%M} est dépassée et {detail}"
            )
            _notifier_une_fois(mission.controleur, message)
            _notifier_une_fois(mission.directeur, message)
            continue

        try:
            with transaction.atomic():
                verrou = (
                    Mission.objects.select_for_update()
                    .filter(pk=mission.pk, statut=Mission.Statut.EN_COURS)
                    .first()
                )
                if verrou is None:
                    continue  # une autre requête vient de la clôturer
                verrou.statut = Mission.Statut.CLOTUREE
                verrou.date_fin_reelle = fin
                verrou.save(update_fields=["statut", "date_fin_reelle"])
                generer_rapport_pdf(verrou)
        except Exception:
            # Le rapport n'a pas pu être généré : la mission reste en cours (rien n'est enregistré)
            journal.exception("Clôture automatique impossible pour la mission %s", mission.pk)
            continue

        message = (
            f"La mission « {mission.site.nom} » a été clôturée automatiquement à l'échéance "
            f"prévue ({fin:%d/%m/%Y à %H:%M}). Son rapport est généré."
        )
        _notifier_une_fois(mission.controleur, message)
        _notifier_une_fois(mission.directeur, message)


def appliquer_echeances(forcer=False):
    """À appeler régulièrement : démarre et clôture les missions dont l'heure est arrivée.
    Ne lève jamais d'erreur, pour ne jamais bloquer la requête qui l'a déclenchée."""
    global _derniere_execution

    maintenant_mesure = horloge.monotonic()
    if not forcer and maintenant_mesure - _derniere_execution < INTERVALLE_SECONDES:
        return
    _derniere_execution = maintenant_mesure

    try:
        maintenant = timezone.now()
        demarrer_missions_echues(maintenant)
        cloturer_missions_echues(maintenant)
    except Exception:
        journal.exception("Traitement des échéances de missions en échec")