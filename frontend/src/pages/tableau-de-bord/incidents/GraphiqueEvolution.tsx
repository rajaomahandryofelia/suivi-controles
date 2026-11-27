import type { PointEvolution } from "./typesSupervision";

interface Props {
  points: PointEvolution[];
}

const LARGEUR = 560;
const HAUTEUR = 250;
const GAUCHE = 38;
const DROITE = 14;
const HAUT = 14;
const BAS = 30;

const COULEUR_RADIO = "#2f6fd6";
const COULEUR_TELEVISION = "#1aa561";

// Courbes « Radio » et « Télévision » : nombre d'incidents par mois
export default function GraphiqueEvolution({ points }: Props) {
  const largeurUtile = LARGEUR - GAUCHE - DROITE;
  const hauteurUtile = HAUTEUR - HAUT - BAS;

  const maximum = Math.max(...points.flatMap((p) => [p.radio, p.television]), 0);
  // Le sommet de l'échelle est un multiple de 5, pour des graduations entières
  const sommet = Math.max(5, Math.ceil(maximum / 5) * 5);
  const graduations = [0, 1, 2, 3, 4, 5].map((k) => (k * sommet) / 5);

  const x = (i: number) =>
    GAUCHE + (points.length === 1 ? largeurUtile / 2 : (i * largeurUtile) / (points.length - 1));
  const y = (valeur: number) => HAUT + hauteurUtile - (valeur / sommet) * hauteurUtile;

  const ligne = (cle: "radio" | "television") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p[cle])}`).join(" ");
  const aire = (cle: "radio" | "television") =>
    `${ligne(cle)} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  const series = [
    { cle: "radio" as const, couleur: COULEUR_RADIO, nom: "Radio" },
    { cle: "television" as const, couleur: COULEUR_TELEVISION, nom: "Télévision" },
  ];

  return (
    <div>
      <ul className="sup-legende">
        {series.map((s) => (
          <li key={s.cle}>
            <span className="sup-legende-point" style={{ background: s.couleur }} />
            {s.nom}
          </li>
        ))}
      </ul>

      <svg
        className="sup-graphique"
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        role="img"
        aria-label="Évolution du nombre d'incidents de radio et de télévision sur six mois"
      >
        {graduations.map((valeur) => (
          <g key={valeur}>
            <line
              x1={GAUCHE}
              x2={LARGEUR - DROITE}
              y1={y(valeur)}
              y2={y(valeur)}
              stroke="#e5e9e7"
              strokeWidth="1"
            />
            <text x={GAUCHE - 8} y={y(valeur) + 4} textAnchor="end" className="sup-axe">
              {valeur}
            </text>
          </g>
        ))}

        {points.map((p, i) => (
          <text key={p.mois} x={x(i)} y={HAUTEUR - 8} textAnchor="middle" className="sup-axe">
            {p.libelle}
          </text>
        ))}

        {series.map((s) => (
          <g key={s.cle}>
            <path d={aire(s.cle)} fill={s.couleur} opacity="0.1" />
            <path
              d={ligne(s.cle)}
              fill="none"
              stroke={s.couleur}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((p, i) => (
              <circle
                key={p.mois}
                cx={x(i)}
                cy={y(p[s.cle])}
                r="4"
                fill={s.couleur}
                stroke="#fff"
                strokeWidth="1.5"
              >
                <title>{`${s.nom}, ${p.libelle} : ${p[s.cle]}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}