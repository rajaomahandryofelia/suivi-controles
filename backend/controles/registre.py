from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from comptes.models import Utilisateur
from comptes.permissions import est_directeur

from .models import OrdreMission, OrdreRoute

TYPE_MISSION = "MISSION"
TYPE_ROUTE = "ROUTE"

TAILLE_PAR_DEFAUT = 15
TAILLE_MAXIMALE = 100

# Chemins vers le contrôleur : un ordre de mission passe par la tournée
# ou par la mission isolée ; un ordre de route toujours par la tournée.
CHEMINS_ORDRE_MISSION = ("tournee__controleur", "mission__controleur")
CHEMINS_ORDRE_ROUTE = ("tournee__controleur",)


def _lire_entier(request, nom, defaut, minimum=1, maximum=None):
    brut = request.query_params.get(nom)
    if brut in (None, ""):
        return defaut
    try:
        valeur = int(brut)
    except ValueError:
        raise ValidationError({"detail": f"Paramètre « {nom} » invalide."})
    valeur = max(valeur, minimum)
    if maximum is not None:
        valeur = min(valeur, maximum)
    return valeur


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


def _filtrer(queryset, chemins, q, controleur, du, au):
    # Chaque mot doit se retrouver dans le numéro ou dans le nom du contrôleur
    for mot in q.split():
        condition = Q(numero__icontains=mot)
        for chemin in chemins:
            condition |= (
                Q(**{f"{chemin}__first_name__icontains": mot})
                | Q(**{f"{chemin}__last_name__icontains": mot})
                | Q(**{f"{chemin}__username__icontains": mot})
            )
        queryset = queryset.filter(condition)
    if controleur:
        condition = Q()
        for chemin in chemins:
            condition |= Q(**{f"{chemin}__pk": controleur})
        queryset = queryset.filter(condition)
    if du:
        queryset = queryset.filter(date_emission__gte=du)
    if au:
        queryset = queryset.filter(date_emission__lte=au)
    return queryset


def _ligne(ordre, genre):
    if ordre.tournee_id:
        tournee = ordre.tournee
        controleur = tournee.controleur
        rattachement = {
            "portee": "TOURNEE",
            "tournee_id": tournee.pk,
            "mission_id": None,
            "date_tournee": tournee.date,
            "statut": tournee.statut,
            "statut_libelle": tournee.get_statut_display(),
        }
    else:
        # Ordre de mission d'une mission isolée
        mission = ordre.mission
        controleur = mission.controleur
        rattachement = {
            "portee": "MISSION",
            "tournee_id": None,
            "mission_id": mission.pk,
            # Date de la tournée ou de la mission isolée : la « date du contrôle »
            "date_tournee": mission.date_prevue,
            "statut": mission.statut,
            "statut_libelle": mission.get_statut_display(),
        }
    return {
        "type": genre,
        "numero": ordre.numero,
        "date_emission": ordre.date_emission,
        "controleur_id": controleur.pk,
        "controleur": controleur.get_full_name() or controleur.get_username(),
        **rattachement,
    }


class OrdreViewSet(viewsets.ViewSet):
    """Registre des ordres de mission et de route délivrés (Directeur uniquement)."""

    def list(self, request):
        if not est_directeur(request.user):
            raise PermissionDenied("Réservé au Directeur.")

        q = (request.query_params.get("q") or "").strip()[:100]
        genre_demande = (request.query_params.get("type") or "").strip().upper()
        if genre_demande not in ("", TYPE_MISSION, TYPE_ROUTE):
            raise ValidationError({"detail": "Type d'ordre inconnu."})
        controleur = _lire_entier(request, "controleur", None)
        du = _lire_date(request, "du")
        au = _lire_date(request, "au")
        if du and au and du > au:
            raise ValidationError(
                {"detail": "La date de début doit précéder la date de fin."}
            )
        taille = _lire_entier(request, "taille", TAILLE_PAR_DEFAUT, 1, TAILLE_MAXIMALE)
        page = _lire_entier(request, "page", 1)

        sources = []
        if genre_demande in ("", TYPE_MISSION):
            sources.append(
                (
                    TYPE_MISSION,
                    OrdreMission.objects.select_related(
                        "tournee__controleur", "mission__controleur"
                    ),
                    CHEMINS_ORDRE_MISSION,
                )
            )
        if genre_demande in ("", TYPE_ROUTE):
            sources.append(
                (
                    TYPE_ROUTE,
                    OrdreRoute.objects.select_related("tournee__controleur"),
                    CHEMINS_ORDRE_ROUTE,
                )
            )

        querysets = [
            (
                genre,
                _filtrer(qs, chemins, q, controleur, du, au).order_by(
                    "-date_emission", "-numero"
                ),
            )
            for genre, qs, chemins in sources
        ]

        total = sum(qs.count() for _, qs in querysets)
        pages = max(1, -(-total // taille))
        page = min(page, pages)

        # Pour la page N, il suffit de lire les N × taille premières lignes de chaque table
        limite = page * taille
        lignes = []
        for genre, qs in querysets:
            lignes.extend(_ligne(ordre, genre) for ordre in qs[:limite])
        lignes.sort(key=lambda l: (l["date_emission"], l["numero"]), reverse=True)
        debut = (page - 1) * taille

        # Liste des contrôleurs ayant au moins un ordre (pour le filtre de la page)
        controleurs = (
            Utilisateur.objects.filter(
                Q(tournees__ordre_mission__isnull=False)
                | Q(tournees__ordre_route__isnull=False)
                | Q(missions__ordre_mission__isnull=False)
            )
            .distinct()
            .order_by("last_name", "first_name", "username")
        )

        return Response(
            {
                "count": total,
                "page": page,
                "taille": taille,
                "pages": pages,
                "resultats": lignes[debut : debut + taille],
                "controleurs": [
                    {"id": c.pk, "nom": c.get_full_name() or c.get_username()}
                    for c in controleurs
                ],
            }
        )