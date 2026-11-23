import { useCallback, useEffect, useState } from "react";
import api from "../../../api/client";
import { normaliserStats } from "../statistiques";
import type { Statistiques } from "../statistiques";

const INTERVALLE_RAFRAICHISSEMENT_MS = 60000;

/**
 * Charge les chiffres du tableau de bord à l'ouverture,
 * puis les rafraîchit en silence (toutes les 60 s et au retour sur l'onglet).
 */
export function useStatistiques() {
  const [stats, setStats] = useState<Statistiques | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async (silencieux = false) => {
    try {
      const reponse = await api.get("/suivi/tableau-de-bord/");
      const propres = normaliserStats(reponse.data);
      if (!propres) throw new Error("Réponse inattendue");
      setStats(propres);
      if (!silencieux) setErreur("");
    } catch {
      if (!silencieux) setErreur("Impossible de charger le tableau de bord.");
    } finally {
      if (!silencieux) setChargement(false);
    }
  }, []);

  // Chargement initial
  useEffect(() => {
    charger();
  }, [charger]);

  // Rafraîchissement automatique
  useEffect(() => {
    const rafraichir = () => {
      if (document.visibilityState === "visible") charger(true);
    };
    const minuteur = window.setInterval(rafraichir, INTERVALLE_RAFRAICHISSEMENT_MS);
    document.addEventListener("visibilitychange", rafraichir);
    window.addEventListener("focus", rafraichir);
    return () => {
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", rafraichir);
      window.removeEventListener("focus", rafraichir);
    };
  }, [charger]);

  return { stats, chargement, erreur };
}