import { libelleMode } from "./echeancesOutils";
import type { FormPaiement } from "./echeancesOutils";
import { formaterAr, formaterDate } from "./typesConventions";
import type { Convention, Echeance } from "./typesConventions";

interface Props {
  convention: Convention;
  form: FormPaiement;
  echeance: Echeance;
  occupe: boolean;
  onConfirmer: () => void;
  onModifier: () => void;
}

// Récapitulatif affiché avant l'enregistrement d'un paiement
export default function RecapitulatifPaiement({
  convention,
  form: f,
  echeance: e,
  occupe,
  onConfirmer,
  onModifier,
}: Props) {
  const lignes: [string, string][] = [
    ["Partenaire", convention.partenaire_nom],
    ["Convention", convention.reference],
    ["Échéance", formaterDate(e.date_echeance)],
    ["Montant", formaterAr(f.montant)],
    ["Mode", libelleMode(f.mode)],
    ["Date du paiement", formaterDate(f.date_paiement)],
  ];
  if (f.reference.trim()) lignes.push(["N° de l'ordre ou du chèque", f.reference.trim()]);
  if (f.banque.trim() && f.mode !== "ESPECES") lignes.push(["Banque", f.banque.trim()]);
  if (f.date_valeur && f.mode === "VIREMENT") lignes.push(["Date de valeur", formaterDate(f.date_valeur)]);
  if (f.nom_payeur.trim()) lignes.push(["Payé par", f.nom_payeur.trim()]);
  if (f.observation.trim()) lignes.push(["Observation", f.observation.trim()]);
  if (f.fichier) lignes.push(["Pièce jointe", f.fichier.name]);
  const apres = Math.max(Number(e.reste_a_payer) - Number(f.montant), 0);

  return (
    <div className="ech-formulaire ech-recap">
      <strong className="ech-formulaire-titre">Vérifiez avant d'enregistrer</strong>
      <dl className="ech-recap-liste">
        {lignes.map(([cle, valeur]) => (
          <div key={cle}>
            <dt>{cle}</dt>
            <dd>{valeur}</dd>
          </div>
        ))}
        <div className="total">
          <dt>Reste à payer après ce paiement</dt>
          <dd>{apres > 0 ? formaterAr(apres) : "Échéance soldée"}</dd>
        </div>
      </dl>
      <p className="ech-recap-note">
        Un numéro de reçu sera attribué. Un paiement enregistré ne peut plus être modifié : en cas
        d'erreur, on l'annule avec un motif.
      </p>
      <div className="conv-boutons plein">
        <button type="button" className="conv-bouton" onClick={onConfirmer} disabled={occupe}>
          {occupe ? "Enregistrement…" : "Confirmer et enregistrer"}
        </button>
        <button type="button" className="conv-bouton secondaire" onClick={onModifier} disabled={occupe}>
          Modifier
        </button>
      </div>
    </div>
  );
}