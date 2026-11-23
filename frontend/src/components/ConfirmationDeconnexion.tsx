import { useEffect, useRef } from "react";
import type { KeyboardEvent as EvenementClavier } from "react";
import "./ConfirmationDeconnexion.css";

interface Props {
  /** Appelée quand l'utilisateur répond « Oui, me déconnecter ». */
  onConfirmer: () => void;
  /** Appelée pour « Non », la touche Échap ou un clic à côté de la fenêtre. */
  onAnnuler: () => void;
}

function IconeDeconnexion() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/**
 * Fenêtre de confirmation avant la déconnexion.
 * À afficher conditionnellement : {ouvert && <ConfirmationDeconnexion … />}
 * Accessible : rôle « alertdialog », focus sur « Non » (choix sans conséquence),
 * navigation au clavier gardée dans la fenêtre, Échap pour annuler,
 * et le focus revient sur le bouton d'origine à la fermeture.
 */
export default function ConfirmationDeconnexion({ onConfirmer, onAnnuler }: Props) {
  const boite = useRef<HTMLDivElement>(null);
  const boutonNon = useRef<HTMLButtonElement>(null);

  // Garde toujours la dernière fonction reçue sans relancer l'effet ci-dessous
  const derniereAnnulation = useRef(onAnnuler);
  useEffect(() => {
    derniereAnnulation.current = onAnnuler;
  });

  useEffect(() => {
    const ancienFocus = document.activeElement as HTMLElement | null;
    boutonNon.current?.focus();

    // Empêche le défilement de la page derrière la fenêtre
    const ancienDefilement = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function toucheEchap(e: KeyboardEvent) {
      if (e.key === "Escape") derniereAnnulation.current();
    }
    document.addEventListener("keydown", toucheEchap);

    return () => {
      document.removeEventListener("keydown", toucheEchap);
      document.body.style.overflow = ancienDefilement;
      ancienFocus?.focus?.();
    };
  }, []);

  // Garde la navigation au clavier (Tab) à l'intérieur de la fenêtre
  function pieger(e: EvenementClavier<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const boutons = boite.current?.querySelectorAll<HTMLElement>("button");
    if (!boutons || boutons.length === 0) return;
    const premier = boutons[0];
    const dernier = boutons[boutons.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  }

  return (
    <div
      className="deco-fond"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onAnnuler();
      }}
    >
      <div
        className="deco-fenetre"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="deco-titre"
        aria-describedby="deco-texte"
        ref={boite}
        onKeyDown={pieger}
      >
        <div className="deco-icone">
          <IconeDeconnexion />
        </div>
        <h2 id="deco-titre">Se déconnecter ?</h2>
        <p id="deco-texte">Êtes-vous sûr de vouloir vous déconnecter ?</p>

        <div className="deco-actions">
          <button type="button" className="deco-bouton non" ref={boutonNon} onClick={onAnnuler}>
            Non
          </button>
          <button type="button" className="deco-bouton oui" onClick={onConfirmer}>
            Oui, me déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}