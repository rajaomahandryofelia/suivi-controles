import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";

/** Détecte l'état de la touche Verr. Maj. pendant la saisie d'un mot de passe. */
export function useVerrMaj() {
  const [verrMaj, setVerrMaj] = useState(false);

  const surClavier = useCallback((evenement: KeyboardEvent<HTMLInputElement>) => {
    if (typeof evenement.getModifierState === "function") {
      setVerrMaj(evenement.getModifierState("CapsLock"));
    }
  }, []);

  const masquer = useCallback(() => setVerrMaj(false), []);

  return { verrMaj, surClavier, masquer };
}