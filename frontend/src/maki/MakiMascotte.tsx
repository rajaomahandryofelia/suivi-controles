import type { EtatMaki } from "./types";

interface Props {
  etat: EtatMaki;
  parle: boolean;
  /** Illustration officielle de Maki (optionnelle). Si fournie, elle remplace le dessin intégré. */
  imageSrc?: string;
}

const CHEMIN_QUEUE = "M104 168 C152 170 160 126 134 98 C120 82 124 62 140 52";

const BOUCHE_FERMEE: Record<EtatMaki, string> = {
  accueil: "M72 84 Q80 90 88 84",
  attentif: "M74 85 Q80 88 86 85",
  content: "M70 83 Q80 94 90 83",
  neutre: "M73 86 L87 86",
};

/**
 * Maki catta dessiné en SVG (provisoire, remplaçable via `imageSrc`).
 * Les animations sont gérées en CSS (Maki.css) : clignement, respiration,
 * salut, bouche qui s'ouvre/se ferme pendant la parole.
 */
export default function MakiMascotte({ etat, parle, imageSrc }: Props) {
  const classes = `maki-mascotte maki--${etat}${parle ? " maki--parle" : ""}`;

  if (imageSrc) {
    return (
      <div className={classes}>
        <img className="maki-image" src={imageSrc} alt="Maki, assistant virtuel" />
      </div>
    );
  }

  const salue = etat === "accueil" || etat === "content";

  return (
    <div className={classes}>
      <svg viewBox="0 0 160 200" role="img" aria-label="Maki, assistant virtuel">
        <defs>
          <linearGradient id="maki-gris" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b3aea9" />
            <stop offset="1" stopColor="#8a8681" />
          </linearGradient>
          <linearGradient id="maki-blanc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#ece9e5" />
          </linearGradient>
          <radialGradient id="maki-iris" cx="50%" cy="40%" r="60%">
            <stop offset="0" stopColor="#ffd25a" />
            <stop offset="1" stopColor="#e08a12" />
          </radialGradient>
        </defs>

        <ellipse cx="80" cy="190" rx="46" ry="6" fill="#000" opacity="0.12" />

        {/* Queue annelée */}
        <g fill="none">
          <path d={CHEMIN_QUEUE} stroke="#262626" strokeWidth="16" strokeLinecap="round" />
          <path d={CHEMIN_QUEUE} stroke="#f6f4f1" strokeWidth="16" strokeDasharray="9 9" strokeDashoffset="2" />
        </g>

        <g className="maki-corps">
          {/* Pieds, corps, ventre */}
          <ellipse cx="60" cy="184" rx="15" ry="7" fill="#5f5b57" />
          <ellipse cx="100" cy="184" rx="15" ry="7" fill="#5f5b57" />
          <path
            d="M44 150 C40 118 56 104 80 104 C104 104 120 118 116 150 C114 172 100 184 80 184 C60 184 46 172 44 150 Z"
            fill="url(#maki-gris)"
          />
          <ellipse cx="80" cy="152" rx="22" ry="30" fill="url(#maki-blanc)" />

          {/* Bras gauche */}
          <path d="M52 118 C40 130 38 152 46 166 C52 170 58 164 58 156 C58 144 58 132 60 122 Z" fill="url(#maki-gris)" />
          <ellipse cx="50" cy="168" rx="6.5" ry="5" fill="#3a3734" />

          {/* Bras droit (salue) */}
          <g className={salue ? "maki-bras maki-bras--salut" : "maki-bras"}>
            <path d="M108 118 C120 130 122 152 114 166 C108 170 102 164 102 156 C102 144 102 132 100 122 Z" fill="url(#maki-gris)" />
            <ellipse cx="110" cy="168" rx="6.5" ry="5" fill="#3a3734" />
          </g>

          {/* Foulard rouge et vert */}
          <path d="M48 104 Q80 126 112 104 L114 120 Q80 144 46 120 Z" fill="#ED1C24" />
          <path d="M47 112 Q80 134 113 112" fill="none" stroke="#ffffff" strokeWidth="2.4" opacity="0.9" />
          <path d="M46.5 118 Q80 141 113.5 118" fill="none" stroke="#007A3D" strokeWidth="3.2" />
          <path d="M92 128 L110 134 L104 160 L88 152 Z" fill="#ED1C24" />
          <path d="M90 142 L106 148" stroke="#ffffff" strokeWidth="2.2" />
          <path d="M89.5 148 L105 154" stroke="#007A3D" strokeWidth="3" />
          <circle cx="93" cy="130" r="5.5" fill="#c9141b" />

          {/* Tête */}
          <g className="maki-tete">
            <circle cx="44" cy="42" r="11" fill="url(#maki-gris)" />
            <circle cx="44" cy="43" r="6" fill="#f3e6e2" />
            <circle cx="116" cy="42" r="11" fill="url(#maki-gris)" />
            <circle cx="116" cy="43" r="6" fill="#f3e6e2" />
            <ellipse cx="80" cy="66" rx="37" ry="33" fill="url(#maki-blanc)" />
            <path
              d="M43 56 C42 30 62 24 80 24 C98 24 118 30 117 56 C108 44 94 42 80 42 C66 42 52 44 43 56 Z"
              fill="url(#maki-gris)"
            />

            {/* Masques noirs */}
            <path d="M52 62 C52 52 60 50 68 54 C74 58 74 66 70 72 C64 78 54 74 52 62 Z" fill="#1f1f1f" />
            <path d="M108 62 C108 52 100 50 92 54 C86 58 86 66 90 72 C96 78 106 74 108 62 Z" fill="#1f1f1f" />

            {/* Yeux (clignement) */}
            <g className="maki-oeil">
              <circle cx="62" cy="63" r="6.2" fill="url(#maki-iris)" />
              <circle cx="62" cy="63" r="3.1" fill="#111" />
              <circle cx="64" cy="61" r="1.4" fill="#fff" />
            </g>
            <g className="maki-oeil">
              <circle cx="98" cy="63" r="6.2" fill="url(#maki-iris)" />
              <circle cx="98" cy="63" r="3.1" fill="#111" />
              <circle cx="100" cy="61" r="1.4" fill="#fff" />
            </g>

            {etat === "attentif" && (
              <g stroke="#1f1f1f" strokeWidth="2.6" strokeLinecap="round" fill="none">
                <path d="M52 46 L68 43" />
                <path d="M92 43 L108 46" />
              </g>
            )}
            {etat === "content" && (
              <g fill="#ED1C24" opacity="0.16">
                <ellipse cx="52" cy="80" rx="6" ry="4" />
                <ellipse cx="108" cy="80" rx="6" ry="4" />
              </g>
            )}

            {/* Museau, nez et bouche */}
            <path d="M71 76 C71 70 89 70 89 76 C89 84 80 88 80 88 C80 88 71 84 71 76 Z" fill="#f1eeea" />
            <path d="M75.5 74 C75.5 71.5 84.5 71.5 84.5 74 C84.5 77 80 79 80 79 C80 79 75.5 77 75.5 74 Z" fill="#161616" />
            <path d="M80 79 L80 83" stroke="#161616" strokeWidth="1.4" />
            <path
              className="maki-bouche-fermee"
              d={BOUCHE_FERMEE[etat]}
              fill="none"
              stroke="#161616"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <ellipse className="maki-bouche-ouverte" cx="80" cy="87" rx="6" ry="4.8" fill="#7a1f1f" />
          </g>
        </g>
      </svg>
    </div>
  );
}