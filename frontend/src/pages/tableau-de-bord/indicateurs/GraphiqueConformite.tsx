import { useState } from "react";
import type { PointTendance } from "../statistiques";

const LARGEUR = 480;
const HAUTEUR = 160;
const MARGE_G = 34;
const MARGE_D = 20;
const Y_HAUT = 18;
const Y_BAS = 130;

function libelleMois(mois: string): string {
  return new Date(`${mois}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "short" });
}

// La courbe de conformité moyenne : se dessine au chargement, infobulle au survol d'un point
export default function GraphiqueConformite({ points }: { points: PointTendance[] }) {
  const [actif, setActif] = useState<number | null>(null);

  const serie: { i: number; mois: string; valeur: number }[] = [];
  points.forEach((p, i) => {
    if (p.valeur !== null) serie.push({ i, mois: p.mois, valeur: p.valeur });
  });

  if (serie.length < 2) {
    return (
      <p className="ind-vide">Pas encore assez de rapports validés pour tracer l'évolution.</p>
    );
  }

  const valeurs = serie.map((s) => s.valeur);
  const bas = Math.max(0, Math.floor((Math.min(...valeurs) - 5) / 10) * 10);
  const haut = Math.min(100, Math.max(bas + 10, Math.ceil((Math.max(...valeurs) + 5) / 10) * 10));
  const x = (i: number) => MARGE_G + (i * (LARGEUR - MARGE_G - MARGE_D)) / Math.max(points.length - 1, 1);
  const y = (v: number) => Y_BAS - ((v - bas) / (haut - bas)) * (Y_BAS - Y_HAUT);

  const trace = serie
    .map((s, k) => `${k === 0 ? "M" : "L"}${x(s.i).toFixed(1)} ${y(s.valeur).toFixed(1)}`)
    .join(" ");
  const aire = `${trace} L${x(serie[serie.length - 1].i).toFixed(1)} ${Y_BAS} L${x(serie[0].i).toFixed(1)} ${Y_BAS} Z`;
  const milieu = (bas + haut) / 2;

  const info = actif !== null ? serie[actif] : null;
  const infoX = info ? Math.min(Math.max(x(info.i), 46), LARGEUR - 46) : 0;

  return (
    <svg
      viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
      width="100%"
      role="img"
      aria-label={`Conformité moyenne sur six mois, de ${serie[0].valeur} % à ${serie[serie.length - 1].valeur} %`}
    >
      {[bas, milieu, haut].map((v) => (
        <g key={v}>
          <line x1={MARGE_G} x2={LARGEUR - MARGE_D} y1={y(v)} y2={y(v)} className="ind-grille" />
          <text x={MARGE_G - 8} y={y(v) + 4} className="ind-axe" textAnchor="end">
            {v}
          </text>
        </g>
      ))}

      <path d={aire} className="ind-aire" />
      <path d={trace} pathLength={1} className="ind-trace" />

      {points.map((p, i) => (
        <text key={p.mois} x={x(i)} y={HAUTEUR - 6} className="ind-axe" textAnchor="middle">
          {libelleMois(p.mois)}
        </text>
      ))}

      {serie.map((s, k) => (
        <g key={s.mois}>
          <circle
            cx={x(s.i)}
            cy={y(s.valeur)}
            r={k === serie.length - 1 ? 5 : 3.5}
            className={`ind-point-courbe${actif === k ? " actif" : ""}`}
          />
          {/* Zone de survol plus large que le point */}
          <circle
            cx={x(s.i)}
            cy={y(s.valeur)}
            r={14}
            fill="transparent"
            tabIndex={0}
            aria-label={`${libelleMois(s.mois)} : ${s.valeur} %`}
            onMouseEnter={() => setActif(k)}
            onMouseLeave={() => setActif(null)}
            onFocus={() => setActif(k)}
            onBlur={() => setActif(null)}
          />
        </g>
      ))}

      {info && (
        <g pointerEvents="none">
          <rect x={infoX - 40} y={y(info.valeur) - 38} width={80} height={26} rx={6} className="ind-bulle" />
          <text x={infoX} y={y(info.valeur) - 21} textAnchor="middle" className="ind-bulle-texte">
            {libelleMois(info.mois)} · {info.valeur} %
          </text>
        </g>
      )}
    </svg>
  );
}