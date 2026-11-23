from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.core.files.base import ContentFile
from django.utils import timezone

from suivi.notifications import notifier_rapport_genere

from .models import NonConformite, Photo, Rapport
from .regles_non_conformites import synchroniser_non_conformites
from .rapport_pdf import construire_pdf


def criteres_obligatoires_manquants(mission):
    """Les critères obligatoires de la grille qui n'ont pas encore de réponse.

    C'est le `verifierDonneesMission()` de ta séquence de clôture."""
    repondus = mission.reponses.values_list("critere_id", flat=True)
    return mission.modele_grille.criteres.filter(est_obligatoire=True).exclude(
        id__in=repondus
    )


def criteres_non_conformes_sans_photo(mission):
    """Les critères jugés non conformes qui n'ont aucune photo : la preuve manque.

    Un constat sans photo ne se défend pas devant le partenaire : la clôture est refusée."""
    ids = list(
        mission.reponses.filter(est_conforme=False, photos__isnull=True).values_list(
            "critere_id", flat=True
        )
    )
    return mission.modele_grille.criteres.filter(id__in=ids)


def calculer_score_conformite(mission):
    """Pourcentage de conformité de la mission, pondéré par les critères."""
    total = Decimal("0")
    conforme = Decimal("0")
    reponses = mission.reponses.select_related("critere")

    for reponse in reponses:
        poids = reponse.critere.ponderation
        total += poids
        if reponse.est_conforme:
            conforme += poids

    if total == 0:
        # Aucune pondération : on compte simplement les réponses
        nb = reponses.count()
        if nb == 0:
            return Decimal("0.00")
        nb_conformes = reponses.filter(est_conforme=True).count()
        return (Decimal(nb_conformes) * 100 / nb).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

    return (conforme * 100 / total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Rapport PDF
# ---------------------------------------------------------------------------

def _formater_date(valeur, avec_heure=True):
    """Date (ou date et heure) au format français ; None reste None."""
    if valeur is None:
        return None
    if avec_heure:
        if timezone.is_aware(valeur):
            valeur = timezone.localtime(valeur)
        return f"{valeur:%d/%m/%Y à %H:%M}"
    return f"{valeur:%d/%m/%Y}"


def _position(latitude, longitude):
    if latitude is None or longitude is None:
        return "position non disponible"
    return f"{latitude}, {longitude}"


def _duree(debut, fin):
    if debut is None or fin is None:
        return None
    minutes = max(int((fin - debut).total_seconds() // 60), 0)
    jours, reste = divmod(minutes, 24 * 60)
    heures, minutes = divmod(reste, 60)
    morceaux = []
    if jours:
        morceaux.append(f"{jours} j")
    if heures:
        morceaux.append(f"{heures} h")
    if minutes or not morceaux:
        morceaux.append(f"{minutes} min")
    return " ".join(morceaux)


def _non_conformite_de(reponse):
    """La non-conformité liée à une réponse, ou None si elle n'existe pas (encore)."""
    try:
        return reponse.non_conformite
    except ObjectDoesNotExist:
        return None


def _non_conformite_active(site, critere):
    """Une non-conformité déjà signalée (et pas encore vérifiée) pour ce critère et ce site."""
    return (
        NonConformite.objects.filter(site=site, reponse__critere=critere)
        .exclude(statut=NonConformite.Statut.VERIFIEE)
        .order_by("-id")
        .first()
    )


def _lire_photo(photo):
    """Octets de l'image, ou None si le fichier est introuvable."""
    try:
        with photo.fichier.open("rb") as fichier:
            return fichier.read()
    except (OSError, ValueError):
        return None


def _photo_vers_dict(photo, contexte):
    return {
        "contenu": _lire_photo(photo),
        "legende": photo.legende,
        "contexte": contexte,
        "date": _formater_date(photo.date_capture),
    }


def _chemin_logo():
    """Logo facultatif : BASE_DIR/assets/logo_ortm.png (en-tête du PDF)."""
    base = getattr(settings, "BASE_DIR", None)
    if base is None:
        return None
    chemin = Path(base) / "assets" / "logo_ortm.png"
    return chemin if chemin.exists() else None


def _collecter_donnees(mission, score):
    """Rassemble tout ce que le PDF doit afficher, sous forme de textes simples."""
    site = mission.site
    reponses = list(
        mission.reponses.select_related("critere", "non_conformite")
        .prefetch_related("photos")
        .order_by("critere__ordre")
    )

    lignes_reponses = []
    non_conformites = []
    photos = []

    for reponse in reponses:
        critere = reponse.critere
        lignes_reponses.append(
            {
                "ordre": critere.ordre,
                "libelle": critere.libelle,
                "valeur": reponse.valeur,
                "conforme": reponse.est_conforme,
                "commentaire": reponse.commentaire,
            }
        )

        if not reponse.est_conforme:
            nc = _non_conformite_de(reponse) or _non_conformite_active(site, critere)
            constat = reponse.commentaire
            if nc and nc.reponse_id != reponse.id:
                # Défaut déjà signalé lors d'un contrôle précédent
                date_signalement = _formater_date(nc.date_detection, avec_heure=False)
                constat = f"{constat} (déjà signalée le {date_signalement})".strip()
            non_conformites.append(
                {
                    "critere": f"{critere.ordre}. {critere.libelle}",
                    "constat": constat,
                    "gravite": nc.get_gravite_display() if nc else None,
                    "date_limite": (
                        _formater_date(nc.date_limite_correction, avec_heure=False)
                        if nc
                        else None
                    ),
                }
            )

        for photo in reponse.photos.all():
            photos.append(_photo_vers_dict(photo, f"Critère {critere.ordre}"))

    # Photos de l'inventaire prises pendant la mission
    if mission.date_debut_reelle and mission.date_fin_reelle:
        photos_inventaire = (
            Photo.objects.filter(
                element_inventaire__site=site,
                date_capture__range=(mission.date_debut_reelle, mission.date_fin_reelle),
            )
            .select_related("element_inventaire")
            .order_by("date_capture")
        )
        for photo in photos_inventaire:
            photos.append(
                _photo_vers_dict(photo, f"Inventaire : {photo.element_inventaire.type}")
            )

    inventaire = [
        {"type": element.type, "description": element.description}
        for element in site.elements.order_by("type")
    ]

    controleur = mission.controleur
    return {
        "numero": mission.pk,
        "site_nom": site.nom,
        "localisation": site.localisation,
        "type_site": site.type_site.libelle,
        "partenaire": site.partenaire.nom if site.partenaire else None,
        "controleur": controleur.get_full_name() or controleur.get_username(),
        "date_prevue": _formater_date(mission.date_prevue, avec_heure=False),
        "debut": _formater_date(mission.date_debut_reelle),
        "position_debut": _position(mission.latitude_debut, mission.longitude_debut),
        "fin": _formater_date(mission.date_fin_reelle),
        "position_fin": _position(mission.latitude_fin, mission.longitude_fin),
        "duree": _duree(mission.date_debut_reelle, mission.date_fin_reelle),
        "score": score,
        "nb_conformes": sum(1 for r in reponses if r.est_conforme),
        "nb_criteres": len(reponses),
        "genere_le": _formater_date(timezone.now()),
        "logo": _chemin_logo(),
        "reponses": lignes_reponses,
        "non_conformites": non_conformites,
        "inventaire": inventaire,
        "photos": photos,
    }


def generer_rapport_pdf(mission):
    """Crée (ou remplace) le rapport PDF d'une mission clôturée.

    C'est ton `genererRapportPDF()`."""
    score = calculer_score_conformite(mission)

    # Les critères non conformes deviennent des non-conformités (avant le PDF, qui les affiche)
    synchroniser_non_conformites(mission)

    contenu = construire_pdf(_collecter_donnees(mission, score))

    rapport, _ = Rapport.objects.get_or_create(
        mission=mission, defaults={"score_conformite": score}
    )
    rapport.score_conformite = score
    rapport.statut = Rapport.Statut.GENERE
    # Nouveau rapport (première clôture ou reprise après un rejet) : on repart à zéro
    rapport.directeur = None
    rapport.date_validation = None
    rapport.motif_rejet = ""

    # Mission clôturée de nouveau après un rejet : on supprime l'ancien fichier
    if rapport.fichier_pdf:
        rapport.fichier_pdf.delete(save=False)
    rapport.fichier_pdf.save(
        f"rapport_mission_{mission.pk}.pdf", ContentFile(contenu), save=False
    )
    rapport.save()

    # Les Directeurs ont un rapport à valider
    notifier_rapport_genere(rapport)
    return rapport