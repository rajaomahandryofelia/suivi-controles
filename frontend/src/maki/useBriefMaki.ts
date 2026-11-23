import { useCallback, useEffect, useState } from "react";
import api from "../api/client";

export type NiveauPoint = "alerte" | "attention" | "info";

export interface PointBrief {
  niveau: NiveauPoint;
  texte: string;
  lien?: string;
}

export interface BriefMaki {
  salutation: string;
  date: string;
  resume: string;
  points: PointBrief[];
}

const CLE_JOUR = "maki_brief_jour";

function jourVu(): string | null {
  try {
    return localStorage.getItem(CLE_JOUR);
  } catch {
    return null;
  }
}

function memoriserJour(jour: string) {
  try {
    localStorage.setItem(CLE_JOUR, jour);
  } catch {
    // Stockage indisponible : le brief s'affichera simplement à chaque ouverture
  }
}

/**
 * Brief du jour. Il s'affiche tout seul à la première ouverture de Maki de la journée ;
 * on peut le redemander ensuite avec le bouton de l'accueil.
 */
export function useBriefMaki(ouvert: boolean, surBrief: (resume: string) => void) {
  const [brief, setBrief] = useState<BriefMaki | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(false);

  const charger = useCallback(
    async (parler: boolean) => {
      setChargement(true);
      setErreur(false);
      try {
        const reponse = await api.get<BriefMaki>("/suivi/assistant/brief/");
        setBrief(reponse.data);
        memoriserJour(new Date().toLocaleDateString("sv-SE"));
        if (parler) surBrief(reponse.data.resume);
      } catch {
        setErreur(true);
      } finally {
        setChargement(false);
      }
    },
    [surBrief]
  );

  // Première ouverture de la journée : le brief arrive sans qu'on le demande
  useEffect(() => {
    if (!ouvert) return;
    if (jourVu() === new Date().toLocaleDateString("sv-SE")) return;
    charger(true);
    // Une seule fois par ouverture du panneau
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const masquer = useCallback(() => setBrief(null), []);

  return { brief, chargement, erreur, charger, masquer };
}