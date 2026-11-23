import { MODES_PAIEMENT } from "./typesConventions";

export interface FormEcheance {
  // null = nouvelle échéance
  id: number | null;
  date_echeance: string;
  montant_du: string;
}

export interface FormPaiement {
  echeance: number;
  date_paiement: string;
  montant: string;
  mode: string;
  reference: string;
  banque: string;
  date_valeur: string;
  nom_payeur: string;
  observation: string;
  fichier: File | null;
}

export const FORMATS_ACCEPTES = ".pdf,.jpg,.jpeg,.png";
export const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo, comme côté serveur

export function controlerFichier(fichier: File): string {
  const nom = fichier.name.toLowerCase();
  if (![".pdf", ".jpg", ".jpeg", ".png"].some((extension) => nom.endsWith(extension))) {
    return "Format non accepté : envoyez un PDF ou une image (JPG, PNG).";
  }
  if (fichier.size > TAILLE_MAX) return "Le fichier dépasse 5 Mo.";
  return "";
}

export function libelleMode(mode: string): string {
  return MODES_PAIEMENT.find((m) => m.valeur === mode)?.texte ?? mode;
}