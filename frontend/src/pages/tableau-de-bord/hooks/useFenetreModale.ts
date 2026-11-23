import { useEffect, useRef } from "react";
import type { KeyboardEvent as EvenementClavier } from "react";

/**
 * Comportement d'une fenêtre modale accessible :
 * focus à l'ouverture (et restitué à la fermeture), Échap pour fermer,
 * page derrière bloquée, Tab gardé à l'intérieur.
 */
export function useFenetreModale(onFermer: () => void) {
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ancienFocus = document.activeElement as HTMLElement | null;
    boite.current?.focus();

    // Empêche le défilement de la page derrière la fenêtre
    const ancienDefilement = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function toucheEchap(e: KeyboardEvent) {
      if (e.key === "Escape") onFermer();
    }
    document.addEventListener("keydown", toucheEchap);

    return () => {
      document.removeEventListener("keydown", toucheEchap);
      document.body.style.overflow = ancienDefilement;
      ancienFocus?.focus?.();
    };
  }, [onFermer]);

  // Garde la navigation au clavier à l'intérieur de la fenêtre
  function pieger(e: EvenementClavier<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const focalisables = boite.current?.querySelectorAll<HTMLElement>("button:not(:disabled)");
    if (!focalisables || focalisables.length === 0) return;
    const premier = focalisables[0];
    const dernier = focalisables[focalisables.length - 1];
    const actif = document.activeElement;
    if (e.shiftKey && (actif === premier || actif === boite.current)) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && actif === dernier) {
      e.preventDefault();
      premier.focus();
    }
  }

  return { boite, pieger };
}