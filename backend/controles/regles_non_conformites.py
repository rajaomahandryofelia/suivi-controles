"""Règles métier des non-conformités.

1. À la clôture d'une mission (`synchroniser_non_conformites`) : chaque critère
   non conforme donne une non-conformité « Ouverte », avec une gravité et une
   date limite de correction.
2. À la validation du rapport (`appliquer_validation`) : les non-conformités
   que le Directeur avait marquées « Corrigées » sont vérifiées grâce aux réponses
   de ce contrôle : critère conforme = « Vérifiée », critère toujours non conforme
   = de nouveau « Ouverte », avec un nouveau délai et un compteur de récidive.

Chaque étape est inscrite dans l'historique de la non-conformité
(`EvenementNonConformite`) : qui a fait quoi, et quand.

Gravité : elle découle du poids du critère dans sa grille, comparé au poids moyen
des critères de cette grille. Les seuils et les délais sont des paramètres que le
Directeur peut modifier (table « Paramètres du score ») ; à défaut, les valeurs
ci-dessous s'appliquent.
"""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg
from django.utils import timezone

from referentiels.models import ParametreScore
from suivi.notifications import notifier_non_conformites_rouvertes

from .models import EvenementNonConformite, NonConformite

PARAMETRES_PAR_DEFAUT = {
    # Poids du critère / poids moyen de la grille
    "gravite_ratio_critique": Decimal("2"),  # à partir de 2 x la moyenne : critique
    "gravite_ratio_majeure": Decimal("1"),  # à partir de la moyenne : majeure
    # Délai de correction, en jours, selon la gravité
    "delai_critique_jours": Decimal("7"),
    "delai_majeure_jours": Decimal("30"),
    "delai_mineure_jours": Decimal("90"),
}

LONGUEUR_DESCRIPTION = 500


def lire_parametres():
    """Les paramètres saisis par le Directeur, sinon les valeurs par défaut."""
    valeurs = dict(PARAMETRES_PAR_DEFAUT)
    for parametre in ParametreScore.objects.filter(cle__in=valeurs.keys()):
        valeurs[parametre.cle] = parametre.valeur
    return valeurs


def gravite_pour(critere, poids_moyen, parametres):
    if poids_moyen <= 0:
        return NonConformite.Gravite.MAJEURE
    rapport = Decimal(critere.ponderation) / poids_moyen
    if rapport >= parametres["gravite_ratio_critique"]:
        return NonConformite.Gravite.CRITIQUE
    if rapport >= parametres["gravite_ratio_majeure"]:
        return NonConformite.Gravite.MAJEURE
    return NonConformite.Gravite.MINEURE


def delai_en_jours(gravite, parametres):
    cle = {
        NonConformite.Gravite.CRITIQUE: "delai_critique_jours",
        NonConformite.Gravite.MAJEURE: "delai_majeure_jours",
        NonConformite.Gravite.MINEURE: "delai_mineure_jours",
    }[gravite]
    return int(parametres[cle])


def enregistrer_evenement(non_conformite, type_evenement, auteur=None, commentaire="", moyen=""):
    """Ajoute une ligne à l'historique d'une non-conformité."""
    return EvenementNonConformite.objects.create(
        non_conformite=non_conformite,
        type=type_evenement,
        auteur=auteur,
        commentaire=commentaire[:500],
        moyen=moyen,
    )


def _description(reponse):
    texte = reponse.critere.libelle
    if reponse.commentaire:
        texte = f"{texte} - {reponse.commentaire}"
    return texte[:LONGUEUR_DESCRIPTION]


def synchroniser_non_conformites(mission):
    """Met les non-conformités de la mission en accord avec ses réponses.

    On peut l'appeler plusieurs fois : après un rejet, la mission est clôturée de
    nouveau et les réponses ont pu changer. Renvoie le nombre de créations."""
    parametres = lire_parametres()
    site = mission.site
    aujourdhui = timezone.localdate()

    moyenne = mission.modele_grille.criteres.aggregate(m=Avg("ponderation"))["m"]
    poids_moyen = Decimal(str(moyenne)) if moyenne is not None else Decimal("0")

    # Un critère devenu conforme (reprise après un rejet) : sa non-conformité,
    # encore ouverte, n'a plus lieu d'être.
    NonConformite.objects.filter(
        reponse__mission=mission,
        reponse__est_conforme=True,
        statut=NonConformite.Statut.OUVERTE,
    ).delete()

    crees = 0
    for reponse in mission.reponses.filter(est_conforme=False).select_related("critere"):
        existante = NonConformite.objects.filter(reponse=reponse).first()
        if existante:
            # Clôture répétée : on met à jour le texte, rien d'autre
            if existante.statut == NonConformite.Statut.OUVERTE:
                existante.description = _description(reponse)
                existante.save(update_fields=["description"])
            continue

        # Le même défaut a déjà été signalé lors d'un contrôle précédent et n'est
        # pas encore vérifié : on ne crée pas de doublon.
        deja_signalee = (
            NonConformite.objects.filter(site=site, reponse__critere=reponse.critere)
            .exclude(statut=NonConformite.Statut.VERIFIEE)
            .exists()
        )
        if deja_signalee:
            continue

        gravite = gravite_pour(reponse.critere, poids_moyen, parametres)
        nc = NonConformite.objects.create(
            reponse=reponse,
            site=site,
            description=_description(reponse),
            gravite=gravite,
            date_limite_correction=aujourdhui
            + timedelta(days=delai_en_jours(gravite, parametres)),
        )
        enregistrer_evenement(
            nc,
            EvenementNonConformite.Type.CONSTATEE,
            auteur=mission.controleur,
            commentaire=f"Constatée lors de la mission n° {mission.pk}.",
        )
        crees += 1
    return crees


def appliquer_validation(mission):
    """Le Directeur valide le rapport de `mission` : on vérifie les corrections.

    Pour chaque non-conformité « Corrigée » du site, on regarde la réponse donnée
    à son critère dans cette mission. Renvoie (nb vérifiées, nb rouvertes)."""
    reponses = {r.critere_id: r for r in mission.reponses.all()}
    parametres = lire_parametres()
    aujourdhui = timezone.localdate()
    verifiees = 0
    rouvertes = 0

    a_verifier = NonConformite.objects.filter(
        site=mission.site, statut=NonConformite.Statut.CORRIGEE
    ).select_related("reponse")

    for nc in a_verifier:
        reponse = reponses.get(nc.reponse.critere_id)
        if reponse is None:
            continue  # ce critère n'a pas été contrôlé cette fois-ci : on attend
        if reponse.est_conforme:
            nc.statut = NonConformite.Statut.VERIFIEE
            nc.date_verification = aujourdhui
            nc.controleur = mission.controleur
            nc.save()
            enregistrer_evenement(
                nc,
                EvenementNonConformite.Type.VERIFIEE,
                auteur=mission.controleur,
                commentaire=f"Critère conforme lors de la mission n° {mission.pk}.",
            )
            verifiees += 1
        else:
            # La réparation n'a pas tenu : nouveau délai, et la récidive est comptée
            nc.statut = NonConformite.Statut.OUVERTE
            nc.date_correction = None
            nc.date_limite_correction = aujourdhui + timedelta(
                days=delai_en_jours(nc.gravite, parametres)
            )
            nc.nombre_reouvertures += 1
            nc.save()
            enregistrer_evenement(
                nc,
                EvenementNonConformite.Type.ROUVERTE,
                auteur=mission.controleur,
                commentaire=(
                    f"Critère toujours non conforme lors de la mission n° {mission.pk}. "
                    f"Nouveau délai : {nc.date_limite_correction:%d/%m/%Y}."
                ),
            )
            rouvertes += 1

    if rouvertes:
        notifier_non_conformites_rouvertes(mission.site, rouvertes)
    return verifiees, rouvertes