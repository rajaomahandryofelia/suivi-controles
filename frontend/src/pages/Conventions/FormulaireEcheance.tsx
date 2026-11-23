import type { FormEvent } from "react";
import type { FormEcheance } from "./echeancesOutils";

interface Props {
  titre: string;
  valeur: FormEcheance;
  occupe: boolean;
  onChange: (valeur: FormEcheance) => void;
  onSubmit: (evenement: FormEvent) => void;
  onAnnuler: () => void;
}

export default function FormulaireEcheance({
  titre,
  valeur,
  occupe,
  onChange,
  onSubmit,
  onAnnuler,
}: Props) {
  return (
    <form className="ech-formulaire" onSubmit={onSubmit}>
      <strong className="ech-formulaire-titre">{titre}</strong>
      <label>
        Date de l'échéance
        <input
          type="date"
          value={valeur.date_echeance}
          onChange={(e) => onChange({ ...valeur, date_echeance: e.target.value })}
        />
      </label>
      <label>
        Montant dû (Ar)
        <input
          type="number"
          min="0"
          step="1000"
          value={valeur.montant_du}
          onChange={(e) => onChange({ ...valeur, montant_du: e.target.value })}
        />
      </label>
      <div className="conv-boutons plein">
        <button type="submit" className="conv-bouton" disabled={occupe}>
          Enregistrer
        </button>
        <button type="button" className="conv-bouton secondaire" onClick={onAnnuler} disabled={occupe}>
          Annuler
        </button>
      </div>
    </form>
  );
}