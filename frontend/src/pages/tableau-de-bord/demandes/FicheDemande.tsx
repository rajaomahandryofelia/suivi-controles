import type { Utilisateur } from "../../../types";
import { champsFiche } from "./champsFiche";
import { IconeRefuser, IconeValider } from "../icones/Icones";
import { initiales, nomAffiche } from "../outils";
import { useFenetreModale } from "../hooks/useFenetreModale";
import "./FicheDemande.css";

// Fiche détaillée d'une demande d'inscription (fenêtre superposée)
export default function FicheDemande({
  demande,
  desactive,
  onFermer,
  onAccepter,
  onRefuser,
}: {
  demande: Utilisateur;
  desactive: boolean;
  onFermer: () => void;
  onAccepter: () => void;
  onRefuser: () => void;
}) {
  const { boite, pieger } = useFenetreModale(onFermer);
  const titreId = `fiche-titre-${demande.id}`;
  const { principaux, supplementaires } = champsFiche(demande);

  return (
    <div
      className="tdb-fond"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        className="tdb-fiche"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        tabIndex={-1}
        ref={boite}
        onKeyDown={pieger}
      >
        <div className="tdb-fiche-tete">
          <div className="tdb-avatar" aria-hidden="true">{initiales(demande)}</div>
          <div className="tdb-fiche-titres">
            <h2 id={titreId}>{nomAffiche(demande)}</h2>
            <p>Demande d'inscription · en attente de validation</p>
          </div>
          <button
            type="button"
            className="tdb-fiche-fermer"
            aria-label="Fermer la fiche"
            onClick={onFermer}
          >
            <IconeRefuser />
          </button>
        </div>

        <dl className="tdb-fiche-grille">
          {principaux.map((c) => (
            <div className="tdb-fiche-item" key={c.etiquette}>
              <dt>{c.etiquette}</dt>
              <dd className={c.vide ? "vide" : ""}>{c.valeur}</dd>
            </div>
          ))}
          {supplementaires.map((c) => (
            <div className="tdb-fiche-item" key={c.etiquette}>
              <dt>{c.etiquette}</dt>
              <dd>{c.valeur}</dd>
            </div>
          ))}
        </dl>

        <div className="tdb-fiche-pied">
          <button
            type="button"
            className="tdb-fiche-bouton refuser"
            disabled={desactive}
            onClick={onRefuser}
          >
            <IconeRefuser />
            Refuser
          </button>
          <button
            type="button"
            className="tdb-fiche-bouton accepter"
            disabled={desactive}
            onClick={onAccepter}
          >
            <IconeValider />
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}