// Adresses de l'API (app « referentiels »)
export const URL_SITES = "/referentiels/sites/";
export const URL_TYPES = "/referentiels/types-site/";
export const URL_PARTENAIRES = "/referentiels/partenaires/";

export type ModePanneau = "voir" | "creer" | "modifier";

export interface ElementInventaire {
  id: number;
  type: string;
  description: string;
  date_ajout: string;
}

export interface Site {
  id: number;
  nom: string;
  localisation: string;
  latitude: string;
  longitude: string;
  est_actif: boolean;
  type_site: number;
  type_site_libelle: string;
  partenaire: number | null;
  partenaire_nom: string | null;
  nombre_controles?: number;
  non_conformites_ouvertes?: number;
  dernier_controle?: string | null;
  elements: ElementInventaire[];
}

export interface Option {
  id: number;
  libelle: string;
}

export interface DonneesSite {
  nom: string;
  localisation: string;
  type_site: number;
  partenaire: number | null;
  latitude: string;
  longitude: string;
  est_actif: boolean;
}

export interface MissionHistorique {
  id: number;
  date_prevue: string;
  statut: string;
  statut_libelle: string;
  date_fin_reelle: string | null;
  controleur_nom: string;
  rapport_statut: string | null;
  rapport_statut_libelle: string | null;
  score_conformite: string | null;
}

export interface NonConformite {
  id: number;
  description: string;
  gravite: string;
  gravite_libelle: string;
  statut: string;
  statut_libelle: string;
  date_detection: string;
  date_limite_correction: string;
  date_correction: string | null;
  date_verification: string | null;
}