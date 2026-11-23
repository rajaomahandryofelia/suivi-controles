export interface CarteMission {
  numero: string;
  date_expiration: string;
  // Valide à la date prévue de la mission
  valide: boolean;
}

export interface OrdreMissionInfo {
  numero: string;
  date_emission: string;
  // vrai : ordre propre à la mission isolée ; faux : celui de sa tournée
  propre: boolean;
}

export interface Mission {
  id: number;
  date_prevue: string;
  heure_prevue: string | null;
  date_fin_prevue: string | null;
  heure_fin_prevue: string | null;
  statut: string;
  statut_libelle: string;
  site: number;
  site_nom: string;
  site_localisation: string;
  controleur: number;
  controleur_nom: string;
  modele_grille: number;
  modele_grille_nom: string;
  date_debut_reelle: string | null;
  latitude_debut: string | null;
  longitude_debut: string | null;
  date_fin_reelle: string | null;
  latitude_fin: string | null;
  longitude_fin: string | null;
  // Pièces officielles (facultatifs : ajoutés par le backend, absents des anciens objets)
  tournee?: number | null;
  carte_professionnelle?: CarteMission | null;
  ordre_mission?: OrdreMissionInfo | null;
  peut_recevoir_ordre?: boolean;
}

export interface Site {
  id: number;
  nom: string;
  localisation: string;
  est_actif: boolean;
  type_site: number;
  type_site_libelle: string;
}

export interface Modele {
  id: number;
  nom: string;
  est_actif: boolean;
  type_site: number;
}

// Ce que le Directeur saisit pour créer ou modifier une mission
export interface DonneesMission {
  site: number;
  modele_grille: number;
  controleur: number;
  date_prevue: string;
  heure_prevue: string;
  date_fin_prevue: string;
  heure_fin_prevue: string;
}

export type Echeance = "retard" | "aujourdhui" | "avenir" | null;

export type ModePanneau = "creer" | "voir" | "modifier" | "grille" | "cloture";

// ---------- Grille de contrôle ----------

export interface Critere {
  id: number;
  modele: number;
  libelle: string;
  type_reponse: "OUI_NON" | "NOTE" | "TEXTE";
  ponderation: string;
  est_obligatoire: boolean;
  ordre: number;
}

export interface PhotoReponse {
  id: number;
  fichier: string;
  // Heure fixée par le serveur à la réception de la photo
  date_capture: string;
  legende: string;
  // Position du contrôleur au moment de l'envoi (absente si le GPS n'a pas répondu)
  latitude?: string | null;
  longitude?: string | null;
}

export interface Reponse {
  id: number;
  critere: number;
  critere_libelle: string;
  valeur: string;
  est_conforme: boolean;
  commentaire: string;
  photos: PhotoReponse[];
}

export interface GrilleOuverte {
  mission: Mission;
  criteres: Critere[];
  reponses: Reponse[];
}

// Ce que le contrôleur est en train de saisir pour un critère
export interface Saisie {
  valeur: string;
  conforme: boolean | null;
  commentaire: string;
}

// ---------- Clôture ----------

export interface Recapitulatif {
  mission: Mission;
  nb_criteres: number;
  nb_reponses: number;
  criteres_manquants: Critere[];
  // Critères non conformes sans aucune photo : la clôture est refusée tant qu'il en reste
  criteres_sans_photo?: Critere[];
  score_provisoire: number | string | null;
  peut_etre_cloturee: boolean;
}

export interface RapportGenere {
  id: number;
  score_conformite: number | string;
  statut: string;
  fichier_pdf: string;
}