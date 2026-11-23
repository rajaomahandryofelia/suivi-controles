"""Carte en direct du Directeur : où sont les contrôleurs, sur quel site, et où en est chaque contrôle."""

from datetime import datetime, timedelta

from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from comptes.permissions import est_directeur
from referentiels.models import Site

from .models import Mission
from .tracabilite import SEUIL_ECART_M, _comptes_points, _creneau, _ligne, _nom

# Les états d'un site sur la carte, du plus urgent au plus calme
ETATS = [
    ("retard", "En retard"),
    ("sur_place", "Contrôleur sur place"),
    ("demarree", "Démarrée, arrivée non signalée"),
    ("prevue", "Prévue"),
    ("cloturee", "Terminée, rapport envoyé"),
    ("validee", "Rapport validé"),
]
LIBELLES = dict(ETATS)

# Une position relevée depuis moins longtemps que cela est considérée « en direct »
POSITION_RECENTE = timedelta(minutes=5)


def _fin_prevue(mission):
    if not (mission.date_fin_prevue and mission.heure_fin_prevue):
        return None
    return timezone.make_aware(datetime.combine(mission.date_fin_prevue, mission.heure_fin_prevue))


def _etat(mission, maintenant):
    if mission.statut == Mission.Statut.CLOTUREE:
        rapport = getattr(mission, "rapport", None)
        return "validee" if rapport and rapport.statut == "VALIDE" else "cloturee"
    if mission.statut == Mission.Statut.EN_COURS:
        fin = _fin_prevue(mission)
        if fin is not None and maintenant > fin:
            return "retard"
        return "sur_place" if mission.latitude_debut is not None else "demarree"
    return "prevue"


def _position_actuelle(mission, maintenant):
    """La dernière position relevée d'une mission en cours (None s'il n'y en a pas)."""
    if mission.statut != Mission.Statut.EN_COURS:
        return None
    dernier = mission.points_trajet.order_by("-releve_le").first()
    if dernier is None:
        return None
    return {
        "latitude": str(dernier.latitude),
        "longitude": str(dernier.longitude),
        "precision_m": dernier.precision_m,
        "releve_le": dernier.releve_le,
        "recente": maintenant - dernier.releve_le <= POSITION_RECENTE,
    }


def _resume(mission):
    """Une mission en quelques mots, pour la fiche d'un site."""
    rapport = getattr(mission, "rapport", None)
    return {
        "mission": mission.pk,
        "controleur": _nom(mission.controleur),
        "date": mission.date_prevue,
        "creneau": _creneau(mission),
        "debut": mission.date_debut_reelle,
        "fin": mission.date_fin_reelle,
        "statut_libelle": mission.get_statut_display(),
        "rapport": (
            {"statut_libelle": rapport.get_statut_display(), "score": rapport.score_conformite}
            if rapport
            else None
        ),
    }


class CarteView(APIView):
    """GET /api/controles/tracabilite/carte/?date=2026-11-05  (Directeur)"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not est_directeur(request.user):
            raise PermissionDenied("Cette carte est réservée au Directeur.")

        brut = (request.query_params.get("date") or "").strip()
        jour = parse_date(brut) if brut else timezone.localdate()
        if jour is None:
            raise ValidationError({"detail": "Date invalide (format AAAA-MM-JJ)."})

        maintenant = timezone.now()
        missions = list(
            Mission.objects.filter(
                Q(date_prevue=jour) | Q(statut=Mission.Statut.EN_COURS)
            )
            .select_related("site", "controleur", "rapport")
            .annotate(
                nb_criteres=Count("modele_grille__criteres", distinct=True),
                nb_reponses=Count("reponses", distinct=True),
                nb_photos=Count("reponses__photos", distinct=True),
                nb_nc=Count("reponses__non_conformite", distinct=True),
            )
        )
        comptes = _comptes_points([m.pk for m in missions])

        resultat = []
        sans_coordonnees = 0
        for mission in missions:
            site = mission.site
            if site.latitude is None or site.longitude is None:
                sans_coordonnees += 1
                continue
            ligne = _ligne(mission, comptes.get(mission.pk, 0))
            etat = _etat(mission, maintenant)
            ligne.update(
                {
                    "site_latitude": str(site.latitude),
                    "site_longitude": str(site.longitude),
                    "etat": etat,
                    "etat_libelle": LIBELLES[etat],
                    "site_id": site.pk,
                    "arrivee_enregistree": mission.latitude_debut is not None,
                    # Où est le contrôleur en ce moment (dernier point de son trajet)
                    "position_actuelle": _position_actuelle(mission, maintenant),
                }
            )
            resultat.append(ligne)

        ordre = {cle: i for i, (cle, _) in enumerate(ETATS)}
        resultat.sort(key=lambda l: (ordre[l["etat"]], l["creneau"], l["mission"]))

        resume = {cle: 0 for cle, _ in ETATS}
        for ligne in resultat:
            resume[ligne["etat"]] += 1

        # Tous les sites enregistrés (avec coordonnées) : le Directeur voit son réseau en entier,
        # avec pour chacun le dernier contrôle réalisé et la prochaine mission prévue
        enregistres = list(
            Site.objects.filter(
                est_actif=True, latitude__isnull=False, longitude__isnull=False
            ).select_related("type_site")
        )
        dernier, prochaine = {}, {}
        historique = (
            Mission.objects.filter(site_id__in=[s.pk for s in enregistres])
            .select_related("controleur", "rapport")
            .order_by("-date_prevue", "-heure_prevue")
        )
        for m in historique:
            if m.date_debut_reelle is not None and m.site_id not in dernier:
                dernier[m.site_id] = _resume(m)
            if m.statut == Mission.Statut.PLANIFIEE and m.date_prevue >= jour:
                prochaine[m.site_id] = _resume(m)  # tri décroissant : la dernière écrite est la plus proche

        sites = [
            {
                "id": s.pk,
                "nom": s.nom,
                "localisation": s.localisation,
                "latitude": str(s.latitude),
                "longitude": str(s.longitude),
                "type": s.type_site.libelle if s.type_site_id else "",
                "appartenance": s.get_appartenance_display(),
                "dernier_controle": dernier.get(s.pk),
                "prochaine_mission": prochaine.get(s.pk),
            }
            for s in enregistres
        ]

        return Response(
            {
                "date": jour,
                "sites": sites,
                "missions": resultat,
                "resume": resume,
                "etats": [{"cle": c, "libelle": l} for c, l in ETATS],
                "sans_coordonnees": sans_coordonnees,
                "seuil_ecart_m": SEUIL_ECART_M,
                "maj": maintenant,
            }
        )