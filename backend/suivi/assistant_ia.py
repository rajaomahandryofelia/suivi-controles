"""Moteur de l'assistant Maki : dialogue avec l'API Gemini (offre gratuite de Google AI Studio).

Ce fichier ne connaît ni la base de données ni les utilisateurs : il reçoit la conversation,
la liste des outils et une fonction qui les exécute. Pour changer de fournisseur d'IA,
seule la fonction `_appeler` est à remplacer.

Réglages (fichier .env du backend) :
    GEMINI_API_KEY   clé créée dans Google AI Studio (obligatoire)
    GEMINI_MODEL     modèle à utiliser (défaut : gemini-3.8-flash)
    GEMINI_MODELE_SECOURS  modèle de repli si le principal est surchargé (facultatif)
    GEMINI_REFLEXION niveau de réflexion du modèle : low (défaut, rapide), medium ou high (plus lent).
                     Laisser vide pour ne rien envoyer (modèles qui n'ont pas ce réglage).
"""

import json
import logging
import os
import time
import urllib.error
import urllib.request

journal = logging.getLogger(__name__)

URL_PAR_DEFAUT = "https://generativelanguage.googleapis.com/v1beta"
MODELE_PAR_DEFAUT = "gemini-3.8-flash"
REFLEXION_PAR_DEFAUT = "low"

# Quand Google est surchargé (erreurs temporaires), on réessaie après ces pauses (en secondes)
PAUSES_SURCHARGE = (2, 5)

DELAI_SECONDES = 90  # les modèles récents peuvent réfléchir longtemps
MAX_TOURS = 4  # une question peut demander plusieurs outils à la suite
MAX_MESSAGES = 12  # on ne renvoie à l'IA que la fin de la conversation
MAX_CARACTERES = 1000  # longueur maximale d'un message de l'utilisateur

MESSAGES_UTILISATEUR = {
    "non_configure": (
        "Maki n'est pas encore relié à son moteur d'IA : la clé GEMINI_API_KEY "
        "manque dans le fichier .env du serveur."
    ),
    "quota": "Maki a atteint sa limite gratuite pour le moment. Réessayez dans quelques minutes.",
    "refuse": "Le moteur d'IA a refusé la demande. Vérifiez la clé GEMINI_API_KEY et le modèle.",
    "delai": "Maki met trop de temps à répondre. Réessayez dans un instant ou posez une question plus simple.",
    "surcharge": "Le moteur d'IA est très sollicité en ce moment. Réessayez dans une minute.",
    "reseau": "Maki n'arrive pas à joindre son moteur d'IA. Vérifiez la connexion Internet du serveur.",
    "vide": "Maki n'a pas trouvé de réponse. Reformulez votre question.",
    "trop_d_etapes": "Votre question demande trop d'étapes. Posez-la plus simplement.",
    "indisponible": "Maki est momentanément indisponible.",
}


class ErreurAssistant(Exception):
    """Erreur prévue, avec un message que l'on peut montrer à l'utilisateur."""

    def __init__(self, code="indisponible"):
        super().__init__(code)
        self.code = code
        self.message = MESSAGES_UTILISATEUR.get(code, MESSAGES_UTILISATEUR["indisponible"])


def cle_configuree():
    return bool(os.getenv("GEMINI_API_KEY"))


def nettoyer_messages(brut):
    """Valide la conversation envoyée par l'interface : [{role, texte}, ...]."""
    if not isinstance(brut, list) or not brut:
        raise ValueError("La conversation est vide.")

    messages = []
    for element in brut[-MAX_MESSAGES:]:
        if not isinstance(element, dict):
            raise ValueError("Message invalide.")
        role = element.get("role")
        texte = element.get("texte")
        if role not in ("user", "assistant") or not isinstance(texte, str):
            raise ValueError("Message invalide.")
        texte = texte.strip()
        if not texte:
            continue
        messages.append({"role": role, "texte": texte[:MAX_CARACTERES]})

    # L'IA doit commencer par l'utilisateur et lui répondre
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    if not messages or messages[-1]["role"] != "user":
        raise ValueError("Le dernier message doit venir de l'utilisateur.")
    return messages


def _essayer(modele, avec_reflexion, contenus, instruction, declarations):
    """Une tentative auprès d'un modèle. Renvoie la réponse JSON brute."""
    cle = os.getenv("GEMINI_API_KEY")
    if not cle:
        raise ErreurAssistant("non_configure")

    base = os.getenv("GEMINI_URL_BASE", URL_PAR_DEFAUT).rstrip("/")

    corps = {
        "systemInstruction": {"parts": [{"text": instruction}]},
        "contents": contenus,
        "generationConfig": {"maxOutputTokens": 2048},
    }
    reflexion = ""
    if avec_reflexion:
        reflexion = os.getenv("GEMINI_REFLEXION", REFLEXION_PAR_DEFAUT).strip().lower()
    if reflexion:
        corps["generationConfig"]["thinkingConfig"] = {"thinkingLevel": reflexion}
    if declarations:
        corps["tools"] = [{"functionDeclarations": declarations}]

    requete = urllib.request.Request(
        f"{base}/models/{modele}:generateContent",
        data=json.dumps(corps).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": cle},
        method="POST",
    )
    debut = time.monotonic()
    try:
        with urllib.request.urlopen(requete, timeout=DELAI_SECONDES) as reponse:
            donnees = json.load(reponse)
        journal.info("Gemini (%s, réflexion %s) : %.1f s", modele, reflexion or "défaut", time.monotonic() - debut)
        return donnees
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:500]
        journal.warning("Gemini a répondu %s : %s", e.code, detail)
        if e.code == 429:
            raise ErreurAssistant("quota") from e
        if e.code in (400, 401, 403, 404):
            raise ErreurAssistant("refuse") from e
        if e.code in (500, 502, 503, 504):
            raise ErreurAssistant("surcharge") from e
        raise ErreurAssistant("indisponible") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        journal.warning("Gemini injoignable : %s", e)
        cause = getattr(e, "reason", e)
        if isinstance(cause, TimeoutError):
            raise ErreurAssistant("delai") from e
        raise ErreurAssistant("reseau") from e
    except ValueError as e:  # réponse qui n'est pas du JSON
        raise ErreurAssistant("indisponible") from e


def _appeler(contenus, instruction, declarations):
    """Un aller-retour avec Gemini, avec quelques nouvelles tentatives si Google est surchargé,
    puis le modèle de repli s'il est configuré."""
    principal = os.getenv("GEMINI_MODEL", MODELE_PAR_DEFAUT)
    secours = os.getenv("GEMINI_MODELE_SECOURS", "").strip()

    for pause in (*PAUSES_SURCHARGE, None):
        try:
            return _essayer(principal, True, contenus, instruction, declarations)
        except ErreurAssistant as e:
            if e.code != "surcharge":
                raise
            if pause is not None:
                time.sleep(pause)

    if secours and secours != principal:
        journal.warning("Modèle %s surchargé : repli sur %s", principal, secours)
        # Le réglage de réflexion dépend du modèle : on ne l'envoie pas au modèle de repli
        return _essayer(secours, False, contenus, instruction, declarations)
    raise ErreurAssistant("surcharge")


def repondre(messages, instruction, declarations, executer):
    """Répond à la dernière question, en appelant les outils dont l'IA a besoin.

    `executer(nom, arguments)` exécute un outil et renvoie un résultat sérialisable en JSON.
    """
    contenus = [
        {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["texte"]}]}
        for m in messages
    ]

    for _ in range(MAX_TOURS):
        donnees = _appeler(contenus, instruction, declarations)

        candidats = donnees.get("candidates") or []
        if not candidats:
            raise ErreurAssistant("vide")
        parties = (candidats[0].get("content") or {}).get("parts") or []

        appels = [p["functionCall"] for p in parties if "functionCall" in p]
        if not appels:
            texte = "".join(p.get("text", "") for p in parties if not p.get("thought")).strip()
            if not texte:
                raise ErreurAssistant("vide")
            return texte

        # On renvoie à l'IA sa propre demande telle quelle (signatures de réflexion comprises),
        # suivie du résultat de chaque outil.
        contenus.append({"role": "model", "parts": parties})
        resultats = []
        for appel in appels:
            nom = appel.get("name", "")
            resultats.append(
                {
                    "functionResponse": {
                        "name": nom,
                        "response": {"resultat": executer(nom, appel.get("args") or {})},
                    }
                }
            )
        contenus.append({"role": "user", "parts": resultats})

    raise ErreurAssistant("trop_d_etapes")