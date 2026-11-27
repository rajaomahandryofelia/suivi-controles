import type { PartGravite } from "./typesSupervision";

interface Props {
  total: number;
  parts: PartGravite[];
}

const COULEURS: Record<string, string> = {
  CRITIQUE: "#e5322d",
  MAJEURE: "#f5a030",
  MINEURE: "#1aa561",
};

const RAYON = 62;
const EPAISSEUR = 26;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

// Anneau « Répartition par gravité » : un arc par gravité, le total au centre
export default function DonutGravite({ total, parts }: Props) {
  let decalage = 0;

  return (
    <div className="sup-donut-zone">
      <svg
        className="sup-donut"
        viewBox="0 0 180 180"
        role="img"
        aria-label={`${total} incidents répartis par gravité`}
      >
        {/* Anneau de fond (visible quand il n'y a aucun incident) */}
        <circle
          cx="90"
          cy="90"
          r={RAYON}
          fill="none"
          stroke="#eef2ef"
          strokeWidth={EPAISSEUR}
        />

        {total > 0 &&
          parts
            .filter((p) => p.nombre > 0)
            .map((p) => {
              const longueur = (p.nombre / total) * CIRCONFERENCE;
              const arc = (
                <circle
                  key={p.gravite}
                  cx="90"
                  cy="90"
                  r={RAYON}
                  fill="none"
                  stroke={COULEURS[p.gravite] ?? "#98a2b3"}
                  strokeWidth={EPAISSEUR}
                  strokeDasharray={`${longueur} ${CIRCONFERENCE - longueur}`}
                  strokeDashoffset={-decalage}
                  transform="rotate(-90 90 90)"
                >
                  <title>{`${p.libelle} : ${p.nombre}`}</title>
                </circle>
              );
              decalage += longueur;
              return arc;
            })}

        <text x="90" y="92" textAnchor="middle" className="sup-donut-total">
          {total}
        </text>
        <text x="90" y="112" textAnchor="middle" className="sup-donut-libelle">
          {total > 1 ? "Incidents" : "Incident"}
        </text>
      </svg>

      <ul className="sup-donut-legende">
        {parts.map((p) => (
          <li key={p.gravite}>
            <span className="sup-legende-point" style={{ background: COULEURS[p.gravite] }} />
            <div>
              <strong>{p.libelle}</strong>
              <span>
                ({p.nombre}) {p.pourcentage} %
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}