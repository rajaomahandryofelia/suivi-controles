import { FILTRES_STATUT, formaterAr } from "./typesConventions";
import type { StatutConvention } from "./typesConventions";

interface Props {
  filtre: StatutConvention | "TOUTES";
  onFiltre: (valeur: StatutConvention | "TOUTES") => void;
  nombrePour: (valeur: StatutConvention | "TOUTES") => number;
  onNouvelle: () => void;
  recherche: string;
  onRecherche: (texte: string) => void;
  // null : le total n'est pas affiché (chargement ou erreur)
  totalArrieres: number | null;
}

// Pilule de filtres + bouton d'ajout, puis recherche et total des arriérés
export default function BarreConventions({
  filtre,
  onFiltre,
  nombrePour,
  onNouvelle,
  recherche,
  onRecherche,
  totalArrieres,
}: Props) {
  return (
    <>
      <div className="lst-ilot-zone">
        <div className="lst-ilot" role="group" aria-label="Filtrer les conventions">
          {FILTRES_STATUT.map((choix) => {
            const nombre = nombrePour(choix.valeur);
            return (
              <button
                key={choix.valeur}
                type="button"
                aria-pressed={filtre === choix.valeur}
                className={`lst-segment${filtre === choix.valeur ? " actif" : ""}`}
                onClick={() => onFiltre(choix.valeur)}
                title={`${nombre} convention${nombre > 1 ? "s" : ""}`}
              >
                {choix.texte}
              </button>
            );
          })}

          <span className="lst-separateur" aria-hidden="true" />
          <button type="button" className="lst-ajout" onClick={onNouvelle}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nouvelle convention
          </button>
        </div>
      </div>

      <div className="lst-outils">
        <div className="lst-recherche">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={recherche}
            onChange={(e) => onRecherche(e.target.value)}
            placeholder="Rechercher un partenaire, un site, un numéro…"
            aria-label="Rechercher une convention"
          />
        </div>

        {totalArrieres !== null && (
          <div className="cv-arrieres" title="Somme des montants échus et non payés">
            <span>Total des arriérés</span>
            <strong className={totalArrieres > 0 ? "du" : ""}>{formaterAr(totalArrieres)}</strong>
          </div>
        )}
      </div>
    </>
  );
}