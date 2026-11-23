import type { Origine } from "../components/PanneauIle";

// Accepte une liste simple ou une réponse paginée de DRF ({ results: [...] })
export function extraireListe<T>(donnees: unknown): T[] {
  if (Array.isArray(donnees)) return donnees as T[];
  return (donnees as { results?: T[] } | null)?.results ?? [];
}

// « 14 octobre 2026 » : une date seule (AAAA-MM-JJ) est lue en heure locale
// pour éviter tout décalage d'un jour
export function formaterDate(valeur?: string | null): string {
  if (!valeur) return "";
  const date = new Date(valeur.length === 10 ? `${valeur}T00:00:00` : valeur);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// Centre d'un élément : point de départ de l'animation du panneau
export function origineDe(el: Element): Origine {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}