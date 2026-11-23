import { useState } from "react";
import type { NiveauRisque } from "../statistiques";

const NIVEAUX: { cle: NiveauRisque; libelle: string }[] = [
  { cle: "FAIBLE", libelle: "Faible" },
  { cle: "MOYEN", libelle: "Moyen" },
  { cle: "ELEVE", libelle: "Élevé" },
  { cle: "CRITIQUE", libelle: "Critique" },
  { cle: "SANS_SCORE", libelle: "Sans score" },
];

const RAYON = 44;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

// La répartition des sites par niveau de risque : un anneau qui se dessine, légende liée au survol
export default function AnneauRisque({ niveaux }: { niveaux: Record<NiveauRisque, number> }) {
  const [survol, setSurvol] = useState<NiveauRisque | null>(null);
  const total = NIVEAUX.reduce((t, n) => t + (niveaux[n.cle] ?? 0), 0);

  if (total === 0) return <p className="ind-vide">Aucun site actif.</p>;

  let cumul = 0;
  const arcs = NIVEAUX.filter((n) => (niveaux[n.cle] ?? 0) > 0).map((n) => {
    const longueur = ((niveaux[n.cle] ?? 0) / total) * CIRCONFERENCE;
    const arc = { ...n, longueur, decalage: cumul };
    cumul += longueur;
    return arc;
  });

  return (
    <div className="ind-anneau">
      <svg
        viewBox="0 0 120 120"
        width="120"
        height="120"
        role="img"
        aria-label={`${total} sites : ${NIVEAUX.map((n) => `${niveaux[n.cle] ?? 0} ${n.libelle.toLowerCase()}`).join(", ")}`}
      >
        {arcs.map((a) => (
          <circle
            key={a.cle}
            cx={60}
            cy={60}
            r={RAYON}
            fill="none"
            className={`ind-arc arc-${a.cle}`}
            strokeWidth={survol === a.cle ? 18 : 14}
            strokeDasharray={`${Math.max(a.longueur - 2, 0.1)} ${CIRCONFERENCE}`}
            strokeDashoffset={-a.decalage}
            transform="rotate(-90 60 60)"
            opacity={survol && survol !== a.cle ? 0.3 : 1}
            onMouseEnter={() => setSurvol(a.cle)}
            onMouseLeave={() => setSurvol(null)}
          />
        ))}
        <text x={60} y={59} textAnchor="middle" className="ind-anneau-total">
          {survol ? (niveaux[survol] ?? 0) : total}
        </text>
        <text x={60} y={74} textAnchor="middle" className="ind-axe">
          {survol ? NIVEAUX.find((n) => n.cle === survol)?.libelle.toLowerCase() : "sites"}
        </text>
      </svg>

      <ul className="ind-legende">
        {NIVEAUX.filter((n) => n.cle !== "SANS_SCORE" || (niveaux.SANS_SCORE ?? 0) > 0).map((n) => (
          <li
            key={n.cle}
            className={survol === n.cle ? "actif" : ""}
            onMouseEnter={() => setSurvol(n.cle)}
            onMouseLeave={() => setSurvol(null)}
          >
            <span>
              <span className={`ind-point niv-${n.cle}`} aria-hidden="true" />
              {n.libelle}
            </span>
            <strong>{niveaux[n.cle] ?? 0}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}