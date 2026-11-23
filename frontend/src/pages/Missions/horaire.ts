import type { Mission } from "./types";

/** Instant de début prévu d'une mission (heure locale), ou null si l'heure n'est pas renseignée. */
export function debutPrevu(m: Mission): Date | null {
  if (!m.heure_prevue) return null;
  const date = new Date(`${m.date_prevue}T${m.heure_prevue.slice(0, 5)}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** La grille ne s'ouvre qu'à partir de l'heure de début prévue. */
export function missionOuverte(m: Mission): boolean {
  const debut = debutPrevu(m);
  return debut === null || new Date() >= debut;
}

/** « Ouverture à 09:00 » ou « Ouverture le 23/10 à 09:00 ». */
export function libelleOuverture(m: Mission): string {
  const debut = debutPrevu(m);
  if (debut === null) return "Démarre à la date prévue";
  const heure = debut.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (debut.toLocaleDateString("sv-SE") === new Date().toLocaleDateString("sv-SE")) {
    return `Ouverture à ${heure}`;
  }
  const jour = debut.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return `Ouverture le ${jour} à ${heure}`;
}