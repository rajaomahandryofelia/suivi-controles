import type { Utilisateur } from "../../../types";
import { CHAMPS_MASQUES, CHAMPS_PRINCIPAUX, LIBELLES_FICHE } from "../constantes";
import { formaterFiche, libelle } from "../outils";

// Prépare les lignes affichées dans la fiche : champs principaux, puis les autres renseignés
export function champsFiche(demande: Utilisateur) {
  const donnees = demande as unknown as Record<string, unknown>;

  const principaux = CHAMPS_PRINCIPAUX.map(({ cle, libelle: etiquette }) => {
    const valeur = formaterFiche(cle, donnees[cle]);
    return { etiquette, valeur: valeur ?? "Non renseigné", vide: valeur === null };
  });

  const supplementaires = Object.entries(donnees)
    .filter(([cle]) => !CHAMPS_MASQUES.has(cle))
    .map(([cle, v]) => ({
      etiquette: LIBELLES_FICHE[cle] ?? libelle(cle),
      valeur: formaterFiche(cle, v),
    }))
    .filter((x) => x.valeur !== null);

  return { principaux, supplementaires };
}