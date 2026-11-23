// Adresses de l'API (avec le « / » final, comme les routes Django)
export const URL_MODELES = "/referentiels/modeles-grille/";
export const URL_CRITERES = "/referentiels/criteres/";
export const URL_TYPES = "/referentiels/types-site/";

export type Onglet = "modeles" | "types";

export type ModePanneau =
  | "modele-creer"
  | "modele-modifier"
  | "modele-voir"
  | "critere-creer"
  | "critere-modifier"
  | "type-creer"
  | "type-modifier";

export type TypeReponse = "OUI_NON" | "NOTE" | "TEXTE";

// Les libellés des trois types de réponse (les mêmes que dans le modèle Django)
export const LIBELLES_REPONSE: Record<string, string> = {
  OUI_NON: "Conforme / non conforme",
  NOTE: "Note chiffrée",
  TEXTE: "Observation libre",
};

export interface TypeSite {
  id: number;
  libelle: string;
  description: string;
  est_actif: boolean;
  // Calculés par le serveur : absents des réponses de création / modification
  nombre_sites?: number;
  nombre_modeles?: number;
}

export interface Critere {
  id: number;
  modele: number;
  libelle: string;
  type_reponse: TypeReponse;
  ponderation: string;
  est_obligatoire: boolean;
  ordre: number;
}

export interface Modele {
  id: number;
  nom: string;
  description: string;
  est_actif: boolean;
  type_site: number;
  type_site_libelle: string;
  // Calculé par le serveur : absent des réponses de création / modification
  nombre_missions?: number;
  criteres: Critere[];
}

// Ce que les formulaires envoient à l'API
export interface DonneesTypeSite {
  libelle: string;
  description: string;
  est_actif?: boolean;
}

export interface DonneesModele {
  nom: string;
  description: string;
  type_site: number;
  est_actif: boolean;
}

export interface DonneesCritere {
  libelle: string;
  type_reponse: TypeReponse;
  ponderation: string | number;
  est_obligatoire: boolean;
}