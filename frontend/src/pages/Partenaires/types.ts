// Adresses de l'API (app « referentiels »)
export const URL_PARTENAIRES = "/referentiels/partenaires/";
export const URL_SITES = "/referentiels/sites/";

export type ModePanneau = "voir" | "creer" | "modifier";

export interface Partenaire {
  id: number;
  nom: string;
  contact: string;
  telephone: string;
  email: string;
  nombre_sites?: number;
}

export interface DonneesPartenaire {
  nom: string;
  contact: string;
  telephone: string;
  email: string;
}

// Un site du partenaire (version légère de la liste des sites)
export interface SitePartenaire {
  id: number;
  nom: string;
  localisation: string;
  est_actif: boolean;
  partenaire: number | null;
  type_site_libelle: string;
  nombre_controles?: number;
  non_conformites_ouvertes?: number;
  dernier_controle?: string | null;
}