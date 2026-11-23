import { isAxiosError } from "axios";

// Liste simple, ou liste paginée si la pagination est activée côté Django
export function extraireListe<T>(donnees: unknown): T[] {
  if (Array.isArray(donnees)) return donnees as T[];
  const resultats = (donnees as { results?: T[] } | null)?.results;
  return resultats ?? [];
}

const LIBELLES_CHAMPS: Record<string, string> = {
  partenaire: "Partenaire",
  site: "Site",
  montant_periodique: "Montant",
  periodicite: "Périodicité",
  date_debut: "Date de début",
  date_fin: "Date de fin",
  date_signature: "Date de signature",
  echeance: "Échéance",
  date_echeance: "Date de l'échéance",
  montant_du: "Montant dû",
  date_paiement: "Date du paiement",
  montant: "Montant",
  mode: "Mode de paiement",
  reference: "N° de l'ordre ou du chèque",
  justificatif: "Pièce jointe",
};

// Transforme une erreur de l'API en phrase lisible
export function messageErreur(erreur: unknown): string {
  if (isAxiosError(erreur)) {
    if (!erreur.response) return "Le serveur ne répond pas.";
    if (erreur.response.status >= 500) {
      return `Erreur du serveur (${erreur.response.status}).`;
    }
    const donnees: unknown = erreur.response.data;
    if (Array.isArray(donnees)) return donnees.join(" ");
    if (donnees && typeof donnees === "object") {
      const morceaux = Object.entries(donnees as Record<string, unknown>).map(([cle, valeur]) => {
        const texte = Array.isArray(valeur) ? valeur.join(" ") : String(valeur);
        return cle === "detail" || cle === "non_field_errors"
          ? texte
          : `${LIBELLES_CHAMPS[cle] ?? cle} : ${texte}`;
      });
      if (morceaux.length > 0) return morceaux.join(" ");
    }
  }
  return "Une erreur est survenue.";
}