import calendar
from datetime import date

from django.db.models import Q
from django.utils import timezone

from .models import Convention, Echeance
from .numerotation import prochain_numero

PAS_EN_MOIS = {
    Convention.Periodicite.MENSUELLE: 1,
    Convention.Periodicite.TRIMESTRIELLE: 3,
    Convention.Periodicite.ANNUELLE: 12,
}


def convention_active_pour(site, jour):
    """Convention active couvrant ce site à cette date, ou None."""
    return (
        Convention.objects.filter(
            site=site,
            statut=Convention.Statut.ACTIVE,
            date_debut__lte=jour,
        )
        .filter(Q(date_fin__isnull=True) | Q(date_fin__gte=jour))
        .first()
    )


def numero_facture_suivant():
    """Prochain numéro de facture de l'année : FAC-2026-0001."""
    annee = timezone.localdate().year
    existantes = Echeance.objects.filter(
        numero_facture__startswith=f"FAC-{annee}-"
    ).values_list("numero_facture", flat=True)
    return prochain_numero("FAC", annee, existantes, 4)


def ajouter_mois(depart, nb_mois):
    """Ajoute des mois à une date en gardant le même jour (ou le dernier du mois)."""
    index = depart.month - 1 + nb_mois
    annee = depart.year + index // 12
    mois = index % 12 + 1
    jour = min(depart.day, calendar.monthrange(annee, mois)[1])
    return date(annee, mois, jour)


def generer_echeances(convention):
    """Crée les échéances manquantes entre la date de début et la date de fin.
    Retourne le nombre d'échéances créées."""
    if convention.date_fin is None:
        raise ValueError("Indiquez une date de fin pour générer les échéances.")

    pas = PAS_EN_MOIS[convention.periodicite]
    existantes = set(convention.echeances.values_list("date_echeance", flat=True))

    a_creer = []
    i = 0
    while True:
        jour = ajouter_mois(convention.date_debut, pas * i)
        if jour > convention.date_fin:
            break
        if jour not in existantes:
            a_creer.append(
                Echeance(
                    convention=convention,
                    date_echeance=jour,
                    montant_du=convention.montant_periodique,
                )
            )
        i += 1

    Echeance.objects.bulk_create(a_creer)
    return len(a_creer)