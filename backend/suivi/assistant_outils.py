"""Outils de Maki : ce que l'assistant a le droit de consulter.

Règle de sécurité : c'est ce fichier, et non l'IA, qui décide de ce que chacun voit.
- Le Directeur voit toutes les données de la plateforme.
- Un contrôleur voit ses missions, ses rapports, ses tournées validées, et les sites sur
  lesquels une mission lui est confiée (donc leurs risques et leurs non-conformités).
Aucune donnée personnelle (e-mail, téléphone) n'est envoyée au moteur d'IA.
"""

import logging
from datetime import date

from django.db.models import Count
from django.utils import timezone

from comptes.permissions import est_directeur
from controles.models import Mission, NonConformite, Rapport, Tournee

from .models import Niveau, ScoreRisque

journal = logging.getLogger(__name__)

LIMITE_MISSIONS = 20
LIMITE_NON_CONFORMITES = 20
LIMITE_RAPPORTS = 10
LIMITE_SITES = 10
LIMITE_TOURNEES = 5

# Du moins grave au plus grave
RANG_NIVEAU = {Niveau.FAIBLE: 0, Niveau.MOYEN: 1, Niveau.ELEVE: 2, Niveau.CRITIQUE: 3}

DECLARATIONS = [
    {
        "name": "lister_missions",
        "description": (
            "Liste les missions de contrôle visibles par l'utilisateur, triées par date prévue. "
            "À utiliser pour toute question sur des missions précises : lesquelles, quand, où, "
            "avec quel contrôleur."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "statut": {
                    "type": "STRING",
                    "description": "PLANIFIEE (à venir), EN_COURS ou CLOTUREE (terminée). Omettre pour tout.",
                },
                "date_debut": {
                    "type": "STRING",
                    "description": "Date prévue minimale, au format AAAA-MM-JJ.",
                },
                "date_fin": {
                    "type": "STRING",
                    "description": "Date prévue maximale, au format AAAA-MM-JJ.",
                },
                "site": {
                    "type": "STRING",
                    "description": "Une partie du nom du site à rechercher.",
                },
            },
        },
    },
    {
        "name": "resume_missions",
        "description": (
            "Donne le nombre de missions par statut, le nombre de missions en retard "
            "(planifiées dont la date est dépassée) et celles prévues aujourd'hui. "
            "À utiliser pour une vue d'ensemble ou une question « combien »."
        ),
        "parameters": {"type": "OBJECT", "properties": {}},
    },
    {
        "name": "details_mission",
        "description": (
            "Détail d'une mission à partir de son numéro : créneau, état, score de son rapport, "
            "et les points non conformes relevés avec leur commentaire. À utiliser pour résumer "
            "ou expliquer une mission ou un rapport."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "numero": {"type": "INTEGER", "description": "Numéro de la mission."},
            },
            "required": ["numero"],
        },
    },
    {
        "name": "sites_a_risque",
        "description": (
            "Classe les sites par score de risque, de 0 (aucun risque) à 100 (risque maximal), "
            "du plus risqué au moins risqué, avec leur niveau (FAIBLE, MOYEN, ELEVE, CRITIQUE), "
            "leurs non-conformités à traiter et celles en retard."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "niveau_minimum": {
                    "type": "STRING",
                    "description": "Ne garder que ce niveau et au-dessus : FAIBLE, MOYEN, ELEVE ou CRITIQUE.",
                },
            },
        },
    },
    {
        "name": "lister_non_conformites",
        "description": (
            "Liste les non-conformités (défauts constatés sur les sites), les plus urgentes "
            "d'abord : celles en retard, puis par date limite de correction."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "statut": {
                    "type": "STRING",
                    "description": "OUVERTE (à réparer), CORRIGEE (réparée, à vérifier) ou VERIFIEE.",
                },
                "seulement_en_retard": {
                    "type": "BOOLEAN",
                    "description": "Vrai pour ne garder que celles dont le délai de correction est dépassé.",
                },
                "gravite": {
                    "type": "STRING",
                    "description": "MINEURE, MAJEURE ou CRITIQUE.",
                },
                "site": {
                    "type": "STRING",
                    "description": "Une partie du nom du site à rechercher.",
                },
            },
        },
    },
    {
        "name": "lister_rapports",
        "description": (
            "Liste les rapports de mission les plus récents, avec leur score de conformité "
            "(0 à 100) et leur statut (GENERE, VALIDE, REJETE)."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "statut": {"type": "STRING", "description": "GENERE, VALIDE ou REJETE."},
                "site": {
                    "type": "STRING",
                    "description": "Une partie du nom du site à rechercher.",
                },
            },
        },
    },
    {
        "name": "lister_tournees",
        "description": (
            "Liste les tournées de contrôle (ordre de passage proposé par le système, distance et "
            "durée estimées). Par défaut, les tournées à venir."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "a_venir": {
                    "type": "BOOLEAN",
                    "description": "Vrai (défaut) : tournées d'aujourd'hui et à venir. Faux : les plus récentes passées.",
                },
            },
        },
    },
]


# Outil d'action : il ne modifie rien. Il prépare une proposition que l'utilisateur confirme
# lui-même par un bouton ; c'est alors l'API existante de la plateforme qui agit, avec ses
# propres contrôles de droits.
DECLARATIONS_ACTIONS = [
    {
        "name": "infos_message_partenaire",
        "description": (
            "Donne les éléments utiles pour écrire un message au partenaire à propos d'une "
            "non-conformité : site, constat, gravité, dates, retard, nom de l'organisation "
            "partenaire. À appeler AVANT de rédiger un message. N'envoie rien."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "numero": {"type": "INTEGER", "description": "Numéro de la non-conformité."},
            },
            "required": ["numero"],
        },
    },
    {
        "name": "proposer_message_partenaire",
        "description": (
            "Prépare un brouillon de message (e-mail) au partenaire à propos d'une non-conformité. "
            "N'envoie RIEN : l'utilisateur relit, copie ou ouvre sa messagerie. Le destinataire est "
            "ajouté automatiquement par la plateforme : ne l'écris pas."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "numero": {"type": "INTEGER", "description": "Numéro de la non-conformité."},
                "objet": {"type": "STRING", "description": "Objet du message, court."},
                "corps": {
                    "type": "STRING",
                    "description": "Texte complet du message, avec formule d'appel et de politesse.",
                },
            },
            "required": ["numero", "objet", "corps"],
        },
    },
    {
        "name": "proposer_correction_non_conformite",
        "description": (
            "Prépare la proposition de marquer une non-conformité ouverte comme corrigée "
            "(le partenaire a réparé). N'exécute RIEN : l'utilisateur doit cliquer sur Confirmer. "
            "Utiliser le numéro renvoyé par lister_non_conformites."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "numero": {"type": "INTEGER", "description": "Numéro de la non-conformité."},
            },
            "required": ["numero"],
        },
    },
]


def declarations_pour(utilisateur):
    """Les outils proposés à l'IA : les actions sont réservées au Directeur."""
    if est_directeur(utilisateur):
        return DECLARATIONS + DECLARATIONS_ACTIONS
    return DECLARATIONS


def construire_instruction(utilisateur):
    """Consigne donnée à l'IA : qui elle est, à qui elle parle, ce qu'elle peut faire."""
    maintenant = timezone.localtime()
    role = "Directeur" if est_directeur(utilisateur) else "contrôleur"
    nom = utilisateur.get_full_name() or utilisateur.get_username()
    portee = (
        "Il voit toutes les données de la plateforme."
        if est_directeur(utilisateur)
        else "Il ne voit que ses missions, ses rapports et les sites qui lui sont confiés."
    )
    if est_directeur(utilisateur):
        regle_actions = (
            "- Tu ne modifies jamais toi-même une donnée. Actions possibles : (1) proposer de marquer "
            "une non-conformité ouverte comme corrigée, avec l'outil proposer_correction_non_conformite "
            "(utilise le numéro donné par lister_non_conformites) ; après l'appel, dis simplement que "
            "l'action est prête et que l'utilisateur doit cliquer sur « Confirmer » dans la carte "
            "affichée ; n'écris jamais que c'est fait. (2) préparer un brouillon de message au partenaire : "
            "appelle d'abord infos_message_partenaire, puis proposer_message_partenaire avec un objet "
            "et un texte complets. Le message est courtois, professionnel et factuel : rappelle le site, "
            "le constat, la gravité et la date limite de correction (et le retard s'il y en a), demande "
            "une intervention ou un retour, remercie ; adresse-le à l'organisation partenaire, sans "
            "inventer de nom de personne, et signe « La Direction du Partenariat et Coopération, ORTM ». "
            "Après l'appel, dis que le brouillon est prêt dans la carte et qu'il n'a pas été envoyé : "
            "l'utilisateur peut le copier ou l'ouvrir dans sa messagerie. Pour toute autre modification "
            "(créer, modifier ou supprimer), explique que tu ne sais pas encore le faire et indique la "
            "page de la plateforme à utiliser."
        )
    else:
        regle_actions = (
            "- Tu peux seulement consulter et expliquer. Si on te demande de créer, modifier ou "
            "supprimer quelque chose, explique que tu ne sais pas encore le faire et indique la page "
            "de la plateforme à utiliser."
        )
    return (
        "Tu es Maki, l'assistant virtuel de la plateforme « Suivi des contrôles » de la Direction "
        "du Partenariat et Coopération de l'ORTM. Cette plateforme gère les missions de contrôle "
        "des sites de diffusion (pylônes, stations d'émission, relais).\n"
        f"Tu parles à {nom}, {role}. {portee}\n"
        f"Nous sommes le {maintenant:%d/%m/%Y} et il est {maintenant:%H:%M} (heure de Madagascar).\n"
        "Règles :\n"
        "- Réponds toujours en français, de façon courte, claire et polie.\n"
        "- Pour toute information sur les missions, sites, risques, non-conformités, rapports ou "
        "tournées, appelle un outil. N'invente jamais un chiffre, un site, une date ou un nom : "
        "si l'outil ne renvoie rien, dis-le simplement.\n"
        "- Le score de risque va de 0 (aucun risque) à 100 (risque maximal). Une non-conformité "
        "est « en retard » quand son délai de correction est dépassé et qu'elle est encore ouverte.\n"
        f"{regle_actions}\n"
        "- Si la question n'a aucun rapport avec la plateforme, dis poliment que tu ne peux aider "
        "que sur le suivi des contrôles.\n"
        "- Écris du texte simple, sans tableau ni mise en forme Markdown ; pour une liste, une "
        "ligne par élément commençant par un tiret."
    )


# ---------- Outils communs ----------


def _jour(valeur):
    return valeur.strftime("%d/%m/%Y") if valeur else ""


def _date(valeur):
    try:
        return date.fromisoformat(str(valeur))
    except ValueError:
        return None


def _vrai(valeur):
    return valeur is True or str(valeur).strip().lower() in ("true", "vrai", "oui", "1")


def _court(texte, limite=200):
    texte = (texte or "").strip()
    return texte if len(texte) <= limite else texte[: limite - 1] + "…"


def _nom(utilisateur):
    return utilisateur.get_full_name() or utilisateur.get_username()


def _creneau(jour, heure_debut, heure_fin=None):
    texte = _jour(jour)
    if heure_debut:
        texte += f" à {heure_debut:%H:%M}"
    if heure_fin:
        texte += f" jusqu'à {heure_fin:%H:%M}"
    return texte


def _libelle_critere(critere):
    for champ in ("libelle", "intitule", "nom"):
        valeur = getattr(critere, champ, None)
        if valeur:
            return str(valeur)
    return str(critere)


def _missions_visibles(utilisateur):
    missions = Mission.objects.select_related("site", "controleur", "modele_grille")
    if not est_directeur(utilisateur):
        missions = missions.filter(controleur=utilisateur)
    return missions


def _non_conformites_visibles(utilisateur):
    non_conformites = NonConformite.objects.select_related("site")
    if not est_directeur(utilisateur):
        non_conformites = non_conformites.filter(site__missions__controleur=utilisateur).distinct()
    return non_conformites


def _en_retard(nc, aujourdhui):
    return nc.statut == NonConformite.Statut.OUVERTE and nc.date_limite_correction < aujourdhui


def _erreur_filtre(nom, valeur, autorisees):
    return {"erreur": f"{nom} inconnu : {valeur}. Valeurs possibles : {', '.join(autorisees)}."}


# ---------- Missions ----------


def lister_missions(utilisateur, args):
    missions = _missions_visibles(utilisateur)

    statut = args.get("statut")
    if statut:
        if statut not in Mission.Statut.values:
            return _erreur_filtre("Statut", statut, Mission.Statut.values)
        missions = missions.filter(statut=statut)

    for cle, filtre in (("date_debut", "date_prevue__gte"), ("date_fin", "date_prevue__lte")):
        if args.get(cle):
            valeur = _date(args[cle])
            if valeur is None:
                return {"erreur": f"Date invalide pour {cle} : utiliser AAAA-MM-JJ."}
            missions = missions.filter(**{filtre: valeur})

    if args.get("site"):
        missions = missions.filter(site__nom__icontains=str(args["site"]))

    missions = missions.order_by("date_prevue", "heure_prevue", "id")
    total = missions.count()

    voir_controleur = est_directeur(utilisateur)
    lignes = []
    for m in missions[:LIMITE_MISSIONS]:
        ligne = {
            "numero": m.id,
            "site": m.site.nom,
            "statut": m.get_statut_display(),
            "debut_prevu": _creneau(m.date_prevue, m.heure_prevue),
            "fin_prevue": _creneau(m.date_fin_prevue, m.heure_fin_prevue),
            "modele_de_grille": getattr(m.modele_grille, "nom", ""),
        }
        if voir_controleur:
            ligne["controleur"] = _nom(m.controleur)
        lignes.append(ligne)

    return {"total": total, "affichees": len(lignes), "missions": lignes}


def resume_missions(utilisateur, args):
    missions = _missions_visibles(utilisateur)
    aujourdhui = timezone.localdate()

    libelles = dict(Mission.Statut.choices)
    par_statut = {libelle: 0 for libelle in libelles.values()}
    for ligne in missions.order_by().values("statut").annotate(nombre=Count("id")):
        par_statut[libelles.get(ligne["statut"], ligne["statut"])] = ligne["nombre"]

    return {
        "par_statut": par_statut,
        "total": sum(par_statut.values()),
        "en_retard": missions.filter(
            statut=Mission.Statut.PLANIFIEE, date_prevue__lt=aujourdhui
        ).count(),
        "prevues_aujourdhui": missions.filter(date_prevue=aujourdhui).count(),
    }


def details_mission(utilisateur, args):
    try:
        numero = int(args.get("numero"))
    except (TypeError, ValueError):
        return {"erreur": "Numéro de mission invalide."}

    mission = _missions_visibles(utilisateur).filter(pk=numero).first()
    if mission is None:
        return {"erreur": f"Aucune mission n° {numero} n'est accessible."}

    reponses = list(
        mission.reponses.select_related("critere", "non_conformite").order_by("id")
    )
    non_conformes = []
    for r in reponses:
        if r.est_conforme:
            continue
        point = {
            "critere": _libelle_critere(r.critere),
            "valeur": _court(r.valeur, 100),
            "commentaire": _court(r.commentaire),
        }
        nc = getattr(r, "non_conformite", None)
        if nc is not None:
            point["gravite"] = nc.get_gravite_display()
            point["etat_non_conformite"] = nc.get_statut_display()
        non_conformes.append(point)

    detail = {
        "numero": mission.id,
        "site": mission.site.nom,
        "statut": mission.get_statut_display(),
        "debut_prevu": _creneau(mission.date_prevue, mission.heure_prevue),
        "fin_prevue": _creneau(mission.date_fin_prevue, mission.heure_fin_prevue),
        "criteres_repondus": len(reponses),
        "criteres_conformes": len(reponses) - len(non_conformes),
        "points_non_conformes": non_conformes,
    }
    if est_directeur(utilisateur):
        detail["controleur"] = _nom(mission.controleur)

    rapport = getattr(mission, "rapport", None)
    if rapport is not None:
        detail["rapport"] = {
            "score_conformite": float(rapport.score_conformite),
            "statut": rapport.get_statut_display(),
            "motif_rejet": _court(rapport.motif_rejet),
        }
    return detail


# ---------- Risques et non-conformités ----------


def sites_a_risque(utilisateur, args):
    minimum = args.get("niveau_minimum")
    if minimum and minimum not in RANG_NIVEAU:
        return _erreur_filtre("Niveau", minimum, list(RANG_NIVEAU))

    scores = ScoreRisque.objects.select_related("site").filter(site__est_actif=True)
    if not est_directeur(utilisateur):
        scores = scores.filter(site__missions__controleur=utilisateur)
    # Le dernier score de chaque site (PostgreSQL : DISTINCT ON)
    derniers = list(scores.order_by("site_id", "-date_calcul").distinct("site_id"))

    if minimum:
        derniers = [s for s in derniers if RANG_NIVEAU[s.niveau] >= RANG_NIVEAU[minimum]]
    derniers.sort(key=lambda s: s.valeur, reverse=True)
    total = len(derniers)
    derniers = derniers[:LIMITE_SITES]

    # Non-conformités à traiter, comptées en une seule requête
    aujourdhui = timezone.localdate()
    compteurs = {s.site_id: [0, 0] for s in derniers}
    a_traiter = NonConformite.objects.filter(site_id__in=compteurs.keys()).exclude(
        statut=NonConformite.Statut.VERIFIEE
    )
    for nc in a_traiter:
        compteurs[nc.site_id][0] += 1
        if _en_retard(nc, aujourdhui):
            compteurs[nc.site_id][1] += 1

    return {
        "total_sites": total,
        "sites": [
            {
                "site": s.site.nom,
                "localisation": getattr(s.site, "localisation", ""),
                "score_de_risque": float(s.valeur),
                "niveau": s.get_niveau_display(),
                "calcule_le": _jour(timezone.localtime(s.date_calcul)),
                "non_conformites_a_traiter": compteurs[s.site_id][0],
                "dont_en_retard": compteurs[s.site_id][1],
            }
            for s in derniers
        ],
    }


def lister_non_conformites(utilisateur, args):
    non_conformites = _non_conformites_visibles(utilisateur)
    aujourdhui = timezone.localdate()

    statut = args.get("statut")
    if statut:
        if statut not in NonConformite.Statut.values:
            return _erreur_filtre("Statut", statut, NonConformite.Statut.values)
        non_conformites = non_conformites.filter(statut=statut)

    gravite = args.get("gravite")
    if gravite:
        if gravite not in NonConformite.Gravite.values:
            return _erreur_filtre("Gravité", gravite, NonConformite.Gravite.values)
        non_conformites = non_conformites.filter(gravite=gravite)

    if args.get("site"):
        non_conformites = non_conformites.filter(site__nom__icontains=str(args["site"]))

    liste = list(non_conformites)
    if _vrai(args.get("seulement_en_retard")):
        liste = [nc for nc in liste if _en_retard(nc, aujourdhui)]

    # En retard d'abord, puis la date limite la plus proche
    liste.sort(key=lambda nc: (not _en_retard(nc, aujourdhui), nc.date_limite_correction, nc.id))
    total = len(liste)

    lignes = []
    for nc in liste[:LIMITE_NON_CONFORMITES]:
        retard = _en_retard(nc, aujourdhui)
        lignes.append(
            {
                "numero": nc.id,
                "site": nc.site.nom,
                "description": _court(nc.description),
                "gravite": nc.get_gravite_display(),
                "statut": nc.get_statut_display(),
                "constatee_le": _jour(nc.date_detection),
                "date_limite_correction": _jour(nc.date_limite_correction),
                "en_retard": retard,
                "jours_de_retard": (aujourdhui - nc.date_limite_correction).days if retard else 0,
            }
        )
    return {"total": total, "affichees": len(lignes), "non_conformites": lignes}


# ---------- Rapports ----------


def lister_rapports(utilisateur, args):
    rapports = Rapport.objects.select_related("mission__site", "mission__controleur")
    if not est_directeur(utilisateur):
        rapports = rapports.filter(mission__controleur=utilisateur)

    statut = args.get("statut")
    if statut:
        if statut not in Rapport.Statut.values:
            return _erreur_filtre("Statut", statut, Rapport.Statut.values)
        rapports = rapports.filter(statut=statut)

    if args.get("site"):
        rapports = rapports.filter(mission__site__nom__icontains=str(args["site"]))

    rapports = rapports.order_by("-date_generation")
    total = rapports.count()

    voir_controleur = est_directeur(utilisateur)
    lignes = []
    for r in rapports[:LIMITE_RAPPORTS]:
        ligne = {
            "numero_mission": r.mission_id,
            "site": r.mission.site.nom,
            "genere_le": _jour(timezone.localtime(r.date_generation)),
            "score_conformite": float(r.score_conformite),
            "statut": r.get_statut_display(),
        }
        if r.statut == Rapport.Statut.REJETE:
            ligne["motif_rejet"] = _court(r.motif_rejet)
        if voir_controleur:
            ligne["controleur"] = _nom(r.mission.controleur)
        lignes.append(ligne)
    return {"total": total, "affichees": len(lignes), "rapports": lignes}


# ---------- Tournées ----------


def lister_tournees(utilisateur, args):
    tournees = Tournee.objects.select_related("controleur").prefetch_related("missions__site")
    if not est_directeur(utilisateur):
        # Un contrôleur ne voit que ses tournées validées par le Directeur
        tournees = tournees.filter(controleur=utilisateur, statut=Tournee.Statut.VALIDEE)

    aujourdhui = timezone.localdate()
    a_venir = args.get("a_venir", True)
    if _vrai(a_venir):
        tournees = tournees.filter(date__gte=aujourdhui).order_by("date", "id")
    else:
        tournees = tournees.filter(date__lt=aujourdhui).order_by("-date", "-id")

    voir_controleur = est_directeur(utilisateur)
    lignes = []
    for t in tournees[:LIMITE_TOURNEES]:
        etapes = sorted(t.missions.all(), key=lambda m: (m.ordre_dans_tournee or 999, m.id))
        ligne = {
            "date": _jour(t.date),
            "statut": t.get_statut_display(),
            "distance_estimee_km": float(t.distance_estimee_km),
            "duree_estimee_minutes": t.duree_estimee_min,
            "ordre_de_passage": [
                f"{i}. {m.site.nom} (mission n° {m.id})" for i, m in enumerate(etapes, start=1)
            ],
        }
        if voir_controleur:
            ligne["controleur"] = _nom(t.controleur)
        lignes.append(ligne)
    return {"tournees": lignes}


# ---------- Actions (proposées, jamais exécutées ici) ----------


def proposer_correction_non_conformite(utilisateur, args, propositions):
    try:
        numero = int(args.get("numero"))
    except (TypeError, ValueError):
        return {"erreur": "Numéro de non-conformité invalide."}

    nc = NonConformite.objects.select_related("site").filter(pk=numero).first()
    if nc is None:
        return {"erreur": f"Aucune non-conformité n° {numero}."}
    if nc.statut != NonConformite.Statut.OUVERTE:
        return {
            "erreur": f"La non-conformité n° {numero} est déjà « {nc.get_statut_display()} » : "
            "seule une non-conformité ouverte peut être marquée corrigée."
        }

    if not any(p["type"] == "corriger_non_conformite" and p["numero"] == nc.id for p in propositions):
        propositions.append(
            {
                "type": "corriger_non_conformite",
                "numero": nc.id,
                "titre": "Marquer cette non-conformité comme corrigée",
                "lignes": [
                    f"Site : {nc.site.nom}",
                    f"Constat : {_court(nc.description, 160)}",
                    f"Gravité : {nc.get_gravite_display()}",
                    f"Date limite de correction : {_jour(nc.date_limite_correction)}",
                ],
                "avertissement": "Le contrôleur sera prévenu et la vérifiera à son prochain contrôle.",
            }
        )
    return {
        "proposition_preparee": True,
        "consigne": "L'utilisateur doit maintenant cliquer sur Confirmer dans la carte affichée. "
        "Ne dis pas que l'action est faite.",
    }


def _charger_non_conformite(args):
    try:
        numero = int(args.get("numero"))
    except (TypeError, ValueError):
        return None, {"erreur": "Numéro de non-conformité invalide."}
    nc = (
        NonConformite.objects.select_related("site", "site__partenaire").filter(pk=numero).first()
    )
    if nc is None:
        return None, {"erreur": f"Aucune non-conformité n° {numero}."}
    return nc, None


def infos_message_partenaire(utilisateur, args, propositions):
    nc, erreur = _charger_non_conformite(args)
    if erreur:
        return erreur
    partenaire = nc.site.partenaire
    if partenaire is None:
        return {"erreur": f"Aucun partenaire n'est associé au site « {nc.site.nom} »."}

    aujourdhui = timezone.localdate()
    retard = _en_retard(nc, aujourdhui)
    # Ni e-mail, ni téléphone, ni nom de personne : seulement l'organisation
    return {
        "numero": nc.id,
        "partenaire": partenaire.nom,
        "site": nc.site.nom,
        "localisation": nc.site.localisation,
        "constat": _court(nc.description, 400),
        "gravite": nc.get_gravite_display(),
        "statut": nc.get_statut_display(),
        "constatee_le": _jour(nc.date_detection),
        "date_limite_correction": _jour(nc.date_limite_correction),
        "en_retard": retard,
        "jours_de_retard": (aujourdhui - nc.date_limite_correction).days if retard else 0,
        "deja_reouverte_apres_verification": getattr(nc, "nombre_reouvertures", 0),
    }


def proposer_message_partenaire(utilisateur, args, propositions):
    nc, erreur = _charger_non_conformite(args)
    if erreur:
        return erreur
    partenaire = nc.site.partenaire
    if partenaire is None:
        return {"erreur": f"Aucun partenaire n'est associé au site « {nc.site.nom} »."}

    objet = " ".join(str(args.get("objet") or "").split())[:150]
    corps = str(args.get("corps") or "").strip()[:3000]
    if not objet or not corps:
        return {"erreur": "L'objet et le texte du message sont obligatoires."}

    # L'adresse vient de la base, jamais de l'IA
    proposition = {
        "type": "message_partenaire",
        "numero": nc.id,
        "titre": f"Brouillon de message à {partenaire.nom}",
        "lignes": [f"Site : {nc.site.nom}"],
        "avertissement": None
        if partenaire.email
        else "Aucune adresse e-mail n'est enregistrée pour ce partenaire : copiez le message.",
        "objet": objet,
        "corps": corps,
        "destinataire": partenaire.email,
    }
    # Une nouvelle version du brouillon remplace la précédente
    propositions[:] = [
        p for p in propositions if not (p["type"] == "message_partenaire" and p["numero"] == nc.id)
    ]
    propositions.append(proposition)
    return {
        "brouillon_prepare": True,
        "consigne": "Le brouillon s'affiche dans une carte. Dis qu'il n'a PAS été envoyé : "
        "l'utilisateur peut le copier ou l'ouvrir dans sa messagerie.",
    }


OUTILS_ACTIONS = {
    "infos_message_partenaire": infos_message_partenaire,
    "proposer_message_partenaire": proposer_message_partenaire,
    "proposer_correction_non_conformite": proposer_correction_non_conformite,
}

OUTILS = {
    "lister_missions": lister_missions,
    "resume_missions": resume_missions,
    "details_mission": details_mission,
    "sites_a_risque": sites_a_risque,
    "lister_non_conformites": lister_non_conformites,
    "lister_rapports": lister_rapports,
    "lister_tournees": lister_tournees,
}


def executer(utilisateur, nom, args, propositions=None):
    """Exécute l'outil demandé par l'IA. Ne lève jamais d'erreur : l'IA reçoit le message.

    Les propositions d'action préparées par l'IA sont ajoutées à la liste `propositions`."""
    args = args if isinstance(args, dict) else {}
    try:
        if nom in OUTILS_ACTIONS:
            if not est_directeur(utilisateur):
                return {"erreur": "Seul le Directeur peut effectuer cette action."}
            return OUTILS_ACTIONS[nom](utilisateur, args, propositions if propositions is not None else [])
        outil = OUTILS.get(nom)
        if outil is None:
            return {"erreur": f"Outil inconnu : {nom}."}
        return outil(utilisateur, args)
    except Exception:
        journal.exception("Outil %s en échec", nom)
        return {"erreur": "Les données n'ont pas pu être lues."}