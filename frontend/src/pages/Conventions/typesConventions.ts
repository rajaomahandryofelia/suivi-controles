export type StatutConvention =
  | "BROUILLON"
  | "ENVOYEE"
  | "ACTIVE"
  | "SUSPENDUE"
  | "EXPIREE";

// Ce que renvoie l'API : /api/conventions/conventions/
export interface Convention {
  id: number;
  reference: string;
  statut: StatutConvention;
  statut_libelle: string;
  montant_periodique: string;
  periodicite: string;
  periodicite_libelle: string;
  date_debut: string;
  date_fin: string | null;
  date_signature: string | null;
  partenaire: number;
  partenaire_nom: string;
  site: number;
  site_nom: string;
  total_du: string;
  total_paye: string;
  arrieres: string;
}

export type StatutEcheance = "NON_PAYE" | "PARTIEL" | "PAYE";

// Un paiement : /api/conventions/paiements/
export interface Paiement {
  id: number;
  echeance: number;
  // Numéro de reçu automatique, par exemple REC-2026-0001 (absent des anciens paiements)
  numero_recu: string | null;
  date_paiement: string;
  montant: string;
  mode: string;
  mode_libelle: string;
  reference: string;
  // Détails selon le mode de paiement
  banque: string;
  date_valeur: string | null;
  nom_payeur: string;
  observation: string;
  enregistre_par: number | null;
  enregistre_par_nom: string | null;
  date_enregistrement: string;
  recu_envoye_le: string | null;
  // Adresse de la copie du chèque ou de l'ordre de virement (vide s'il n'y en a pas)
  justificatif: string | null;
  // Un paiement ne se supprime pas : il est annulé, avec un motif, et reste visible
  est_annule: boolean;
  date_annulation: string | null;
  annule_par_nom: string | null;
  motif_annulation: string;
}

// Un rappel ou une relance envoyé(e) au partenaire
export interface Relance {
  id: number;
  type: string;
  type_libelle: string;
  date_envoi: string;
  email_envoye: boolean;
}
export type RelanceEcheance = Relance;

// Une échéance avec ses paiements : /api/conventions/echeances/
export interface Echeance {
  id: number;
  convention: number;
  date_echeance: string;
  montant_du: string;
  statut: StatutEcheance;
  statut_libelle: string;
  numero_facture: string;
  date_facture: string | null;
  facture_envoyee_le: string | null;
  montant_paye: string;
  reste_a_payer: string;
  paiements: Paiement[];
  relances: Relance[];
}

// Listes de choix du formulaire (partenaires et sites viennent de /api/referentiels/)
export interface OptionPartenaire {
  id: number;
  nom: string;
}

export interface OptionSite {
  id: number;
  nom: string;
  // Le partenaire propriétaire du site (absent si l'API ne le renvoie pas)
  partenaire?: number | null;
}

export const PERIODICITES: { valeur: string; texte: string }[] = [
  { valeur: "MENSUELLE", texte: "Mensuelle" },
  { valeur: "TRIMESTRIELLE", texte: "Trimestrielle" },
  { valeur: "ANNUELLE", texte: "Annuelle" },
];

// Comme dans le tableau de la DPC : OP (ordre de publicité) et OV (ordre de virement)
export const MODES_PAIEMENT: { valeur: string; texte: string }[] = [
  { valeur: "ESPECES", texte: "Espèces (OP)" },
  { valeur: "CHEQUE", texte: "Chèque (OP)" },
  { valeur: "VIREMENT", texte: "Virement (OV)" },
];

// Les choix de la pilule de filtres
export const FILTRES_STATUT: { valeur: StatutConvention | "TOUTES"; texte: string }[] = [
  { valeur: "TOUTES", texte: "Toutes" },
  { valeur: "ACTIVE", texte: "Actives" },
  { valeur: "BROUILLON", texte: "Brouillons" },
  { valeur: "ENVOYEE", texte: "Envoyées" },
  { valeur: "SUSPENDUE", texte: "Suspendues" },
  { valeur: "EXPIREE", texte: "Expirées" },
];

// 1000000 -> « 1 000 000 Ar »
export function formaterAr(valeur: string | number): string {
  const nombre = Math.round(Number(valeur) || 0);
  return `${nombre.toLocaleString("fr-FR")} Ar`;
}

// 2026-10-27 -> « 27/10/2026 »
export function formaterDate(iso: string | null): string {
  if (!iso) return "—";
  const [annee, mois, jour] = iso.split("-");
  return `${jour}/${mois}/${annee}`;
}

// 2026-10-27T09:04:00+03:00 -> « 27/10/2026 à 09:04 »
export function formaterDateHeure(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const jour = String(date.getDate()).padStart(2, "0");
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const heures = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${jour}/${mois}/${date.getFullYear()} à ${heures}:${minutes}`;
}

// La date du jour, sur l'ordinateur de l'utilisateur, au format 2026-10-27
export function aujourdhuiIso(): string {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${jour}`;
}