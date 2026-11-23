import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./PanneauIle.css";

export interface Origine {
  x: number;
  y: number;
}

// Le contenu peut recevoir la fonction « fermer » (fermeture animée)
type Contenu = ReactNode | ((fermer: () => void) => ReactNode);

interface Props {
  titre: string;
  sousTitre?: string;
  origine?: Origine | null;
  onFermer: () => void;
  children: Contenu;
}

const DUREE_SORTIE_MS = 200;

// Grand panneau central animé (inspiré de la Dynamic Island) : il grandit
// depuis l'endroit où l'on a cliqué et se referme de la même façon.
export default function PanneauIle({ titre, sousTitre, origine, onFermer, children }: Props) {
  const panneau = useRef<HTMLDivElement>(null);
  const minuteur = useRef<number | null>(null);
  const [sortie, setSortie] = useState(false);

  // Point de départ de l'animation : l'endroit du clic
  useLayoutEffect(() => {
    const el = panneau.current;
    if (el && origine) {
      el.style.transformOrigin = `${origine.x - el.offsetLeft}px ${origine.y - el.offsetTop}px`;
    }
  }, [origine]);

  // Focus sur le panneau à l'ouverture, retour au bouton d'origine à la fermeture
  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    panneau.current?.focus();
    return () => precedent?.focus?.();
  }, []);

  // Pas de défilement de la page derrière le panneau
  useEffect(() => {
    const ancien = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = ancien;
    };
  }, []);

  const fermer = useCallback(() => {
    if (minuteur.current !== null) return;
    setSortie(true);
    minuteur.current = window.setTimeout(onFermer, DUREE_SORTIE_MS);
  }, [onFermer]);

  useEffect(() => {
    return () => {
      if (minuteur.current !== null) window.clearTimeout(minuteur.current);
    };
  }, []);

  // Touche Échap
  useEffect(() => {
    function surTouche(e: KeyboardEvent) {
      if (e.key === "Escape") fermer();
    }
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [fermer]);

  return (
    <div
      className={`ile-voile${sortie ? " sortie" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fermer();
      }}
    >
      <div
        ref={panneau}
        className={`ile-panneau${sortie ? " sortie" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ile-titre"
        tabIndex={-1}
      >
        <header className="ile-entete">
          <div>
            <h2 id="ile-titre">{titre}</h2>
            {sousTitre && <p>{sousTitre}</p>}
          </div>
          <button type="button" className="ile-fermer" onClick={fermer} aria-label="Fermer">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="ile-corps">
          {typeof children === "function" ? children(fermer) : children}
        </div>
      </div>
    </div>
  );
}