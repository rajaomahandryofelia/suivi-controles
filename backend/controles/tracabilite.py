"""Journal de traçabilité : quel contrôleur a fait quoi, où, à quelle heure et jusqu'à quand.

Une ligne par visite de site (une `Mission`) démarrée. Le Directeur voit tous les
contrôleurs ; un contrôleur ne voit que son propre journal."""

from xml.sax.saxutils import escape

from django.conf import settings
from django.db.models import Count
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from comptes.models import Utilisateur
from comptes.permissions import est_directeur

from .geotrajet import distance_trajet_m
from .models import Mission, PointTrajet
from .planificateur import distance_km
from .tracabilite_pdf import construire_pdf

# Au-delà de cette distance, la position enregistrée est signalée « éloignée du site »
SEUIL_ECART_M = 500

# La distance parcourue se calcule sur les points : on la limite aux visites les plus récentes
# pour que la liste reste rapide quand la période est très longue
MAX_TRAJETS_CALCULES = 300


def _nom(utilisateur):
    return utilisateur.get_full_name() or utilisateur.get_username()


def _lire_date(request, nom):
    brut = (request.query_params.get(nom) or "").strip()
    if not brut:
        return None
    try:
        valeur = parse_date(brut)
    except ValueError:
        valeur = None
    if valeur is None:
        raise ValidationError({"detail": f"Date « {nom} » invalide (format AAAA-MM-JJ)."})
    return valeur


def _ecart_m(latitude, longitude, site):
    """Distance entre la position enregistrée et le site, en mètres (None si inconnue)."""
    if None in (latitude, longitude, site.latitude, site.longitude):
        return None
    return round(distance_km(latitude, longitude, site.latitude, site.longitude) * 1000)


def _creneau(mission):
    if not mission.heure_prevue:
        return ""
    debut = f"{mission.heure_prevue:%H:%M}"
    if not mission.heure_fin_prevue:
        return debut
    return f"{debut} → {mission.heure_fin_prevue:%H:%M}"


def _comptes_points(ids):
    """Nombre de points du trajet de chaque mission : {mission: nombre}. Une seule requête."""
    if not ids:
        return {}
    lignes = (
        PointTrajet.objects.filter(mission_id__in=ids)
        .order_by()
        .values_list("mission_id")
        .annotate(n=Count("id"))
    )
    return dict(lignes)


def _distances_trajets(ids):
    """Distance parcourue (en mètres) de chaque mission, d'après les points de son trajet."""
    if not ids:
        return {}
    positions = {}
    lignes = (
        PointTrajet.objects.filter(mission_id__in=ids)
        .order_by("mission_id", "releve_le")
        .values_list("mission_id", "latitude", "longitude")
    )
    for mission_id, latitude, longitude in lignes.iterator():
        positions.setdefault(mission_id, []).append((float(latitude), float(longitude)))
    return {mission_id: distance_trajet_m(suite) for mission_id, suite in positions.items()}


def _ligne(mission, nb_points=0, distance_trajet=None):
    site = mission.site
    debut, fin = mission.date_debut_reelle, mission.date_fin_reelle

    duree = None
    if debut and fin:
        duree = max(int((fin - debut).total_seconds() // 60), 0)

    ecart_debut = _ecart_m(mission.latitude_debut, mission.longitude_debut, site)
    ecart_fin = _ecart_m(mission.latitude_fin, mission.longitude_fin, site)

    rapport = getattr(mission, "rapport", None)
    return {
        "mission": mission.pk,
        "tournee": mission.tournee_id,
        "controleur_id": mission.controleur_id,
        "controleur": _nom(mission.controleur),
        "site": site.nom,
        "localisation": site.localisation,
        "statut": mission.statut,
        "statut_libelle": mission.get_statut_display(),
        "date_prevue": mission.date_prevue,
        "creneau": _creneau(mission),
        "debut": debut,
        "fin": fin,
        "duree_min": duree,
        "latitude_debut": str(mission.latitude_debut) if mission.latitude_debut is not None else None,
        "longitude_debut": str(mission.longitude_debut) if mission.longitude_debut is not None else None,
        "latitude_fin": str(mission.latitude_fin) if mission.latitude_fin is not None else None,
        "longitude_fin": str(mission.longitude_fin) if mission.longitude_fin is not None else None,
        # Démarrage ou clôture automatique : l'heure prévue est enregistrée, sans position GPS
        "debut_auto": debut is not None and mission.latitude_debut is None,
        "fin_auto": fin is not None and mission.latitude_fin is None,
        "ecart_debut_m": ecart_debut,
        "ecart_fin_m": ecart_fin,
        "debut_loin": ecart_debut is not None and ecart_debut > SEUIL_ECART_M,
        "fin_loin": ecart_fin is not None and ecart_fin > SEUIL_ECART_M,
        "nb_criteres": mission.nb_criteres,
        "nb_reponses": mission.nb_reponses,
        "nb_photos": mission.nb_photos,
        "nb_non_conformites": mission.nb_nc,
        # Trajet : nombre de positions relevées, et distance parcourue (None si pas de trajet,
        # ou si la visite est trop ancienne pour que la distance ait été calculée)
        "nb_points": nb_points,
        "distance_trajet_m": distance_trajet,
        "rapport": (
            {
                "statut": rapport.statut,
                "statut_libelle": rapport.get_statut_display(),
                "score": rapport.score_conformite,
            }
            if rapport
            else None
        ),
    }


def _collecter(request):
    """Les visites demandées par les filtres, leur synthèse et le libellé du contrôleur."""
    directeur = est_directeur(request.user)
    du = _lire_date(request, "du")
    au = _lire_date(request, "au")
    if du and au and du > au:
        raise ValidationError({"detail": "La date de début doit précéder la date de fin."})

    visites = (
        Mission.objects.filter(
            statut__in=[Mission.Statut.EN_COURS, Mission.Statut.CLOTUREE],
            date_debut_reelle__isnull=False,
        )
        .select_related("site", "controleur", "rapport")
        .annotate(
            nb_criteres=Count("modele_grille__criteres", distinct=True),
            nb_reponses=Count("reponses", distinct=True),
            nb_photos=Count("reponses__photos", distinct=True),
            nb_nc=Count("reponses__non_conformite", distinct=True),
        )
    )

    qui = "Tous les contrôleurs"
    if directeur:
        brut = (request.query_params.get("controleur") or "").strip()
        if brut:
            if not brut.isdigit():
                raise ValidationError({"detail": "Contrôleur invalide."})
            visites = visites.filter(controleur_id=int(brut))
            controleur = Utilisateur.objects.filter(pk=int(brut)).first()
            if controleur is not None:
                qui = _nom(controleur)
    else:
        visites = visites.filter(controleur=request.user)
        qui = _nom(request.user)

    if du:
        visites = visites.filter(date_prevue__gte=du)
    if au:
        visites = visites.filter(date_prevue__lte=au)

    visites = list(visites)

    # Trajets : le nombre de points pour toutes les visites, la distance pour les plus récentes
    ids = [m.pk for m in visites]
    comptes = _comptes_points(ids)
    a_mesurer = [i for i in ids if comptes.get(i, 0) >= 2][:MAX_TRAJETS_CALCULES]
    distances = _distances_trajets(a_mesurer)

    lignes = [_ligne(m, comptes.get(m.pk, 0), distances.get(m.pk)) for m in visites]
    lignes.sort(key=lambda l: (l["controleur"], l["date_prevue"], l["creneau"], l["mission"]))

    synthese = {
        "visites": len(lignes),
        "cloturees": sum(1 for l in lignes if l["statut"] == Mission.Statut.CLOTUREE),
        "en_cours": sum(1 for l in lignes if l["statut"] == Mission.Statut.EN_COURS),
        "duree_totale_min": sum(l["duree_min"] or 0 for l in lignes),
        "sans_position": sum(1 for l in lignes if l["debut_auto"]),
        "eloignees": sum(1 for l in lignes if l["debut_loin"] or l["fin_loin"]),
        "avec_trajet": sum(1 for l in lignes if l["nb_points"] > 0),
        "distance_totale_m": sum(l["distance_trajet_m"] or 0 for l in lignes),
    }

    if du and au:
        periode = f"du {du:%d/%m/%Y} au {au:%d/%m/%Y}"
    elif du:
        periode = f"à partir du {du:%d/%m/%Y}"
    elif au:
        periode = f"jusqu'au {au:%d/%m/%Y}"
    else:
        periode = "toutes les dates"

    return lignes, synthese, qui, periode


class TracabiliteView(APIView):
    """GET /api/controles/tracabilite/?controleur=3&du=2026-11-01&au=2026-11-30"""

    def get(self, request):
        lignes, synthese, _, _ = _collecter(request)
        reponse = {
            "visites": lignes,
            "synthese": synthese,
            "seuil_ecart_m": SEUIL_ECART_M,
        }
        if est_directeur(request.user):
            controleurs = Utilisateur.objects.filter(
                role=Utilisateur.Role.CONTROLEUR, is_active=True
            ).order_by("last_name", "first_name", "username")
            reponse["controleurs"] = [{"id": c.pk, "nom": _nom(c)} for c in controleurs]
        return Response(reponse)


# ---- Export PDF --------------------------------------------------------------


def _heure(instant):
    return f"{timezone.localtime(instant):%d/%m/%Y %H:%M}"


def _distance_texte(metres):
    return f"{metres} m" if metres < 1000 else f"{metres / 1000:.1f} km".replace(".", ",")


def _duree_texte(minutes):
    if minutes is None:
        return "-"
    heures, reste = divmod(minutes, 60)
    return f"{heures} h {reste:02d}" if heures else f"{reste} min"


def _moment(instant, latitude, longitude, auto, ecart, loin, absent):
    """Heure et lieu d'un démarrage ou d'une clôture, en texte pour le PDF."""
    if instant is None:
        return absent
    texte = _heure(instant)
    if auto:
        return f"{texte}<br/>Automatique, sans position GPS"
    texte += f"<br/>GPS {escape(latitude)}, {escape(longitude)}"
    if ecart is not None:
        texte += f"<br/>à {_distance_texte(ecart)} du site"
        if loin:
            texte += " (éloigné)"
    return texte


def _ligne_pdf(l):
    controle = f"{l['nb_reponses']}/{l['nb_criteres']} critères"
    controle += f"<br/>{l['nb_non_conformites']} non-conf. · {l['nb_photos']} photo(s)"
    if l["rapport"]:
        score = f"{float(l['rapport']['score']):.0f} %"
        controle += f"<br/>Rapport {escape(l['rapport']['statut_libelle'].lower())} ({score})"

    date = f"{l['date_prevue']:%d/%m/%Y}"
    if l["creneau"]:
        date += f"<br/>{escape(l['creneau'])}"

    return {
        "date": date,
        "controleur": escape(l["controleur"]),
        "site": f"<b>{escape(l['site'])}</b><br/>{escape(l['localisation'])}",
        "debut": _moment(
            l["debut"], l["latitude_debut"], l["longitude_debut"],
            l["debut_auto"], l["ecart_debut_m"], l["debut_loin"], "-",
        ),
        "fin": _moment(
            l["fin"], l["latitude_fin"], l["longitude_fin"],
            l["fin_auto"], l["ecart_fin_m"], l["fin_loin"], "En cours",
        ),
        "duree": _duree_texte(l["duree_min"]),
        "controle": controle,
        "statut": escape(l["statut_libelle"]),
    }


class TracabilitePdfView(APIView):
    """GET /api/controles/tracabilite/pdf/ : mêmes filtres que la liste."""

    def get(self, request):
        lignes, synthese, qui, periode = _collecter(request)

        resume = (
            f"<b>{synthese['visites']}</b> visite(s) de site, "
            f"<b>{synthese['cloturees']}</b> clôturée(s), "
            f"temps total <b>{_duree_texte(synthese['duree_totale_min'])}</b>"
        )
        if synthese["sans_position"]:
            resume += f", {synthese['sans_position']} démarrée(s) sans position GPS"
        if synthese["eloignees"]:
            resume += f", {synthese['eloignees']} position(s) éloignée(s) du site (plus de {SEUIL_ECART_M} m)"

        pdf = construire_pdf(
            lignes=[_ligne_pdf(l) for l in lignes],
            synthese=resume,
            institution=getattr(settings, "NOM_INSTITUTION", "Ministère"),
            periode=periode,
            qui=escape(qui),
            genere_le=f"{timezone.localtime():%d/%m/%Y à %H:%M}",
            genere_par=escape(_nom(request.user)),
        )
        reponse = HttpResponse(pdf, content_type="application/pdf")
        reponse["Content-Disposition"] = 'inline; filename="journal_tracabilite.pdf"'
        return reponse