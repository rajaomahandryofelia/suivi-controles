from datetime import time
from decimal import Decimal
from math import asin, cos, radians, sin, sqrt

from referentiels.models import ParametreScore

RAYON_TERRE_KM = 6371.0

# Utilisés tant que le Directeur n'a pas créé le paramètre dans l'administration
PARAMETRES_PAR_DEFAUT = {
    "vitesse_moyenne_kmh": Decimal("30"),
    "duree_controle_min": Decimal("45"),
    "influence_risque": Decimal("50"),
}


def lire_parametres():
    valeurs = dict(PARAMETRES_PAR_DEFAUT)
    for parametre in ParametreScore.objects.filter(cle__in=valeurs.keys()):
        valeurs[parametre.cle] = parametre.valeur
    return {cle: float(valeur) for cle, valeur in valeurs.items()}


def distance_km(lat1, lon1, lat2, lon2):
    """Distance à vol d'oiseau entre deux points GPS (formule de Haversine)."""
    lat1, lon1, lat2, lon2 = map(radians, (float(lat1), float(lon1), float(lat2), float(lon2)))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * RAYON_TERRE_KM * asin(sqrt(a))


def risque_du_site(site):
    """Le dernier score de risque du site (0 à 100), 50 si jamais calculé."""
    dernier = site.scores.first()
    return float(dernier.valeur) if dernier else 50.0


def calculer_ordre_optimal(missions):
    """Ton `calculerOrdreOptimal()`.

    Heuristique du « plus proche voisin pondéré par le risque » :
    - on commence par le site le plus risqué ;
    - puis, à chaque étape, on va vers le site qui minimise
        distance / (1 + risque * influence / 10000)
      Un site très risqué paraît donc « plus proche » qu'il ne l'est, ce qui
      le fait passer plus tôt dans la journée, sans trop rallonger le trajet.

    Renvoie la liste ordonnée des missions."""
    p = lire_parametres()
    influence = p["influence_risque"]

    restantes = list(missions)
    if not restantes:
        return []

    risques = {m.id: risque_du_site(m.site) for m in restantes}

    premiere = max(restantes, key=lambda m: risques[m.id])
    ordre = [premiere]
    restantes.remove(premiere)

    while restantes:
        courante = ordre[-1].site

        def cout(mission):
            d = distance_km(
                courante.latitude, courante.longitude,
                mission.site.latitude, mission.site.longitude,
            )
            return d / (1 + risques[mission.id] * influence / 10000)

        suivante = min(restantes, key=cout)
        ordre.append(suivante)
        restantes.remove(suivante)

    return ordre


def estimer_distance_et_duree(missions_ordonnees):
    """Ton `estimerDistanceEtDuree()` : kilomètres et minutes pour toute la tournée."""
    p = lire_parametres()

    total_km = 0.0
    for avant, apres in zip(missions_ordonnees, missions_ordonnees[1:]):
        total_km += distance_km(
            avant.site.latitude, avant.site.longitude,
            apres.site.latitude, apres.site.longitude,
        )

    trajet_min = (total_km / p["vitesse_moyenne_kmh"]) * 60
    controles_min = len(missions_ordonnees) * p["duree_controle_min"]

    return round(Decimal(str(total_km)), 2), int(round(trajet_min + controles_min))


# ---------------------------------------------------------------------------
# Explication de la tournée (affichée dans l'interface)
# ---------------------------------------------------------------------------


def _distance_totale(missions):
    return sum(
        distance_km(
            avant.site.latitude, avant.site.longitude,
            apres.site.latitude, apres.site.longitude,
        )
        for avant, apres in zip(missions, missions[1:])
    )


def decrire_tournee(missions_ordonnees):
    """Pour chaque étape : le site, son risque, la distance depuis l'étape précédente
    et une phrase qui explique pourquoi il est placé là.

    Renvoie aussi la distance qu'aurait eue la même journée dans l'ordre
    chronologique des missions (heure prévue), pour mesurer ce que l'algorithme change."""
    missions = list(missions_ordonnees)
    scores = {m.id: m.site.scores.first() for m in missions}
    risques = {
        m.id: (float(scores[m.id].valeur) if scores[m.id] else 50.0) for m in missions
    }

    etapes = []
    for rang, mission in enumerate(missions, start=1):
        site = mission.site
        score = scores[mission.id]
        distance = None

        if rang == 1:
            if len(missions) == 1:
                explication = "Seule mission de la journée."
            else:
                explication = (
                    f"Point de départ : site le plus risqué de la journée "
                    f"(score {risques[mission.id]:.0f})."
                )
        else:
            precedent = missions[rang - 2].site
            distance = distance_km(
                precedent.latitude, precedent.longitude, site.latitude, site.longitude
            )
            # Le site restant le plus proche, sans tenir compte du risque
            restantes = missions[rang - 1:]
            plus_proche = min(
                restantes,
                key=lambda m: distance_km(
                    precedent.latitude, precedent.longitude,
                    m.site.latitude, m.site.longitude,
                ),
            )
            d_proche = distance_km(
                precedent.latitude, precedent.longitude,
                plus_proche.site.latitude, plus_proche.site.longitude,
            )
            if plus_proche.id != mission.id and d_proche + 1e-9 < distance:
                explication = (
                    f"Passé avant « {plus_proche.site.nom} » (à {d_proche:.1f} km seulement) "
                    f"car son risque est plus élevé "
                    f"(score {risques[mission.id]:.0f} contre {risques[plus_proche.id]:.0f})."
                )
            else:
                explication = f"Site le plus proche du précédent ({distance:.1f} km)."

        etapes.append(
            {
                "rang": rang,
                "mission": mission.id,
                "site": site.id,
                "site_nom": site.nom,
                "site_localisation": site.localisation,
                "latitude": str(site.latitude),
                "longitude": str(site.longitude),
                "risque": float(score.valeur) if score else None,
                "niveau": score.niveau if score else None,
                "niveau_libelle": score.get_niveau_display() if score else None,
                "distance_depuis_precedent_km": (
                    round(distance, 2) if distance is not None else None
                ),
                "explication": explication,
            }
        )

    # Ordre « naïf » : les missions dans l'ordre de leur heure prévue
    reference = sorted(
        missions,
        key=lambda m: (m.heure_prevue is None, m.heure_prevue or time.min, m.id),
    )

    return {
        "etapes": etapes,
        "distance_reference_km": round(_distance_totale(reference), 2),
    }