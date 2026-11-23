import { isAxiosError } from "axios";
import api from "../../api/client";
import type { Utilisateur } from "../../types";
import type { Echeance, Mission } from "./types";

// Les segments de la pilule de filtres
export const SEGMENTS = [
  { valeur: "", libelle: "Toutes" },
  { valeur: "AUJOURDHUI", libelle: "Aujourd'hui" },
  { valeur: "AVENIR", libelle: "À venir" },
  { valeur: "RETARD", libelle: "En retard" },
  { valeur: "EN_COURS", libelle: "En cours" },
  { valeur: "CLOTUREE", libelle: "Clôturées" },
];

// Erreur de localisation (message déjà lisible par l'utilisateur)
export class ErreurPosition extends Error {}

export function messagesErreur(e: unknown, defaut: string): string {
  if (e instanceof ErreurPosition) return e.message;
  if (isAxiosError(e) && e.response?.data) {
    const data = e.response.data;
    if (typeof data === "string") return data.length < 200 ? data : defaut;
    if (typeof data === "object") {
      const donnees = data as Record<string, unknown>;
      if (typeof donnees.detail === "string") return donnees.detail;
      const messages = Object.values(donnees)
        .flat()
        .filter((v): v is string => typeof v === "string")
        .filter(Boolean);
      if (messages.length > 0) return messages.join(" ");
    }
  }
  return defaut;
}

// Position GPS actuelle (démarrage et clôture d'une mission)
export function obtenirPosition(): Promise<{ latitude: string; longitude: string }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new ErreurPosition("Ce navigateur ne permet pas de récupérer votre position."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }),
      () =>
        reject(
          new ErreurPosition(
            "Position GPS indisponible. Autorisez la localisation dans le navigateur, puis réessayez."
          )
        ),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

// Les photos sont servies par le backend : on complète l'adresse si elle est relative
export function urlMedia(chemin: string) {
  if (/^https?:\/\//.test(chemin)) return chemin;
  const base = api.defaults.baseURL ?? "";
  const origine = /^https?:\/\//.test(base) ? new URL(base).origin : window.location.origin;
  return `${origine}${chemin.startsWith("/") ? "" : "/"}${chemin}`;
}

// Couleur du score de conformité : bon (vert), moyen (jaune), élevé (orange), critique (rouge)
export function niveauScore(score: number) {
  if (score >= 85) return "bon";
  if (score >= 70) return "moyen";
  if (score >= 50) return "eleve";
  return "critique";
}

export function nomComplet(u: Utilisateur) {
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.username;
}

export function formaterDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// « 09:00:00 » devient « 09:00 »
export function formaterHeure(heure: string | null) {
  return heure ? heure.slice(0, 5) : "";
}

// Le créneau prévu en version courte : « 09:00 → 12:00 »
export function creneauCourt(m: Mission) {
  if (!m.heure_prevue) return "";
  const debut = formaterHeure(m.heure_prevue);
  if (!m.heure_fin_prevue) return debut;
  const fin = formaterHeure(m.heure_fin_prevue);
  if (!m.date_fin_prevue || m.date_fin_prevue === m.date_prevue) {
    return `${debut} → ${fin}`;
  }
  const jour = new Date(`${m.date_fin_prevue}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
  return `${debut} → ${jour}, ${fin}`;
}

export function formaterDateHeure(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dureeTexte(debut: string, fin: string) {
  const minutes = Math.max(0, Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

export function lienCarte(lat: string, lng: string) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
}

// Où en est la mission par rapport à la date du jour ?
export function echeanceDe(m: Mission, aujourdhui: string): Echeance {
  if (m.statut === "CLOTUREE") return null;
  if (m.statut === "PLANIFIEE" && m.date_prevue < aujourdhui) return "retard";
  if (m.date_prevue === aujourdhui) return "aujourdhui";
  if (m.statut === "PLANIFIEE" && m.date_prevue > aujourdhui) return "avenir";
  return null;
}

export function joursDeRetard(date: string, aujourdhui: string) {
  const a = new Date(`${aujourdhui}T00:00:00`).getTime();
  const b = new Date(`${date}T00:00:00`).getTime();
  return Math.round((a - b) / 86400000);
}

// La mission correspond-elle au segment choisi ?
export function correspond(m: Mission, segment: string, aujourdhui: string) {
  switch (segment) {
    case "":
      return true;
    case "AUJOURDHUI":
      return echeanceDe(m, aujourdhui) === "aujourdhui";
    case "AVENIR":
      return echeanceDe(m, aujourdhui) === "avenir";
    case "RETARD":
      return echeanceDe(m, aujourdhui) === "retard";
    default:
      return m.statut === segment;
  }
}

// Urgence : retards, puis missions en cours, puis aujourd'hui, à venir, clôturées
export function rangDe(m: Mission, aujourdhui: string) {
  const e = echeanceDe(m, aujourdhui);
  if (e === "retard") return 0;
  if (m.statut === "EN_COURS") return 1;
  if (e === "aujourdhui") return 2;
  if (e === "avenir") return 3;
  if (m.statut === "CLOTUREE") return 4;
  return 5;
}