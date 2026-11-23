import type { ActionMaki } from "./useConversationMaki";

interface Props {
  action: ActionMaki;
  onConfirmer: () => void;
  onAnnuler: () => void;
}

/** Carte « Voici ce que je vais faire » : rien n'est exécuté avant le clic sur Confirmer. */
export default function CarteActionMaki({ action, onConfirmer, onAnnuler }: Props) {
  const envoi = action.etat === "envoi";
  const termine = action.etat === "confirmee" || action.etat === "annulee";

  return (
    <div className={`mk-action ${action.etat}`} role="group" aria-label={action.titre}>
      <strong className="mk-action-titre">{action.titre}</strong>
      <ul className="mk-action-lignes">
        {action.lignes.map((ligne, i) => (
          <li key={i}>{ligne}</li>
        ))}
      </ul>
      {action.avertissement && <p className="mk-action-note">{action.avertissement}</p>}
      {action.erreur && (
        <p className="mk-action-erreur" role="alert">
          {action.erreur}
        </p>
      )}

      {action.etat === "confirmee" && <p className="mk-action-etat fait">Action effectuée</p>}
      {action.etat === "annulee" && <p className="mk-action-etat">Action annulée</p>}

      {!termine && (
        <div className="mk-action-boutons">
          <button type="button" className="mk-action-annuler" onClick={onAnnuler} disabled={envoi}>
            Annuler
          </button>
          <button type="button" className="bouton" onClick={onConfirmer} disabled={envoi}>
            {envoi ? "Enregistrement…" : "Confirmer"}
          </button>
        </div>
      )}
    </div>
  );
}