import type { EtatSite, SiteCarte } from "./typesSupervision";

interface Props {
  sites: SiteCarte[];
}

// Contour simplifié de Madagascar : [longitude, latitude]
const CONTOUR: [number, number][] = [
  [49.28, -12.0], [49.55, -12.5], [49.9, -13.5], [50.15, -14.3], [50.25, -15.0],
  [49.8, -15.5], [49.75, -16.3], [49.6, -17.0], [49.45, -17.9], [49.35, -18.9],
  [48.9, -19.9], [48.4, -21.2], [48.0, -22.2], [47.8, -23.0], [47.55, -24.0],
  [47.0, -25.05], [46.2, -25.4], [45.2, -25.6], [44.4, -25.2], [43.8, -24.5],
  [43.65, -23.4], [43.4, -22.3], [43.3, -21.3], [44.0, -20.3], [44.2, -19.0],
  [44.0, -18.0], [44.5, -16.7], [46.0, -15.7], [46.8, -15.4], [47.5, -14.9],
  [48.0, -14.0], [48.4, -13.3], [48.9, -12.5],
];

// Projection : même échelle en longitude et en latitude (la longitude est
// raccourcie par le cosinus de la latitude moyenne, environ 18°)
const ECHELLE = 20;
const COSINUS = 0.95;
const LONGITUDE_OUEST = 43.0;
const LATITUDE_NORD = -11.8;

const projeter = (longitude: number, latitude: number) => ({
  x: 4 + (longitude - LONGITUDE_OUEST) * COSINUS * ECHELLE,
  y: 4 + (LATITUDE_NORD - latitude) * ECHELLE,
});

const COULEURS: Record<EtatSite, string> = {
  NORMAL: "#1aa561",
  A_SURVEILLER: "#f5a030",
  CRITIQUE: "#e5322d",
};

const LIBELLES: Record<EtatSite, string> = {
  NORMAL: "Normal",
  A_SURVEILLER: "À surveiller",
  CRITIQUE: "Critique",
};

// L'ordre de dessin : les sites critiques par-dessus les autres
const ORDRE: EtatSite[] = ["NORMAL", "A_SURVEILLER", "CRITIQUE"];

export default function CarteSites({ sites }: Props) {
  const contour = CONTOUR.map(([longitude, latitude]) => {
    const { x, y } = projeter(longitude, latitude);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const parEtat = (etat: EtatSite) => sites.filter((s) => s.etat === etat).length;
  const tries = [...sites].sort((a, b) => ORDRE.indexOf(a.etat) - ORDRE.indexOf(b.etat));

  return (
    <div className="sup-carte-zone">
      <svg
        className="sup-carte"
        viewBox="0 0 150 290"
        role="img"
        aria-label="Carte de Madagascar : état des sites"
      >
        <polygon
          points={contour}
          fill="#eaf3ee"
          stroke="#b8d3c4"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {tries.map((site) => {
          const { x, y } = projeter(site.longitude, site.latitude);
          return (
            <circle
              key={site.id}
              cx={x}
              cy={y}
              r="4.5"
              fill={COULEURS[site.etat]}
              stroke="#fff"
              strokeWidth="1.5"
            >
              <title>{`${site.nom} : ${LIBELLES[site.etat]}`}</title>
            </circle>
          );
        })}
      </svg>

      <ul className="sup-carte-legende">
        {ORDRE.map((etat) => (
          <li key={etat}>
            <span className="sup-legende-point" style={{ background: COULEURS[etat] }} />
            {LIBELLES[etat]}
            <strong>{parEtat(etat)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}