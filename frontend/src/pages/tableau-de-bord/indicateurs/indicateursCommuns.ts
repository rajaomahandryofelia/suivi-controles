import type { CSSProperties } from "react";

export const LIBELLE_NIVEAU: Record<string, string> = {
  FAIBLE: "Faible",
  MOYEN: "Moyen",
  ELEVE: "Élevé",
  CRITIQUE: "Critique",
};

// Décale l'animation d'entrée d'un panneau selon son rang
export const delai = (rang: number) => ({ "--i": rang }) as CSSProperties;

// Les trois puces « Planifiées / En cours / Clôturées » du panneau À faire
export function pucesMissions(missions: {
  planifiees: number;
  en_cours: number;
  cloturees: number;
}) {
  return [
    { cle: "planifiees", libelle: "Planifiées", nombre: missions.planifiees, vers: "/missions" },
    { cle: "en_cours", libelle: "En cours", nombre: missions.en_cours, vers: "/missions" },
    { cle: "cloturees", libelle: "Clôturées", nombre: missions.cloturees, vers: "/missions" },
  ];
}