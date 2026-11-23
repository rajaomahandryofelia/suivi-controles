"""Brief du jour de Maki : ce qui compte aujourd'hui pour l'utilisateur.

Le brief est calculé directement dans la base, sans moteur d'IA : il est instantané, gratuit,
et aucune donnée n'est envoyée à l'extérieur. Il respecte les mêmes droits que les outils de
Maki (le Directeur voit tout, un contrôleur ne voit que ce qui le concerne).
"""

import logging

from django.utils import timezone

from comptes.permissions import est_directeur
from controles.models import Mission, NonConformite, Rapport

from .assistant_outils import (
    _en_retard,
    _missions_visibles,
    _non_conformites_visibles,
    sites_a_risque,
)

journal = logging.getLogger(__name__)

# Pages de l'application vers lesquelles pointent les lignes du brief
LIEN_MISSIONS = "/missions"
LIEN_NON_CONFORMITES = "/non-conformites"
LIEN_RAPPORTS = "/rapports"

JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MOIS = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def _pluriel(nombre, singulier, pluriel=None):
    return singulier if nombre <= 1 else (pluriel or singulier + "s")


def _point(niveau, texte, lien=None):
    point = {"niveau": niveau, "texte": texte}
    if lien:
        point["lien"] = lien
    return point


def _liste_courte(elements, limite=3):
    elements = list(elements)
    texte = ", ".join(elements[:limite])
    if len(elements) > limite:
        texte += f" et {len(elements) - limite} autre{'s' if len(elements) - limite > 1 else ''}"
    return texte


def _points_missions(utilisateur, aujourdhui, directeur):
    points = []
    missions = _missions_visibles(utilisateur)

    du_jour = list(
        missions.filter(date_prevue=aujourdhui).order_by("heure_prevue", "id")
    )
    if du_jour:
        if directeur:
            detail = _liste_courte(m.site.nom for m in du_jour)
        else:
            detail = _liste_courte(
                f"{m.site.nom}" + (f" à {m.heure_prevue:%H:%M}" if m.heure_prevue else "")
                for m in du_jour
            )
        n = len(du_jour)
        points.append(
            _point(
                "info",
                f"{n} {_pluriel(n, 'mission prévue', 'missions prévues')} aujourd'hui : {detail}.",
                LIEN_MISSIONS,
            )
        )

    en_retard = missions.filter(
        statut=Mission.Statut.PLANIFIEE, date_prevue__lt=aujourdhui
    ).count()
    if en_retard:
        points.append(
            _point(
                "alerte",
                f"{en_retard} {_pluriel(en_retard, 'mission est', 'missions sont')} en retard "
                "(date prévue dépassée, pas encore démarrée).",
                LIEN_MISSIONS,
            )
        )

    en_cours = missions.filter(statut=Mission.Statut.EN_COURS).count()
    if en_cours:
        points.append(
            _point(
                "info",
                f"{en_cours} {_pluriel(en_cours, 'mission en cours', 'missions en cours')}.",
                LIEN_MISSIONS,
            )
        )
    return points


def _points_non_conformites(utilisateur, aujourdhui, directeur):
    points = []
    a_traiter = list(
        _non_conformites_visibles(utilisateur).exclude(statut=NonConformite.Statut.VERIFIEE)
    )

    en_retard = [nc for nc in a_traiter if _en_retard(nc, aujourdhui)]
    if en_retard:
        n = len(en_retard)
        sites = _liste_courte(dict.fromkeys(nc.site.nom for nc in en_retard))
        points.append(
            _point(
                "alerte",
                f"{n} {_pluriel(n, 'non-conformité dépasse', 'non-conformités dépassent')} "
                f"son délai de correction ({sites}).",
                LIEN_NON_CONFORMITES,
            )
        )

    critiques = [
        nc
        for nc in a_traiter
        if nc.statut == NonConformite.Statut.OUVERTE
        and nc.gravite == NonConformite.Gravite.CRITIQUE
        and not _en_retard(nc, aujourdhui)
    ]
    if critiques:
        n = len(critiques)
        points.append(
            _point(
                "attention",
                f"{n} {_pluriel(n, 'non-conformité critique ouverte', 'non-conformités critiques ouvertes')}.",
                LIEN_NON_CONFORMITES,
            )
        )

    corrigees = [nc for nc in a_traiter if nc.statut == NonConformite.Statut.CORRIGEE]
    if corrigees:
        n = len(corrigees)
        if directeur:
            texte = (
                f"{n} {_pluriel(n, 'non-conformité corrigée attend', 'non-conformités corrigées attendent')} "
                "la vérification d'un contrôleur."
            )
        else:
            sites = _liste_courte(dict.fromkeys(nc.site.nom for nc in corrigees))
            texte = (
                f"{n} {_pluriel(n, 'non-conformité est', 'non-conformités sont')} à vérifier "
                f"sur place ({sites})."
            )
        points.append(_point("attention", texte, LIEN_NON_CONFORMITES))
    return points


def _points_rapports(utilisateur, directeur):
    rapports = Rapport.objects.all()
    if not directeur:
        rapports = rapports.filter(mission__controleur=utilisateur)

    if directeur:
        a_valider = rapports.filter(statut=Rapport.Statut.GENERE).count()
        if a_valider:
            return [
                _point(
                    "attention",
                    f"{a_valider} {_pluriel(a_valider, 'rapport à valider', 'rapports à valider')}.",
                    LIEN_RAPPORTS,
                )
            ]
        return []

    rejetes = rapports.filter(statut=Rapport.Statut.REJETE).count()
    if rejetes:
        return [
            _point(
                "alerte",
                f"{rejetes} {_pluriel(rejetes, 'rapport rejeté', 'rapports rejetés')} : "
                "consultez le motif pour le reprendre.",
                LIEN_RAPPORTS,
            )
        ]
    return []


def _points_risques(utilisateur):
    resultat = sites_a_risque(utilisateur, {"niveau_minimum": "ELEVE"})
    total = resultat.get("total_sites", 0) if isinstance(resultat, dict) else 0
    if not total:
        return []
    return [
        _point(
            "attention",
            f"{total} {_pluriel(total, 'site à risque élevé ou critique', 'sites à risque élevé ou critique')}.",
        )
    ]


def construire_brief(utilisateur):
    """{"salutation", "date", "resume", "points": [{"niveau", "texte", "lien"?}]}"""
    maintenant = timezone.localtime()
    aujourdhui = maintenant.date()
    directeur = est_directeur(utilisateur)

    points = []
    for fabrique in (
        lambda: _points_missions(utilisateur, aujourdhui, directeur),
        lambda: _points_non_conformites(utilisateur, aujourdhui, directeur),
        lambda: _points_rapports(utilisateur, directeur),
        (lambda: _points_risques(utilisateur)) if directeur else (lambda: []),
    ):
        try:
            points += fabrique()
        except Exception:
            # Une section en échec ne doit pas empêcher d'afficher les autres
            journal.exception("Brief du jour : section en échec")

    ordre = {"alerte": 0, "attention": 1, "info": 2}
    points.sort(key=lambda p: ordre[p["niveau"]])

    salutation = "Bonjour" if maintenant.hour < 18 else "Bonsoir"
    prenom = utilisateur.first_name or utilisateur.get_username()

    urgents = sum(1 for p in points if p["niveau"] == "alerte")
    if urgents:
        resume = (
            f"{salutation} {prenom}. {urgents} {_pluriel(urgents, 'point demande', 'points demandent')} "
            "votre attention aujourd'hui."
        )
    elif points:
        resume = f"{salutation} {prenom}. Rien d'urgent, voici votre journée."
    else:
        resume = f"{salutation} {prenom}. Rien à signaler aujourd'hui."

    return {
        "salutation": f"{salutation} {prenom}",
        "date": f"{JOURS[aujourdhui.weekday()]} {aujourdhui.day} {MOIS[aujourdhui.month - 1]} {aujourdhui.year}",
        "resume": resume,
        "points": points,
    }