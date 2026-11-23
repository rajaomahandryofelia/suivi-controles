import type { ChangeEvent, FormEvent } from "react";
import { FORMATS_ACCEPTES } from "./echeancesOutils";
import { formaterAr, formaterDate, formaterDateHeure } from "./typesConventions";
import type { Paiement } from "./typesConventions";

interface Props {
  paiement: Paiement;
  occupe: boolean;
  // Annulation en cours de saisie (motif obligatoire), si elle concerne ce paiement
  annulation: { id: number; motif: string } | null;
  onChangerMotif: (motif: string) => void;
  onDemanderAnnulation: () => void;
  onConfirmerAnnulation: (evenement: FormEvent) => void;
  onGarder: () => void;
  onVoirRecu: () => void;
  onRenvoyerRecu: () => void;
  onJoindre: (evenement: ChangeEvent<HTMLInputElement>) => void;
  onRetirerPiece: () => void;
}

// Un paiement dans la liste d'une échéance (historique, pièces, actions, annulation)
export default function LignePaiement({
  paiement: p,
  occupe,
  annulation,
  onChangerMotif,
  onDemanderAnnulation,
  onConfirmerAnnulation,
  onGarder,
  onVoirRecu,
  onRenvoyerRecu,
  onJoindre,
  onRetirerPiece,
}: Props) {
  return (
    <li className={p.est_annule ? "annule" : ""}>
      <div className="ech-paiement-tete">
        <span className="ech-recu">{p.numero_recu ?? "Reçu sans numéro"}</span>
        {p.est_annule && <span className="ech-annule-etiquette">Annulé</span>}
      </div>
      <div className="ech-paiement-ligne">
        <strong>{formaterAr(p.montant)}</strong>
        <span>{formaterDate(p.date_paiement)}</span>
        <span className="ech-mode">{p.mode_libelle}</span>
        {p.reference && <span>N° {p.reference}</span>}
        {p.banque && <span>{p.banque}</span>}
        {p.date_valeur && <small>valeur {formaterDate(p.date_valeur)}</small>}
      </div>
      {(p.nom_payeur || p.observation) && (
        <p className="ech-paiement-notes">
          {p.nom_payeur && <span>Payé par {p.nom_payeur}</span>}
          {p.observation && <span>{p.observation}</span>}
        </p>
      )}
      <small className="ech-trace">
        {p.enregistre_par_nom ? `Enregistré par ${p.enregistre_par_nom}` : "Enregistré"} le{" "}
        {formaterDateHeure(p.date_enregistrement)}
      </small>
      {p.est_annule && (
        <p className="ech-annulation-info">
          Annulé le {formaterDateHeure(p.date_annulation)}
          {p.annule_par_nom ? ` par ${p.annule_par_nom}` : ""}. Motif : {p.motif_annulation}
        </p>
      )}

      <div className="ech-actions">
        {!p.est_annule &&
          (p.justificatif ? (
            <>
              <a className="conv-pdf" href={p.justificatif} target="_blank" rel="noreferrer">
                Voir la pièce jointe
              </a>
              <button type="button" className="conv-pdf" onClick={onRetirerPiece} disabled={occupe}>
                Retirer la pièce
              </button>
            </>
          ) : (
            <label className="conv-pdf ech-fichier">
              Joindre la copie du chèque ou du virement
              <input
                type="file"
                accept={FORMATS_ACCEPTES}
                onChange={onJoindre}
                disabled={occupe}
                hidden
              />
            </label>
          ))}
        {p.est_annule && p.justificatif && (
          <a className="conv-pdf" href={p.justificatif} target="_blank" rel="noreferrer">
            Voir la pièce jointe
          </a>
        )}
        <button type="button" className="conv-pdf" onClick={onVoirRecu}>
          Voir le reçu
        </button>
        {!p.est_annule && (
          <>
            <button type="button" className="conv-pdf" onClick={onRenvoyerRecu} disabled={occupe}>
              {p.recu_envoye_le
                ? `Reçu envoyé le ${formaterDateHeure(p.recu_envoye_le)} · renvoyer`
                : "Reçu non envoyé · envoyer"}
            </button>
            <button type="button" className="conv-pdf danger" onClick={onDemanderAnnulation} disabled={occupe}>
              Annuler ce paiement
            </button>
          </>
        )}
      </div>

      {annulation?.id === p.id && (
        <form className="ech-annulation" onSubmit={onConfirmerAnnulation}>
          <label>
            Motif de l'annulation (obligatoire)
            <textarea
              rows={2}
              maxLength={255}
              value={annulation.motif}
              onChange={(ev) => onChangerMotif(ev.target.value)}
              placeholder="Ex. Chèque sans provision, erreur de saisie du montant…"
              autoFocus
            />
            <small>
              Le paiement reste visible, barré, avec ce motif. Il n'entre plus dans les totaux.
            </small>
          </label>
          <div className="ech-actions">
            <button type="submit" className="conv-bouton danger" disabled={occupe}>
              {occupe ? "Annulation…" : "Confirmer l'annulation"}
            </button>
            <button type="button" className="conv-bouton secondaire" onClick={onGarder} disabled={occupe}>
              Garder le paiement
            </button>
          </div>
        </form>
      )}
    </li>
  );
}