import { useState } from "react";
import "./IleDynamique.css";

type Props = {
  nom: string;
  date: string;
  estDirecteur: boolean;
  nbDemandes: number;
};

export default function IleDynamique({ nom, date, estDirecteur, nbDemandes }: Props) {
  const [ouverte, setOuverte] = useState(false);
  const aTraiter = estDirecteur && nbDemandes > 0;

  return (
    <header className="ile-zone">
      <button
        type="button"
        className={`ile${ouverte ? " ile--ouverte" : ""}`}
        aria-expanded={ouverte}
        onClick={() => setOuverte((o) => !o)}
      >
        <span className="ile-ligne">
          <span className="ile-point" aria-hidden="true" />
          <span className="ile-titre">Bonjour, {nom}</span>
          <span className="ile-date">{date}</span>
          {aTraiter && !ouverte && <span className="ile-badge">{nbDemandes}</span>}
          <svg className="ile-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <span className="ile-detail">
          <span className="ile-detail-interieur">
            <span className="ile-puce ile-puce--role">{estDirecteur ? "Directeur" : "Contrôleur"}</span>
            {estDirecteur && (
              <span className={`ile-puce${aTraiter ? " ile-puce--alerte" : ""}`}>
                {aTraiter
                  ? `${nbDemandes} demande${nbDemandes > 1 ? "s" : ""} d'inscription en attente`
                  : "Rien en attente"}
              </span>
            )}
          </span>
        </span>
      </button>
    </header>
  );
}