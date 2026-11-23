import { isAxiosError } from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client";
import type { Mission } from "../pages/Missions/types";
import type { EtatSuivi } from "./contexte";

// Réglages du suivi
const DISTANCE_MIN_M = 30; // un point tous les 30 m…
const INTERVALLE_POINT_MS = 60000; // …ou au moins toutes les 60 s
const INTERVALLE_ENVOI_MS = 60000; // envoi par lots toutes les minutes
const INTERVALLE_MISSIONS_MS = 30000; // recherche de la mission en cours
const SILENCE_GPS_MS = 120000; // sans signal depuis 2 min : position indisponible
const LOT_MAX = 50; // limite du backend
const FILE_MAX = 500; // limite de la file locale (les plus anciens sont supprimés)
const PREFIXE = "suivi_trajet_file_";

interface Point {
  latitude: number;
  longitude: number;
  precision_m: number | null;
  releve_le: string;
}

type EtatGps = "recherche" | "ok" | "refuse" | "indisponible";

// ---------- File d'attente locale (une par mission) ----------

const cle = (id: number) => `${PREFIXE}${id}`;

function lireFile(id: number): Point[] {
  try {
    const brut = localStorage.getItem(cle(id));
    const valeur: unknown = brut ? JSON.parse(brut) : [];
    return Array.isArray(valeur) ? (valeur as Point[]) : [];
  } catch {
    return [];
  }
}

function ecrireFile(id: number, points: Point[]) {
  try {
    if (points.length === 0) localStorage.removeItem(cle(id));
    else localStorage.setItem(cle(id), JSON.stringify(points.slice(-FILE_MAX)));
  } catch {
    // stockage indisponible ou plein : le suivi continue sans file
  }
}

function idsEnAttente(): number[] {
  const ids: number[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const nom = localStorage.key(i);
      if (nom && nom.startsWith(PREFIXE)) {
        const id = Number(nom.slice(PREFIXE.length));
        if (Number.isInteger(id)) ids.push(id);
      }
    }
  } catch {
    // stockage indisponible
  }
  return ids;
}

// Distance en mètres entre deux positions
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useSuiviTrajet(actif: boolean): EtatSuivi {
  const [missionId, setMissionId] = useState<number | null>(null);
  const [gps, setGps] = useState<EtatGps>("recherche");
  const [enAttente, setEnAttente] = useState(0);
  const [reseauOk, setReseauOk] = useState(true);

  const missionRef = useRef<number | null>(null);
  const enVol = useRef<Set<number>>(new Set());

  // Envoie la file d'une mission, lot par lot, jusqu'à ce qu'elle soit vide
  const envoyer = useCallback(async (id: number) => {
    if (enVol.current.has(id)) return;
    enVol.current.add(id);
    try {
      for (;;) {
        const file = lireFile(id);
        if (file.length === 0) break;
        const lot = file.slice(0, LOT_MAX);
        try {
          await api.post(`/controles/missions/${id}/trajet/`, { points: lot });
        } catch (e) {
          const statut = isAxiosError(e) ? e.response?.status : undefined;
          if (statut === 400 || statut === 403 || statut === 404) {
            // Refus définitif du serveur : on ne boucle pas
            ecrireFile(id, []);
          } else if (id === missionRef.current) {
            setReseauOk(false);
          }
          break;
        }
        ecrireFile(id, lireFile(id).slice(lot.length));
        if (id === missionRef.current) setReseauOk(true);
      }
    } finally {
      enVol.current.delete(id);
      if (id === missionRef.current) setEnAttente(lireFile(id).length);
    }
  }, []);

  // 1. Quelle est la mission en cours ? (et envoi des files des missions terminées)
  useEffect(() => {
    if (!actif) {
      missionRef.current = null;
      setMissionId(null);
      return;
    }
    let annule = false;

    const charger = async () => {
      try {
        const r = await api.get<Mission[]>("/controles/missions/");
        if (annule) return;
        const enCours = r.data.find((m) => m.statut === "EN_COURS");
        const nouveau = enCours ? enCours.id : null;
        missionRef.current = nouveau;
        setMissionId(nouveau);
        // Les points restants d'une mission terminée (ou d'une session précédente) partent ici
        for (const id of idsEnAttente()) {
          if (id !== nouveau) void envoyer(id);
        }
      } catch {
        // réseau coupé : on garde la dernière mission connue
      }
    };

    const surVisibilite = () => {
      if (document.visibilityState === "visible") void charger();
    };

    void charger();
    const minuteur = window.setInterval(surVisibilite, INTERVALLE_MISSIONS_MS);
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      annule = true;
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [actif, envoyer]);

  // 2. Nouvelle mission : on repart de sa file locale
  useEffect(() => {
    setEnAttente(missionId === null ? 0 : lireFile(missionId).length);
    setReseauOk(true);
  }, [missionId]);

  // 3. Relevé des positions
  useEffect(() => {
    if (!actif || missionId === null) return;
    const id = missionId;

    if (!navigator.geolocation) {
      setGps("indisponible");
      return;
    }

    setGps("recherche");
    const debut = Date.now();
    let dernierFix = 0;
    let dernierPoint: { lat: number; lng: number; t: number } | null = null;

    const traiter = (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const t = pos.timestamp || Date.now();
      dernierFix = Date.now();
      setGps("ok");

      if (dernierPoint) {
        const ecoule = t - dernierPoint.t;
        if (ecoule <= 0) return;
        const distance = distanceM(dernierPoint.lat, dernierPoint.lng, lat, lng);
        if (distance < DISTANCE_MIN_M && ecoule < INTERVALLE_POINT_MS) return;
      }
      dernierPoint = { lat, lng, t };

      const file = [
        ...lireFile(id),
        {
          latitude: lat,
          longitude: lng,
          precision_m: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          releve_le: new Date(t).toISOString(),
        },
      ];
      ecrireFile(id, file);
      setEnAttente(Math.min(file.length, FILE_MAX));
    };

    const surErreur = (erreur: GeolocationPositionError) => {
      if (erreur.code === erreur.PERMISSION_DENIED) setGps("refuse");
    };

    const surveillance = navigator.geolocation.watchPosition(traiter, surErreur, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 30000,
    });

    // Immobile, le navigateur n'envoie pas toujours de nouvelle position : on en demande une
    const minuteur = window.setInterval(() => {
      const maintenant = Date.now();
      if (maintenant - Math.max(dernierFix, debut) > SILENCE_GPS_MS) {
        setGps((g) => (g === "refuse" ? g : "indisponible"));
      }
      if (dernierPoint === null || maintenant - dernierPoint.t > INTERVALLE_POINT_MS) {
        navigator.geolocation.getCurrentPosition(traiter, surErreur, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        });
      }
    }, 15000);

    return () => {
      navigator.geolocation.clearWatch(surveillance);
      window.clearInterval(minuteur);
    };
  }, [actif, missionId]);

  // 4. Envoi par lots, et au retour du réseau
  useEffect(() => {
    if (!actif || missionId === null) return;
    const id = missionId;

    const surReseau = () => {
      setReseauOk(true);
      void envoyer(id);
    };
    const surCoupure = () => setReseauOk(false);
    const surVisibilite = () => {
      if (document.visibilityState === "visible") void envoyer(id);
    };

    void envoyer(id);
    const minuteur = window.setInterval(() => void envoyer(id), INTERVALLE_ENVOI_MS);
    window.addEventListener("online", surReseau);
    window.addEventListener("offline", surCoupure);
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      window.clearInterval(minuteur);
      window.removeEventListener("online", surReseau);
      window.removeEventListener("offline", surCoupure);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [actif, missionId, envoyer]);

  // 5. Écran maintenu allumé pendant la mission
  useEffect(() => {
    if (!actif || missionId === null || !("wakeLock" in navigator)) return;
    let verrou: WakeLockSentinel | null = null;
    let arrete = false;

    const demander = async () => {
      if (verrou && !verrou.released) return;
      try {
        const obtenu = await navigator.wakeLock.request("screen");
        if (arrete) {
          await obtenu.release();
          return;
        }
        verrou = obtenu;
      } catch {
        // refusé (batterie faible, onglet masqué…) : le suivi continue sans
      }
    };
    const surVisibilite = () => {
      if (document.visibilityState === "visible") void demander();
    };

    void demander();
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      arrete = true;
      document.removeEventListener("visibilitychange", surVisibilite);
      if (verrou) verrou.release().catch(() => undefined);
    };
  }, [actif, missionId]);

  return useMemo<EtatSuivi>(() => {
    if (!actif || missionId === null) return { etat: "inactif", enAttente: 0, detail: "" };
    if (gps === "refuse") {
      return {
        etat: "indisponible",
        enAttente,
        detail: "La localisation est refusée. Autorisez-la dans le navigateur pour enregistrer votre trajet.",
      };
    }
    if (gps === "indisponible") {
      return {
        etat: "indisponible",
        enAttente,
        detail: "Signal GPS perdu. Vérifiez que la localisation est activée, ou sortez à l'air libre.",
      };
    }
    if (gps === "recherche") return { etat: "recherche", enAttente, detail: "" };
    if (!reseauOk && enAttente > 0) return { etat: "attente", enAttente, detail: "" };
    return { etat: "ok", enAttente, detail: "" };
  }, [actif, missionId, gps, enAttente, reseauOk]);
}