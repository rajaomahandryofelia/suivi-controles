export type StatutIncident = "EN_COURS" | "RETABLI";

export interface PieceJointe {
  id: number;
  fichier: string;
  legende: string;
  date_ajout: string;
  ajoutee_par_nom: string | null;
}

// Un incident tel que le renvoie l'API (/api/incidents/)
export interface Incident {
  id: number;
  site: number;
  site_nom: string;
  element: number | null;
  element_description: string | null;
  mission: number | null;
  service: string;
  service_libelle: string;
  type: string;
  type_libelle: string;
  gravite: string;
  gravite_libelle: string;
  statut: StatutIncident;
  statut_libelle: string;
  date_debut: string;
  date_retablissement: string | null;
  duree_minutes: number;
  cause_supposee: string;
  observations: string;
  declare_par: number | null;
  declare_par_nom: string | null;
  retabli_par: number | null;
  retabli_par_nom: string | null;
  est_recurrent: boolean;
  pieces_jointes: PieceJointe[];
}

// Un site proposé dans le formulaire de déclaration
export interface SiteChoix {
  id: number;
  nom: string;
  localisation: string;
  est_actif: boolean;
}

// Les données envoyées pour déclarer un incident
export interface DonneesIncident {
  site: number;
  service: string;
  type: string;
  gravite: string;
  date_debut: string;
  cause_supposee: string;
  observations: string;
}

// Les données envoyées pour rétablir un incident (les deux champs sont facultatifs)
export interface DonneesRetablissement {
  date_retablissement?: string;
  observations?: string;
}

export type ModePanneau = "creer" | "voir";