import { createContext, useContext } from "react";

export type EtatTrajet = "inactif" | "recherche" | "ok" | "attente" | "indisponible";

export interface EtatSuivi {
  etat: EtatTrajet;
  // Nombre de positions gardées sur le téléphone, pas encore envoyées
  enAttente: number;
  // Message d'aide quand la position est indisponible
  detail: string;
}

export const SuiviContext = createContext<EtatSuivi>({
  etat: "inactif",
  enAttente: 0,
  detail: "",
});

export function useEtatSuivi() {
  return useContext(SuiviContext);
}