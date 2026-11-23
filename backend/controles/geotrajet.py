"""Calculs sur les positions d'un trajet : distance parcourue, allègement du tracé."""

from math import asin, ceil, cos, radians, sin, sqrt

# En dessous, un déplacement est le bruit du GPS à l'arrêt : il n'est pas compté
PAS_MIN_M = 10


def distance_m(lat1, lon1, lat2, lon2):
    """Distance à vol d'oiseau entre deux positions, en mètres."""
    rayon = 6371000
    p1, p2 = radians(lat1), radians(lat2)
    dp = p2 - p1
    dl = radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * rayon * asin(sqrt(a))


def distance_trajet_m(positions):
    """Distance parcourue le long d'une suite de positions (latitude, longitude), en mètres."""
    total = 0.0
    for (lat1, lon1), (lat2, lon2) in zip(positions, positions[1:]):
        pas = distance_m(lat1, lon1, lat2, lon2)
        if pas >= PAS_MIN_M:
            total += pas
    return int(round(total))


def alleger(points, maximum):
    """Garde un point sur N pour ne pas envoyer trop de points à la carte (début et fin conservés)."""
    if len(points) <= maximum:
        return points
    pas = ceil(len(points) / maximum)
    gardes = points[::pas]
    if gardes[-1] is not points[-1]:
        gardes.append(points[-1])
    return gardes