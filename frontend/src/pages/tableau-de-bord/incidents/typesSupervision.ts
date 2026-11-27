export type EtatSite = "NORMAL" | "A_SURVEILLER" | "CRITIQUE";

export interface PointEvolution {
  mois: string; // « 2026-11 »
  libelle: string; // « nov. »
  radio: number;
  television: number;
}

export interface PartGravite {
  gravite: string; // CRITIQUE, MAJEURE ou MINEURE
  libelle: string;
  nombre: number;
  pourcentage: number;
}

export interface SiteCarte {
  id: number;
  nom: string;
  latitude: number;
  longitude: number;
  etat: EtatSite;
}

export interface IncidentRecent {
  id: number;
  site_nom: string;
  type_libelle: string;
  gravite: string;
  gravite_libelle: string;
  statut: string;
  statut_libelle: string;
  date_debut: string;
  duree_minutes: number;
}

export interface Alerte {
  cle: string;
  niveau: "critique" | "recurrent" | "en_cours";
  titre: string;
  detail: string;
  etiquette: string;
}

// Ce que renvoie GET /api/incidents/tableau-de-bord/
export interface TableauIncidents {
  mois: string;
  kpis: {
    sites_suivis: number;
    incidents_ce_mois: number;
    variation_pct: number | null;
    en_cours: number;
    sites_critiques: number;
  };
  evolution: PointEvolution[];
  repartition: { total: number; parts: PartGravite[] };
  sites: SiteCarte[];
  recents: IncidentRecent[];
  alertes: Alerte[];
}