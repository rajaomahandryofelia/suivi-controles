// ---------- Journal (API tracabilite/) ----------

export interface Visite {
    mission: number;
    controleur_id: number;
    controleur: string;
    site: string;
    localisation: string;
    statut: string;
    statut_libelle: string;
    date_prevue: string;
    creneau: string;
    debut: string | null;
    fin: string | null;
    duree_min: number | null;
    latitude_debut: string | null;
    longitude_debut: string | null;
    latitude_fin: string | null;
    longitude_fin: string | null;
    debut_auto: boolean;
    fin_auto: boolean;
    ecart_debut_m: number | null;
    ecart_fin_m: number | null;
    debut_loin: boolean;
    fin_loin: boolean;
    nb_criteres: number;
    nb_reponses: number;
    nb_photos: number;
    nb_non_conformites: number;
    rapport: { statut: string; statut_libelle: string; score: string | number } | null;
    // Ajoutés par la tâche 1
    nb_points?: number;
    distance_trajet_m?: number | null;
  }
  
  export interface Synthese {
    visites: number;
    cloturees: number;
    en_cours: number;
    duree_totale_min: number;
    sans_position: number;
    eloignees: number;
    // Ajoutés par la tâche 1
    avec_trajet?: number;
    distance_totale_m?: number;
  }
  
  export interface ReponseJournal {
    visites: Visite[];
    synthese: Synthese;
    seuil_ecart_m: number;
    controleurs?: { id: number; nom: string }[];
  }
  
  // ---------- Trajet d'une mission (API missions/<id>/trajet/) ----------
  
  export interface PointTrajet {
    latitude: number;
    longitude: number;
    precision_m: number | null;
    releve_le: string;
  }
  
  export interface Trou {
    du: string;
    au: string;
    minutes: number;
  }
  
  export interface ResumeTrajet {
    nb_points: number;
    distance_m: number;
    debut: string | null;
    fin: string | null;
    duree_min: number;
    trous: Trou[];
    ecart_min_site_m: number | null;
    seuil_ecart_m: number;
  }
  
  export interface SiteTrajet {
    nom: string;
    latitude: number | null;
    longitude: number | null;
  }
  
  export interface ReponseTrajet {
    mission: number;
    statut: string;
    controleur: string;
    site: SiteTrajet;
    points: PointTrajet[];
    allege: boolean;
    resume: ResumeTrajet;
  }