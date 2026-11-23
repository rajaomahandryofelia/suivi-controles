import type { Utilisateur } from "../../types";
import { LIBELLES } from "./constantes";

export function nomAffiche(u: Utilisateur) {
  const nom = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  return nom || u.username;
}

export function initiales(u: Utilisateur) {
  const a = (u.first_name || u.username || "?").charAt(0);
  const b = (u.last_name || "").charAt(0);
  return `${a}${b}`;
}

export function libelle(cle: string) {
  if (LIBELLES[cle]) return LIBELLES[cle];
  const texte = cle.replace(/_/g, " ");
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export function classeNiveau(cle: string) {
  const k = cle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (k === "FAIBLE") return "n-faible";
  if (k === "MOYEN") return "n-moyen";
  if (k === "ELEVE") return "n-eleve";
  if (k === "CRITIQUE") return "n-critique";
  return "";
}

export function texteValeur(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function texteElement(element: unknown): string {
  if (element && typeof element === "object") {
    return Object.values(element as Record<string, unknown>)
      .filter((v) => typeof v === "string" || typeof v === "number")
      .join(" · ");
  }
  return texteValeur(element);
}

// Texte affiché dans la fiche ; renvoie null si la valeur est vide ou non affichable
export function formaterFiche(cle: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (/date|_at$|login/.test(cle) && !Number.isNaN(Date.parse(v))) {
      return new Date(v).toLocaleString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return v;
  }
  if (Array.isArray(v)) {
    const simples = v.filter((x) => typeof x === "string" || typeof x === "number");
    return simples.length > 0 ? simples.join(", ") : null;
  }
  return null;
}