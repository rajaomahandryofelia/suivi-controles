from urllib.parse import urlencode

from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError

from .models import Mission, OrdreMission, OrdreRoute


def url_verification(numero):
    """Adresse de la page publique du frontend, ouverte par le QR code."""
    base = str(settings.URL_APPLICATION).rstrip("/")
    return f"{base}/verifier?{urlencode({'numero': numero})}"


def carte_du_controleur(tournee):
    # None si le contrôleur n'a pas de carte enregistrée
    return getattr(tournee.controleur, "carte_professionnelle", None)


def ordre_mission_de(mission):
    """L'ordre de mission applicable à une mission : le sien (mission isolée)
    ou celui de sa tournée. None s'il n'y en a aucun."""
    propre = getattr(mission, "ordre_mission", None)
    if propre is not None:
        return propre
    if mission.tournee_id:
        return getattr(mission.tournee, "ordre_mission", None)
    return None


def pieces_tournee(tournee):
    """Les trois pièces officielles, au format attendu par le front."""
    carte = carte_du_controleur(tournee)
    om = getattr(tournee, "ordre_mission", None)
    ordre_route = getattr(tournee, "ordre_route", None)
    return {
        "carte_professionnelle": (
            {
                "numero": carte.numero,
                "date_expiration": carte.date_expiration,
                "valide": carte.est_valide_le(tournee.date),
            }
            if carte
            else None
        ),
        "ordre_mission": (
            {"numero": om.numero, "date_emission": om.date_emission} if om else None
        ),
        "ordre_route": (
            {
                "numero": ordre_route.numero,
                "depart": ordre_route.depart,
                "destination": ordre_route.destination,
                "transport": ordre_route.transport,
            }
            if ordre_route
            else None
        ),
    }


# ---- Numérotation des ordres de mission : OM-AAAA-NNNN ---------------------


def _prochain_numero_ordre_mission(annee):
    """Plus grand NNNN de l'année + 1 (un seul compteur pour les tournées et
    les missions isolées, donc jamais de doublon)."""
    prefixe = f"OM-{annee}-"
    dernier = 0
    numeros = OrdreMission.objects.filter(numero__startswith=prefixe).values_list(
        "numero", flat=True
    )
    for numero in numeros:
        try:
            dernier = max(dernier, int(numero.rsplit("-", 1)[1]))
        except (IndexError, ValueError):
            continue
    return f"{prefixe}{dernier + 1:04d}"


def _creer_ordre_mission(annee, **champs):
    """Crée l'ordre ; si deux délivrances simultanées visent le même numéro,
    la contrainte d'unicité en refuse une et on recalcule le numéro."""
    for _ in range(5):
        numero = _prochain_numero_ordre_mission(annee)
        try:
            with transaction.atomic():
                return OrdreMission.objects.create(numero=numero, **champs)
        except IntegrityError:
            continue
    raise ValidationError(
        {"detail": "Le numéro de l'ordre n'a pas pu être attribué. Réessayez."}
    )


# ---- Délivrance ------------------------------------------------------------


@transaction.atomic
def delivrer_ordres(tournee, directeur, depart, transport):
    """Vérifie la carte puis crée l'ordre de mission et l'ordre de route."""
    depart = (depart or "").strip()
    transport = (transport or "").strip()
    erreurs = {}
    if not depart:
        erreurs["depart"] = "Indiquez le point de départ."
    if not transport:
        erreurs["transport"] = "Indiquez le moyen de transport."

    carte = carte_du_controleur(tournee)
    if carte is None:
        erreurs["detail"] = "Ce contrôleur n'a pas de carte professionnelle enregistrée."
    elif not carte.est_valide_le(tournee.date):
        erreurs["detail"] = "La carte professionnelle du contrôleur est expirée ou pas encore valable."
    if erreurs:
        raise ValidationError(erreurs)

    premiere = (
        tournee.missions.select_related("site").order_by("ordre_dans_tournee").first()
    )
    if premiere is None:
        raise ValidationError({"detail": "Cette tournée ne contient aucune mission."})

    annee = tournee.date.year
    om = _creer_ordre_mission(annee, tournee=tournee, delivre_par=directeur)
    ordre_route = OrdreRoute.objects.create(
        tournee=tournee,
        numero=f"OR-{annee}-{tournee.pk:04d}",
        depart=depart,
        destination=premiere.site.nom,
        transport=transport,
    )
    return om, ordre_route


@transaction.atomic
def delivrer_ordre_mission(mission, directeur):
    """Ordre de mission d'une mission isolée (hors tournée). Pas d'ordre de route :
    il ne concerne que les tournées (déplacement)."""
    # Verrou : deux clics simultanés ne peuvent pas délivrer deux ordres
    mission = Mission.objects.select_for_update().get(pk=mission.pk)

    if mission.tournee_id:
        raise ValidationError(
            {
                "detail": "Cette mission fait partie d'une tournée : son ordre de mission "
                "est délivré à la validation de la tournée."
            }
        )
    if mission.statut != Mission.Statut.PLANIFIEE:
        raise ValidationError(
            {"detail": "L'ordre de mission ne peut être délivré que pour une mission planifiée."}
        )
    if OrdreMission.objects.filter(mission=mission).exists():
        raise ValidationError(
            {"detail": "L'ordre de mission de cette mission a déjà été délivré."}
        )

    carte = getattr(mission.controleur, "carte_professionnelle", None)
    if carte is None:
        raise ValidationError(
            {"detail": "Ce contrôleur n'a pas de carte professionnelle enregistrée."}
        )
    if not carte.est_valide_le(mission.date_prevue):
        raise ValidationError(
            {"detail": "La carte professionnelle du contrôleur est expirée ou pas encore valable."}
        )

    return _creer_ordre_mission(
        mission.date_prevue.year, mission=mission, delivre_par=directeur
    )