import type { ChangeEvent, FormEvent } from "react";
import { FORMATS_ACCEPTES } from "./echeancesOutils";
import type { FormPaiement } from "./echeancesOutils";
import { MODES_PAIEMENT, aujourdhuiIso, formaterAr } from "./typesConventions";
import type { Convention, Echeance } from "./typesConventions";

interface Props {
  form: FormPaiement;
  convention: Convention;
  echeance: Echeance;
  occupe: boolean;
  onChange: (champ: keyof FormPaiement, valeur: string) => void;
  onFichier: (evenement: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (evenement: FormEvent) => void;
  onAnnuler: () => void;
}

export default function FormulairePaiement({
  form,
  convention,
  echeance,
  occupe,
  onChange,
  onFichier,
  onSubmit,
  onAnnuler,
}: Props) {
  return (
    <form className="ech-formulaire" onSubmit={onSubmit}>
      <strong className="ech-formulaire-titre">Nouveau paiement</strong>
      <label>
        Date du paiement
        <input
          type="date"
          max={aujourdhuiIso()}
          min={convention.date_signature ?? undefined}
          value={form.date_paiement}
          onChange={(ev) => onChange("date_paiement", ev.target.value)}
        />
      </label>
      <label>
        Montant (Ar)
        <input
          type="number"
          min="0"
          step="1000"
          value={form.montant}
          onChange={(ev) => onChange("montant", ev.target.value)}
        />
        <small>Reste à payer : {formaterAr(echeance.reste_a_payer)}</small>
      </label>
      <label>
        Mode de paiement
        <select value={form.mode} onChange={(ev) => onChange("mode", ev.target.value)}>
          <option value="">Choisir…</option>
          {MODES_PAIEMENT.map((m) => (
            <option key={m.valeur} value={m.valeur}>
              {m.texte}
            </option>
          ))}
        </select>
      </label>
      <label>
        {form.mode === "VIREMENT"
          ? "N° de l'ordre de virement"
          : form.mode === "CHEQUE"
            ? "N° du chèque"
            : "N° de l'ordre (facultatif)"}
        <input
          type="text"
          maxLength={50}
          placeholder={form.mode === "ESPECES" ? "OP N°04/26" : ""}
          value={form.reference}
          onChange={(ev) => onChange("reference", ev.target.value)}
        />
      </label>

      {(form.mode === "CHEQUE" || form.mode === "VIREMENT") && (
        <label>
          Banque
          <input
            type="text"
            maxLength={100}
            placeholder="Ex. BNI Madagascar"
            value={form.banque}
            onChange={(ev) => onChange("banque", ev.target.value)}
          />
        </label>
      )}
      {form.mode === "VIREMENT" && (
        <label>
          Date de valeur (facultatif)
          <input
            type="date"
            value={form.date_valeur}
            onChange={(ev) => onChange("date_valeur", ev.target.value)}
          />
        </label>
      )}

      <label>
        Payé par (facultatif)
        <input
          type="text"
          maxLength={100}
          placeholder="Nom de la personne qui remet le paiement"
          value={form.nom_payeur}
          onChange={(ev) => onChange("nom_payeur", ev.target.value)}
        />
      </label>
      <label>
        Observation (facultatif)
        <input
          type="text"
          maxLength={255}
          placeholder="Ex. Paiement partiel, solde en novembre"
          value={form.observation}
          onChange={(ev) => onChange("observation", ev.target.value)}
        />
      </label>
      <label className="large">
        Copie du chèque ou de l'ordre de virement (facultatif)
        <input type="file" accept={FORMATS_ACCEPTES} onChange={onFichier} />
        <small>PDF, JPG ou PNG, 5 Mo au plus.</small>
      </label>
      <div className="conv-boutons plein">
        <button type="submit" className="conv-bouton" disabled={occupe}>
          Vérifier le paiement
        </button>
        <button type="button" className="conv-bouton secondaire" onClick={onAnnuler} disabled={occupe}>
          Annuler
        </button>
      </div>
    </form>
  );
}