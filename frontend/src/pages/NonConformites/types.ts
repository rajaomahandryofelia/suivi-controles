import type { Origine } from "../../components/PanneauIle";

export type Gravite = "MINEURE" | "MAJEURE" | "CRITIQUE";
export type StatutNC = "OUVERTE" | "CORRIGEE" | "VERIFIEE";

export type TypeEvenement = "CONSTATEE" | "RELANCEE" | "CORRIGEE" | "VERIFIEE" | "ROUVERTE";
export type MoyenRelance = "TELEPHONE" | "EMAIL" | "COURRIER" | "AUTRE";

export interface PhotoConstat {
  id: number;
  url: string;
  legende: string;
  date_capture: string;
}

// Une ligne du parcours : qui a fait quoi, et quand
export interface Evenement {
  id: number;
  type: TypeEvenement;
  type_libelle: string;
  date: string;
  auteur_nom: string | null;
  moyen: MoyenRelance | "";
  moyen_libelle: string;
  commentaire: string;
}

export interface NonConformite {
  id: number;
  site: number;
  site_nom: string;
  site_localisation: string;
  partenaire_nom: string | null;
  partenaire_contact: string | null;
  partenaire_telephone: string | null;
  partenaire_email: string | null;
  mission: number;
  critere_libelle: string;
  description: string;
  gravite: Gravite;
  gravite_libelle: string;
  statut: StatutNC;
  statut_libelle: string;
  detecte_par: string;
  date_detection: string;
  date_limite_correction: string;
  date_correction: string | null;
  date_verification: string | null;
  nombre_reouvertures: number;
  en_retard: boolean;
  jours_de_retard: number;
  prochain_controle: string | null;
  prochain_controleur: string | null;
  photos: PhotoConstat[];
  rapport_pdf: string | null;
  historique: Evenement[];
  nb_relances: number;
  derniere_relance: string | null;
}

export interface EtatPanneau {
  id: number;
  origine: Origine;
}

export interface EtatNotification {
  cle: number;
  type: "succes" | "erreur";
  texte: string;
}

export type Notifier = (type: "succes" | "erreur", texte: string) => void;