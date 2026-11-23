import { useCallback, useEffect, useRef, useState } from "react";

const CLE_PREFERENCE = "maki_voix_active"; // seule donnée stockée : "1" ou "0"

const supporte =
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  typeof SpeechSynthesisUtterance !== "undefined";

function lirePreference(): boolean {
  try {
    return localStorage.getItem(CLE_PREFERENCE) === "1";
  } catch {
    return false;
  }
}

function ecrirePreference(valeur: boolean) {
  try {
    localStorage.setItem(CLE_PREFERENCE, valeur ? "1" : "0");
  } catch {
    /* stockage indisponible : on ignore */
  }
}

function choisirVoixFrancaise(): SpeechSynthesisVoice | null {
  const voix = window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("fr"));
  if (voix.length === 0) return null;
  return voix.find((v) => v.lang.replace("_", "-").toLowerCase() === "fr-fr") ?? voix[0];
}

export function useVoixMaki() {
  const [active, setActive] = useState<boolean>(lirePreference);
  const [parle, setParle] = useState(false);
  const [voixFrancaise, setVoixFrancaise] = useState(true);
  const [erreurAudio, setErreurAudio] = useState(false);

  const activeRef = useRef(active);
  const voixRef = useRef<SpeechSynthesisVoice | null>(null);
  const numeroRef = useRef(0); // identifie la lecture en cours
  const finalRef = useRef(false);
  const vitesseRef = useRef(0.95);

  // Les voix se chargent de façon asynchrone selon les navigateurs
  useEffect(() => {
    if (!supporte) return;
    const synth = window.speechSynthesis;
    function majVoix() {
      voixRef.current = choisirVoixFrancaise();
      setVoixFrancaise(voixRef.current !== null || synth.getVoices().length === 0);
    }
    majVoix();
    synth.addEventListener("voiceschanged", majVoix);
    return () => {
      synth.removeEventListener("voiceschanged", majVoix);
      if (!finalRef.current) synth.cancel();
    };
  }, []);

  const arreter = useCallback(() => {
    numeroRef.current += 1; // invalide les callbacks de la lecture précédente
    if (supporte) window.speechSynthesis.cancel();
    setParle(false);
  }, []);

  const parler = useCallback(
    (texte: string, options?: { final?: boolean }) => {
      if (!supporte || !activeRef.current || !texte) return;
      arreter(); // jamais deux lectures en même temps
      finalRef.current = Boolean(options?.final);

      const enonce = new SpeechSynthesisUtterance(texte);
      enonce.lang = "fr-FR";
      enonce.rate = vitesseRef.current;
      if (voixRef.current) enonce.voice = voixRef.current;

      numeroRef.current += 1;
      const numero = numeroRef.current;
      enonce.onstart = () => {
        if (numeroRef.current !== numero) return;
        setParle(true);
        setErreurAudio(false);
      };
      enonce.onend = () => {
        if (numeroRef.current === numero) setParle(false);
      };
      enonce.onerror = (e) => {
        if (numeroRef.current !== numero) return;
        setParle(false);
        if (e.error !== "interrupted" && e.error !== "canceled") setErreurAudio(true);
      };
      try {
        window.speechSynthesis.speak(enonce);
      } catch {
        setParle(false);
        setErreurAudio(true);
      }
    },
    [arreter]
  );

  const activer = useCallback(() => {
    activeRef.current = true;
    setActive(true);
    ecrirePreference(true);
  }, []);

  const desactiver = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    ecrirePreference(false);
    arreter();
  }, [arreter]);

  const regler = useCallback((vitesse: number) => {
    vitesseRef.current = Math.min(1.5, Math.max(0.6, vitesse));
  }, []);

  return { supporte, active, parle, voixFrancaise, erreurAudio, parler, arreter, activer, desactiver, regler };
}