import { useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import type { SiteARisque } from "../statistiques";
import "./PanneauSites.css";

type Niveau = SiteARisque["niveau"];

const LIBELLES: Record<Niveau, string> = {
  FAIBLE: "Faible",
  MOYEN: "Moyen",
  ELEVE: "Élevé",
  CRITIQUE: "Critique",
};

const NIVEAUX: Niveau[] = ["FAIBLE", "MOYEN", "ELEVE", "CRITIQUE"];

// Dimensions du graphique (unités du viewBox)
const HAUTEUR = 250;
const HAUT = 22;
const BAS = 58;
const GAUCHE = 56;
const DROITE = 16;
const PLAGE = HAUTEUR - HAUT - BAS;
const PAS_MIN = 84;
const LARGEUR_MIN = 520;
const GRADUATIONS = [0, 25, 50, 75, 100];

const court = (nom: string) => (nom.length > 12 ? `${nom.slice(0, 11)}…` : nom);

interface Props {
  sites: SiteARisque[];
  // Rang d'apparition (les blocs arrivent l'un après l'autre)
  rang?: number;
}

// Sites à surveiller : score de risque de chaque site (axe vertical) selon le site (axe horizontal)
export default function PanneauSites({ sites, rang = 0 }: Props) {
  const navigate = useNavigate();
  const [actif, setActif] = useState<number | null>(null);

  const points = sites.map((s) => ({
    ...s,
    score: Math.max(0, Math.min(100, Number(s.valeur) || 0)),
  }));
  const n = points.length;

  const largeur = Math.max(LARGEUR_MIN, GAUCHE + DROITE + n * PAS_MIN);
  const pas = n > 0 ? (largeur - GAUCHE - DROITE) / n : 0;
  const largeurBarre = Math.min(40, pas * 0.5);
  const y = (v: number) => HAUT + PLAGE * (1 - v / 100);
  const bas = HAUT + PLAGE;

  const point = actif !== null ? points[actif] : null;
  let bulle: { x: number; y: number; w: number; texte: string } | null = null;
  if (point && actif !== null) {
    const texte = `${point.nom} · ${Math.round(point.score)} · ${LIBELLES[point.niveau]}`;
    const w = texte.length * 6.4 + 24;
    const centre = GAUCHE + pas * actif + pas / 2;
    bulle = {
      texte,
      w,
      x: Math.min(Math.max(centre - w / 2, 4), largeur - w - 4),
      y: Math.max(2, y(point.score) - 46),
    };
  }

  return (
    <section
      className="ind-panneau ind-entree"
      style={{ "--i": rang } as CSSProperties}
      aria-labelledby="ind-sites"
    >
      <div className="ind-panneau-tete">
        <h2 className="ind-titre" id="ind-sites">
          Sites à surveiller
        </h2>
        <button type="button" className="ind-lien" onClick={() => navigate("/sites")}>
          Voir les sites
        </button>
      </div>

      {n === 0 ? (
        <p className="ind-vide ind-rien">Aucun site à surveiller pour le moment.</p>
      ) : (
        <>
          <div className="ind-sites-defile">
            <svg
              className="ind-sites-svg"
              viewBox={`0 0 ${largeur} ${HAUTEUR}`}
              style={{ minWidth: n > 6 ? largeur : undefined }}
              role="group"
              aria-label="Score de risque par site"
            >
              {/* Axe vertical : graduations et lignes de repère */}
              {GRADUATIONS.map((g) => (
                <g key={g}>
                  <line className="ind-grille" x1={GAUCHE} x2={largeur - DROITE} y1={y(g)} y2={y(g)} />
                  <text className="ind-axe" x={GAUCHE - 8} y={y(g) + 3.5} textAnchor="end">
                    {g}
                  </text>
                </g>
              ))}
              <line className="ind-axe-ligne" x1={GAUCHE} x2={largeur - DROITE} y1={bas} y2={bas} />

              {/* Titres des axes */}
              <text
                className="ind-axe ind-axe-titre"
                transform={`translate(14 ${HAUT + PLAGE / 2}) rotate(-90)`}
                textAnchor="middle"
              >
                Score de risque
              </text>
              <text
                className="ind-axe ind-axe-titre"
                x={GAUCHE + (largeur - GAUCHE - DROITE) / 2}
                y={HAUTEUR - 6}
                textAnchor="middle"
              >
                Sites
              </text>

              {/* Une barre par site */}
              {points.map((p, i) => {
                const x0 = GAUCHE + pas * i;
                const centre = x0 + pas / 2;
                const haut = y(p.score);
                const hauteurBarre = Math.max(bas - haut, 2);
                const classe = [
                  "ind-sbarre",
                  actif === i ? "actif" : "",
                  actif !== null && actif !== i ? "attenue" : "",
                ]
                  .join(" ")
                  .trim();

                return (
                  <g
                    key={p.id}
                    className={classe}
                    style={{ "--k": i } as CSSProperties}
                    tabIndex={0}
                    role="img"
                    aria-label={`${p.nom} : score ${Math.round(p.score)}, niveau ${LIBELLES[p.niveau]}`}
                    onMouseEnter={() => setActif(i)}
                    onMouseLeave={() => setActif(null)}
                    onFocus={() => setActif(i)}
                    onBlur={() => setActif(null)}
                  >
                    {/* Zone de survol sur toute la colonne */}
                    <rect x={x0} y={HAUT} width={pas} height={PLAGE + BAS - 20} fill="transparent" />
                    <rect
                      className={`sb sb-${p.niveau}`}
                      x={centre - largeurBarre / 2}
                      y={haut}
                      width={largeurBarre}
                      height={hauteurBarre}
                      rx={6}
                    />
                    <text className="ind-sbarre-valeur" x={centre} y={haut - 8} textAnchor="middle">
                      {Math.round(p.score)}
                    </text>
                    <text className="ind-axe" x={centre} y={bas + 18} textAnchor="middle">
                      {court(p.nom)}
                    </text>
                  </g>
                );
              })}

              {/* Bulle du site survolé */}
              {bulle && (
                <g pointerEvents="none">
                  <rect className="ind-bulle" x={bulle.x} y={bulle.y} width={bulle.w} height={26} rx={13} />
                  <text
                    className="ind-bulle-texte"
                    x={bulle.x + bulle.w / 2}
                    y={bulle.y + 17}
                    textAnchor="middle"
                  >
                    {bulle.texte}
                  </text>
                </g>
              )}
            </svg>
          </div>

          <ul className="ind-sites-legende">
            {NIVEAUX.map((niv) => (
              <li key={niv}>
                <span className={`ind-point niv-${niv}`} aria-hidden="true" />
                {LIBELLES[niv]}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}