import { useEffect, useRef, useState } from "react";

// Un nombre qui « monte » jusqu'à sa valeur (et se met à jour en douceur quand elle change)
export default function Nombre({ valeur }: { valeur: number }) {
  const [affiche, setAffiche] = useState(0);
  const courant = useRef(0);

  useEffect(() => {
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const depart = courant.current;
    if (reduit || depart === valeur) {
      courant.current = valeur;
      setAffiche(valeur);
      return;
    }

    const debut = performance.now();
    const duree = 700;
    let image = 0;
    const pas = (maintenant: number) => {
      const avancement = Math.min(1, (maintenant - debut) / duree);
      const adouci = 1 - Math.pow(1 - avancement, 3);
      const nouvelle = Math.round(depart + (valeur - depart) * adouci);
      courant.current = nouvelle;
      setAffiche(nouvelle);
      if (avancement < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
  }, [valeur]);

  return <>{affiche}</>;
}