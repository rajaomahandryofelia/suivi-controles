import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import Nombre from "./Nombre";
import "./PanneauProcessus.css";

// Une étape du parcours d'un contrôle
export interface EtapeProcessus {
  cle: string;
  libelle: string;
  nombre: number;
  // « attention » et « danger » : le directeur doit agir ; « neutre » : simple suivi
  ton: "neutre" | "attention" | "danger";
  vers: string;
  // Petite précision sous le chiffre (ex. « dont 3 en retard »)
  note?: string | null;
}

interface Props {
  etapes: EtapeProcessus[];
  // Demandes d'inscription : une seule ligne sous le parcours
  demandes?: { nombre: number; action: () => void };
  // Rang d'apparition (les blocs arrivent l'un après l'autre)
  rang?: number;
}

// Le parcours d'un contrôle, de la planification au suivi des corrections
export default function PanneauProcessus({ etapes, demandes, rang = 0 }: Props) {
  const navigate = useNavigate();

  return (
    <section
      className="ind-panneau ind-entree ind-proc"
      style={{ "--i": rang } as CSSProperties}
      aria-labelledby="ind-proc"
    >
      <div className="ind-panneau-tete">
        <h2 className="ind-titre" id="ind-proc">
          Parcours des contrôles
        </h2>
      </div>

      <ol className="ind-proc-etapes">
        {etapes.map((e, i) => {
          const vide = e.nombre === 0;
          const aTraiter = !vide && e.ton !== "neutre";
          return (
            <li key={e.cle} className="ind-proc-etape">
              <button
                type="button"
                className={`ind-proc-carte ${e.ton}${vide ? " vide" : ""}`}
                onClick={() => navigate(e.vers)}
              >
                <span className="ind-proc-tete">
                  <span className="ind-proc-rang" aria-hidden="true">
                    {i + 1}
                  </span>
                  {aTraiter && <span className="ind-proc-tag">À traiter</span>}
                </span>
                <strong className="ind-proc-nombre">
                  <Nombre valeur={e.nombre} />
                </strong>
                <span className="ind-proc-libelle">{e.libelle}</span>
                {e.note && <span className="ind-proc-note">{e.note}</span>}
              </button>
            </li>
          );
        })}
      </ol>

      {demandes && demandes.nombre > 0 && (
        <button type="button" className="ind-proc-demandes" onClick={demandes.action}>
          <span className="ind-proc-demandes-point" aria-hidden="true" />
          {demandes.nombre} demande{demandes.nombre > 1 ? "s" : ""} d'inscription en attente
          <span className="ind-proc-demandes-action">Traiter ›</span>
        </button>
      )}
    </section>
  );
}