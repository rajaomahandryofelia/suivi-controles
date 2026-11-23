import { formaterDate } from "../Missions/outils";

export const jourISO = (decalage = 0) =>
  new Date(Date.now() + decalage * 86400000).toLocaleDateString("sv-SE");

export const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export function heureCourte(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function distanceTexte(metres: number) {
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

export function dureeMinTexte(minutes: number | null) {
  if (minutes === null) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

export function libelleJour(iso: string) {
  if (iso === jourISO()) return "Aujourd'hui";
  if (iso === jourISO(-1)) return "Hier";
  return formaterDate(iso);
}