import { useCallback, useEffect, useState } from "react";
import api from "../../api/client";
import { extraireListe } from "../outilsListe";
import { messageErreur } from "./outils";
import type { MoyenRelance, NonConformite, Notifier } from "./types";

const URL_NC = "/controles/non-conformites/";

/** Charge les non-conformités et porte les actions du Directeur (corriger, relancer). */
export function useNonConformites(notifier: Notifier) {
  const [liste, setListe] = useState<NonConformite[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [enCoursId, setEnCoursId] = useState<number | null>(null);

  const charger = useCallback(async (silencieux = false) => {
    try {
      const reponse = await api.get(URL_NC);
      setListe(extraireListe<NonConformite>(reponse.data));
      setErreur("");
    } catch {
      if (!silencieux) setErreur("Impossible de charger les non-conformités.");
    } finally {
      if (!silencieux) setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // Rafraîchissement automatique : toutes les 30 s et au retour sur l'onglet
  useEffect(() => {
    const rafraichir = () => {
      if (document.visibilityState === "visible") charger(true);
    };
    const minuteur = window.setInterval(rafraichir, 30000);
    document.addEventListener("visibilitychange", rafraichir);
    window.addEventListener("focus", rafraichir);
    return () => {
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", rafraichir);
      window.removeEventListener("focus", rafraichir);
    };
  }, [charger]);

  // La réponse du serveur remplace la non-conformité dans la liste
  const remplacer = useCallback((maj: NonConformite) => {
    setListe((courante) => courante.map((nc) => (nc.id === maj.id ? maj : nc)));
  }, []);

  const corriger = useCallback(
    async (nc: NonConformite) => {
      setEnCoursId(nc.id);
      try {
        const reponse = await api.post(`${URL_NC}${nc.id}/corriger/`);
        remplacer(reponse.data as NonConformite);
        notifier("succes", "Marquée comme corrigée. Le contrôleur est prévenu : il la vérifiera sur place.");
      } catch (e) {
        notifier("erreur", messageErreur(e, "La non-conformité n'a pas pu être marquée corrigée."));
      } finally {
        setEnCoursId(null);
      }
    },
    [notifier, remplacer]
  );

  // Renvoie true si la relance est enregistrée (le formulaire se vide alors)
  const relancer = useCallback(
    async (nc: NonConformite, moyen: MoyenRelance, commentaire: string): Promise<boolean> => {
      setEnCoursId(nc.id);
      try {
        const reponse = await api.post(`${URL_NC}${nc.id}/relancer/`, { moyen, commentaire });
        remplacer(reponse.data as NonConformite);
        notifier("succes", "La relance est enregistrée dans l'historique.");
        return true;
      } catch (e) {
        notifier("erreur", messageErreur(e, "La relance n'a pas pu être enregistrée."));
        return false;
      } finally {
        setEnCoursId(null);
      }
    },
    [notifier, remplacer]
  );

  return { liste, chargement, erreur, enCoursId, corriger, relancer };
}