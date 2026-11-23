export type TypeSite = "MINISTERE" | "HORS_MINISTERE";

export interface SiteTournee {
  id: number;
  nom: string;
  type_site: TypeSite;
}

export interface CarteProfessionnelle {
  numero: string;
  date_expiration: string; // « 2027-03-31 »
}

export interface OrdreMission {
  numero: string; // OM-2026-0042
  date_emission: string;
}

export interface OrdreRoute {
  numero: string; // OR-2026-0015
  depart: string;
  destination: string;
  transport: string;
}

export interface Tournee {
  id: number;
  numero: string; // TR-2026-0007
  controleur_nom: string;
  date_depart: string;
  date_retour: string;
  statut: "PLANIFIEE" | "EN_COURS" | "CLOTUREE";
  carte_professionnelle: CarteProfessionnelle | null;
  ordre_mission: OrdreMission | null;
  ordre_route: OrdreRoute | null;
  sites: SiteTournee[];
}