import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { BriefMaki, NiveauPoint } from "./useBriefMaki";

interface Props {
  brief: BriefMaki;
  onMasquer: () => void;
  onNaviguer: () => void;
}

const ICONES: Record<NiveauPoint, ReactNode> = {
  // Point d'exclamation : à traiter en priorité
  alerte: (
    <>
      <path d="M12 8v5" />
      <path d="M12 16.5v.01" />
    </>
  ),
  // Horloge : à surveiller
  attention: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2" />
    </>
  ),
  // Calendrier : simple information
  info: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
};

function Pastille({ niveau }: { niveau: NiveauPoint }) {
  return (
    <span className="mk-brief-icone" aria-hidden="true">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICONES[niveau]}
      </svg>
    </span>
  );
}

/** Le brief du jour : ce qui compte aujourd'hui, une ligne par sujet, avec un lien vers la page. */
export default function CarteBriefMaki({ brief, onMasquer, onNaviguer }: Props) {
  return (
    <section className="mk-brief" aria-label="Brief du jour">
      <header className="mk-brief-entete">
        <div>
          <span className="mk-brief-date">{brief.date}</span>
          <strong>{brief.salutation}</strong>
        </div>
        <button type="button" className="mk-brief-masquer" onClick={onMasquer}>
          Masquer
        </button>
      </header>

      {brief.points.length === 0 ? (
        <p className="mk-brief-vide">Rien à signaler aujourd'hui. Bonne journée !</p>
      ) : (
        <ul className="mk-brief-points">
          {brief.points.map((p, i) => {
            const style = { "--i": i } as CSSProperties;
            const contenu = (
              <>
                <Pastille niveau={p.niveau} />
                <span className="mk-brief-texte">{p.texte}</span>
                {p.lien && (
                  <span className="mk-brief-fleche" aria-hidden="true">
                    ›
                  </span>
                )}
              </>
            );
            return (
              <li key={i} className={p.niveau} style={style}>
                {p.lien ? (
                  <Link to={p.lien} onClick={onNaviguer}>
                    {contenu}
                  </Link>
                ) : (
                  <div className="mk-brief-ligne">{contenu}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}