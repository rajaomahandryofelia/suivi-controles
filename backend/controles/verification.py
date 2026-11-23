"""Données publiques de la page /verifier (cible du QR code des documents officiels).

Cette page est ouverte à tout le monde, sans connexion. On n'y expose JAMAIS de
coordonnées GPS, de distance, de tracé ni de position en direct : seulement deux heures,
et seulement une fois la mission clôturée.
"""

from .models import Mission, PointTrajet


def contexte_document(document):
    """(contrôleur, date, missions, portée) d'un ordre de mission ou de route.

    Un ordre de tournée couvre toutes ses missions ; un ordre de mission isolée n'en
    couvre qu'une (il n'a alors pas de tournée)."""
    if document.tournee_id:
        tournee = document.tournee
        missions = list(tournee.missions.order_by("ordre_dans_tournee"))
        return tournee.controleur, tournee.date, missions, "tournée"
    mission = document.mission
    return mission.controleur, mission.date_prevue, [mission], "mission"


def execution_publique(missions):
    """Heures de départ et d'arrivée, ou None tant que tout n'est pas clôturé.

    - départ : premier relevé du trajet (début du suivi) ;
    - arrivée : « Je suis arrivé » sur le premier site. Sans position enregistrée
      (démarrage automatique), il n'y a pas d'heure d'arrivée à montrer.
    """
    if not missions or any(m.statut != Mission.Statut.CLOTUREE for m in missions):
        return None

    depart = (
        PointTrajet.objects.filter(mission__in=missions)
        .order_by("releve_le")
        .values_list("releve_le", flat=True)
        .first()
    )
    premiere = missions[0]
    arrivee = premiere.date_debut_reelle if premiere.latitude_debut is not None else None
    return {"depart": depart, "arrivee": arrivee}