"""Les données du tableau de bord de supervision des incidents (Directeur).

Tout est calculé ici, pour un mois donné : les vues n'ont qu'à appeler
`construire_tableau_de_bord(annee, mois)`.
"""

from collections import Counter
from datetime import datetime, timedelta

from django.utils import timezone

from referentiels.models import Site

from .models import FENETRE_RECURRENCE_JOURS, Incident, ids_incidents_recurrents

# Nombre de mois affichés sur la courbe d'évolution (le mois choisi est le dernier)
NB_MOIS_EVOLUTION = 6
# Nombre maximal d'alertes prioritaires affichées
NB_ALERTES = 4
# Nombre d'incidents récents affichés
NB_RECENTS = 5

MOIS_COURTS = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
]


def _debut_du_mois(annee, mois):
    return timezone.make_aware(datetime(annee, mois, 1))


def _decaler(annee, mois, decalage):
    """Décale un mois : (2026, 11, -3) → (2026, 8)."""
    index = annee * 12 + (mois - 1) + decalage
    return index // 12, index % 12 + 1


def _evolution(incidents, annee, mois):
    """Nombre d'incidents par mois, pour la radio et pour la télévision.
    Un incident « Radio et télévision » compte dans les deux courbes."""
    radio_et_tv = Incident.Service.RADIO_TELEVISION
    points = []
    for decalage in range(-(NB_MOIS_EVOLUTION - 1), 1):
        a, m = _decaler(annee, mois, decalage)
        radio = television = 0
        for incident in incidents:
            local = timezone.localtime(incident.date_debut)
            if (local.year, local.month) != (a, m):
                continue
            if incident.service in (Incident.Service.RADIO, radio_et_tv):
                radio += 1
            if incident.service in (Incident.Service.TELEVISION, radio_et_tv):
                television += 1
        points.append(
            {
                "mois": f"{a}-{m:02d}",
                "libelle": MOIS_COURTS[m - 1],
                "radio": radio,
                "television": television,
            }
        )
    return points


def _repartition(ce_mois):
    total = len(ce_mois)
    compteur = Counter(incident.gravite for incident in ce_mois)
    parts = []
    for gravite in (
        Incident.Gravite.CRITIQUE,
        Incident.Gravite.MAJEURE,
        Incident.Gravite.MINEURE,
    ):
        nombre = compteur[gravite]
        parts.append(
            {
                "gravite": gravite.value,
                "libelle": gravite.label,
                "nombre": nombre,
                "pourcentage": round(nombre * 100 / total) if total else 0,
            }
        )
    return {"total": total, "parts": parts}


def _alertes(en_cours, maintenant):
    """Les alertes prioritaires : incidents critiques en cours, anomalies qui se
    répètent, puis les autres incidents en cours."""
    alertes = []

    # 1. Incidents critiques en cours (les plus anciens d'abord)
    critiques = [i for i in en_cours if i.gravite == Incident.Gravite.CRITIQUE]
    for incident in sorted(critiques, key=lambda i: i.date_debut):
        debut_local = timezone.localtime(incident.date_debut)
        alertes.append(
            {
                "cle": f"critique-{incident.id}",
                "niveau": "critique",
                "titre": "Incident critique en cours",
                "detail": f"{incident.site.nom} – {incident.get_type_display()}",
                "etiquette": "Aujourd'hui" if debut_local.date() == maintenant.date() else "En cours",
            }
        )

    # 2. Anomalies récurrentes : même type d'incident, même site, au moins 2 fois
    # dans la fenêtre de récurrence
    limite = maintenant - timedelta(days=FENETRE_RECURRENCE_JOURS)
    compteur = Counter()
    noms = {}
    for incident in Incident.objects.filter(date_debut__gte=limite).select_related("site"):
        cle = (incident.site_id, incident.type)
        compteur[cle] += 1
        noms[cle] = (incident.site.nom, incident.get_type_display())
    for cle, nombre in compteur.most_common():
        if nombre < 2:
            break
        site_nom, type_libelle = noms[cle]
        alertes.append(
            {
                "cle": f"recurrent-{cle[0]}-{cle[1]}",
                "niveau": "recurrent",
                "titre": "Anomalie récurrente détectée",
                "detail": f"{site_nom} – {type_libelle} ({nombre} occurrences)",
                "etiquette": "À surveiller",
            }
        )

    # 3. Les autres incidents en cours
    autres = [i for i in en_cours if i.gravite != Incident.Gravite.CRITIQUE]
    for incident in sorted(autres, key=lambda i: i.date_debut):
        alertes.append(
            {
                "cle": f"en-cours-{incident.id}",
                "niveau": "en_cours",
                "titre": "Incident en cours",
                "detail": f"{incident.site.nom} – {incident.get_type_display()}",
                "etiquette": "En cours",
            }
        )

    return alertes[:NB_ALERTES]


def construire_tableau_de_bord(annee, mois):
    maintenant = timezone.localtime()
    debut = _debut_du_mois(annee, mois)
    fin = _debut_du_mois(*_decaler(annee, mois, 1))
    debut_precedent = _debut_du_mois(*_decaler(annee, mois, -1))
    debut_evolution = _debut_du_mois(*_decaler(annee, mois, -(NB_MOIS_EVOLUTION - 1)))

    # Une seule requête pour les 6 mois ; le mois choisi s'en déduit
    incidents_6_mois = list(
        Incident.objects.filter(date_debut__gte=debut_evolution, date_debut__lt=fin)
    )
    ce_mois = [i for i in incidents_6_mois if i.date_debut >= debut]
    nb_precedent = sum(1 for i in incidents_6_mois if debut_precedent <= i.date_debut < debut)
    variation = (
        None
        if nb_precedent == 0
        else round((len(ce_mois) - nb_precedent) * 100 / nb_precedent)
    )

    # Les incidents en cours : toujours l'état actuel, quel que soit le mois choisi
    en_cours = list(
        Incident.objects.filter(statut=Incident.Statut.EN_COURS).select_related("site")
    )
    sites_critiques = {
        i.site_id for i in en_cours if i.gravite == Incident.Gravite.CRITIQUE
    }
    sites_en_cours = {i.site_id for i in en_cours}

    recurrents = ids_incidents_recurrents()
    sites_recurrents = {i.site_id for i in ce_mois if i.id in recurrents}

    # État de chaque site : critique, à surveiller ou normal
    sites = []
    for site in Site.objects.filter(est_actif=True):
        if site.id in sites_critiques:
            etat = "CRITIQUE"
        elif site.id in sites_en_cours or site.id in sites_recurrents:
            etat = "A_SURVEILLER"
        else:
            etat = "NORMAL"
        sites.append(
            {
                "id": site.id,
                "nom": site.nom,
                "latitude": float(site.latitude),
                "longitude": float(site.longitude),
                "etat": etat,
            }
        )

    recents = [
        {
            "id": i.id,
            "site_nom": i.site.nom,
            "type_libelle": i.get_type_display(),
            "gravite": i.gravite,
            "gravite_libelle": i.get_gravite_display(),
            "statut": i.statut,
            "statut_libelle": i.get_statut_display(),
            "date_debut": i.date_debut.isoformat(),
            "duree_minutes": i.duree_minutes,
        }
        for i in Incident.objects.select_related("site").order_by("-date_debut", "-id")[:NB_RECENTS]
    ]

    return {
        "mois": f"{annee}-{mois:02d}",
        "kpis": {
            "sites_suivis": len(sites),
            "incidents_ce_mois": len(ce_mois),
            "variation_pct": variation,
            "en_cours": len(en_cours),
            "sites_critiques": len(sites_critiques),
        },
        "evolution": _evolution(incidents_6_mois, annee, mois),
        "repartition": _repartition(ce_mois),
        "sites": sites,
        "recents": recents,
        "alertes": _alertes(en_cours, maintenant),
    }