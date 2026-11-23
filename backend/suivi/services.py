from datetime import date
from decimal import Decimal

from django.conf import settings

from controles.models import NonConformite, Rapport
from referentiels.models import ParametreScore

from .models import Alerte, Niveau, ScoreRisque

# Valeurs utilisées tant que le Directeur n'a pas créé le paramètre
# correspondant dans l'administration (table « Paramètres du score »).
PARAMETRES_PAR_DEFAUT = {
    "nb_rapports_pris_en_compte": Decimal("3"),
    "seuil_moyen": Decimal("25"),
    "seuil_eleve": Decimal("50"),
    "seuil_critique": Decimal("75"),
    "points_mineure": Decimal("3"),
    "points_majeure": Decimal("7"),
    "points_critique": Decimal("15"),
    "multiplicateur_retard": Decimal("1.5"),
}


def lire_parametres():
    """Les paramètres du score : ceux saisis par le Directeur, sinon les défauts."""
    valeurs = dict(PARAMETRES_PAR_DEFAUT)
    for parametre in ParametreScore.objects.filter(cle__in=valeurs.keys()):
        valeurs[parametre.cle] = parametre.valeur
    return valeurs


def niveau_pour(valeur, p):
    if valeur >= p["seuil_critique"]:
        return Niveau.CRITIQUE
    if valeur >= p["seuil_eleve"]:
        return Niveau.ELEVE
    if valeur >= p["seuil_moyen"]:
        return Niveau.MOYEN
    return Niveau.FAIBLE


def calculer_valeur(site, p):
    """Score de risque de 0 (aucun risque) à 100 (risque maximal).

    1. Base : l'écart à la conformité parfaite, sur les derniers rapports validés.
    2. Pénalités : chaque non-conformité encore à traiter ajoute des points selon
       sa gravité, multipliés si le délai de correction est dépassé."""
    nb = int(p["nb_rapports_pris_en_compte"])
    derniers = list(
        Rapport.objects.filter(mission__site=site, statut=Rapport.Statut.VALIDE)
        .order_by("-date_generation")
        .values_list("score_conformite", flat=True)[:nb]
    )
    if derniers:
        base = Decimal("100") - sum(derniers) / len(derniers)
    else:
        base = Decimal("50")  # site jamais contrôlé : risque moyen par prudence

    points = {
        NonConformite.Gravite.MINEURE: p["points_mineure"],
        NonConformite.Gravite.MAJEURE: p["points_majeure"],
        NonConformite.Gravite.CRITIQUE: p["points_critique"],
    }
    penalites = Decimal("0")
    aujourdhui = date.today()
    ouvertes = NonConformite.objects.filter(
        site=site,
    ).exclude(statut=NonConformite.Statut.VERIFIEE)
    for nc in ouvertes:
        pts = points[nc.gravite]
        if nc.statut == NonConformite.Statut.OUVERTE and nc.date_limite_correction < aujourdhui:
            pts = pts * p["multiplicateur_retard"]
        penalites += pts

    return max(Decimal("0"), min(Decimal("100"), base + penalites)).quantize(Decimal("0.01"))


def recalculer_score(site):
    """Ton `recalculerScore()` : calcule le score, l'enregistre, et alerte si besoin."""
    p = lire_parametres()
    valeur = calculer_valeur(site, p)
    niveau = niveau_pour(valeur, p)

    precedent = site.scores.first()  # le plus récent (tri par date décroissante)
    score = ScoreRisque.objects.create(site=site, valeur=valeur, niveau=niveau)

    # Alerte pour les Directeurs si le niveau devient élevé ou critique
    niveau_precedent = precedent.niveau if precedent else None
    if niveau in (Niveau.ELEVE, Niveau.CRITIQUE) and niveau != niveau_precedent:
        from comptes.models import Utilisateur

        for directeur in Utilisateur.objects.filter(
            role=Utilisateur.Role.DIRECTEUR, is_active=True
        ):
            Alerte.objects.create(
                destinataire=directeur,
                message=f"Le site « {site.nom} » est passé au niveau de risque "
                f"{score.get_niveau_display().lower()} (score {valeur}).",
                type_alerte="SCORE_ELEVE",
                niveau=niveau,
                site=site,
            )
    return score