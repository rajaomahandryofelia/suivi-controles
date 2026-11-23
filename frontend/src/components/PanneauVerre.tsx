import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Origine } from "./PanneauIle";
import "./PanneauVerre.css";

// Même interface que PanneauIle : on peut remplacer l'un par l'autre sans toucher aux formulaires.
interface Props {
  titre: string;
  sousTitre?: string;
  origine?: Origine; // gardé pour compatibilité, le carré s'ouvre au centre
  onFermer: () => void;
  children: (fermer: () => void) => ReactNode;
}

export default function PanneauVerre({ titre, sousTitre, onFermer, children }: Props) {
  const [sortie, setSortie] = useState(false);
  const minuteur = useRef<number | undefined>(undefined);
  const fenetre = useRef<HTMLDivElement>(null);

  // Ferme avec une courte animation de sortie
  const fermer = useCallback(() => {
    setSortie((deja) => {
      if (!deja) minuteur.current = window.setTimeout(onFermer, 180);
      return true;
    });
  }, [onFermer]);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", touche);
    const defilement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fenetre.current?.focus();
    return () => {
      window.removeEventListener("keydown", touche);
      document.body.style.overflow = defilement;
      window.clearTimeout(minuteur.current);
    };
  }, [fermer]);

  return (
    <div
      className={`gv-fond${sortie ? " sortie" : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && fermer()}
    >
      <div
        ref={fenetre}
        tabIndex={-1}
        className="gv-fenetre"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gv-titre"
      >
        <button type="button" className="gv-fermer" onClick={fermer} aria-label="Fermer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <header className="gv-tete">
          <h2 id="gv-titre">{titre}</h2>
          {sousTitre && <p>{sousTitre}</p>}
        </header>

        <div className="gv-corps">{children(fermer)}</div>
      </div>
    </div>
  );
}