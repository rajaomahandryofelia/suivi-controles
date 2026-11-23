import type { Origine } from "../../components/PanneauIle";
import type { Gravite, MoyenRelance, NonConformite } from "./types";

export const GRAVITES: Record<Gravite, string> = {
  MINEURE: "Mineure",
  MAJEURE: "Majeure",
  CRITIQUE: "Critique",
};

// Comment le Directeur a contacté le partenaire
export const MOYENS: { valeur: MoyenRelance; libelle: string }[] = [
  { valeur: "TELEPHONE", libelle: "Téléphone" },
  { valeur: "EMAIL", libelle: "E-mail" },
  { valeur: "COURRIER", libelle: "Courrier" },
  { valeur: "AUTRE", libelle: "Autre" },
];

/** Date lisible. Une date seule (AAAA-MM-JJ) est lue à minuit, heure locale. */
export function formaterDate(valeur: string | null, court = false): string {
  if (!valeur) return "-";
  const date = new Date(valeur.length === 10 ? `${valeur}T00:00:00` : valeur);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: court ? "short" : "long",
    year: "numeric",
  });
}

/** Date et heure d'un événement du parcours. */
export function formaterDateHeure(valeur: string): string {
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function messageErreur(e: unknown, defaut: string): string {
  const donnees = (e as { response?: { data?: unknown } })?.response?.data;
  if (donnees && typeof donnees === "object") {
    const d = donnees as Record<string, unknown>;
    if (typeof d.detail === "string") return d.detail;
    // Erreurs de champs : « {"moyen": ["..."]} »
    const messages = Object.values(d)
      .flat()
      .filter((v): v is string => typeof v === "string");
    if (messages.length > 0) return messages.join(" ");
  }
  return defaut;
}

/** Centre d'un élément : point de départ de l'animation du panneau. */
export function origineDe(el: Element): Origine {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function retardTexte(jours: number): string {
  return `En retard de ${jours} jour${jours > 1 ? "s" : ""}`;
}

/** Le contrôleur ne « corrige » rien : pour lui, une non-conformité corrigée est à vérifier. */
export function libelleStatut(nc: NonConformite, estDirecteur: boolean): string {
  if (nc.statut === "OUVERTE") return "Ouverte";
  if (nc.statut === "CORRIGEE") return estDirecteur ? "Corrigée" : "À vérifier";
  return "Vérifiée";
}

/** Ordre d'urgence : le Directeur traite d'abord les retards, le contrôleur ce qu'il doit vérifier. */
function rang(nc: NonConformite, estDirecteur: boolean): number {
  if (estDirecteur) {
    if (nc.en_retard) return 0;
    return { OUVERTE: 1, CORRIGEE: 2, VERIFIEE: 3 }[nc.statut];
  }
  return { CORRIGEE: 0, OUVERTE: 1, VERIFIEE: 2 }[nc.statut];
}

/** Toutes les non-conformités sur une seule liste, les plus urgentes en premier. */
export function trierParUrgence(liste: NonConformite[], estDirecteur: boolean): NonConformite[] {
  return [...liste].sort(
    (a, b) =>
      rang(a, estDirecteur) - rang(b, estDirecteur) ||
      a.date_limite_correction.localeCompare(b.date_limite_correction) ||
      a.site_nom.localeCompare(b.site_nom, "fr")
  );
}

/** Échéance ou date de l'étape atteinte, en une phrase courte. */
export function echeanceTexte(nc: NonConformite): string {
  if (nc.statut === "OUVERTE") return formaterDate(nc.date_limite_correction, true);
  if (nc.statut === "CORRIGEE") return `Corrigée le ${formaterDate(nc.date_correction, true)}`;
  return `Vérifiée le ${formaterDate(nc.date_verification, true)}`;
}

export function segmentsPour(estDirecteur: boolean) {
  return [
    { valeur: "", libelle: "Toutes" },
    { valeur: "OUVERTE", libelle: "Ouvertes" },
    { valeur: "RETARD", libelle: "En retard" },
    { valeur: "CORRIGEE", libelle: estDirecteur ? "Corrigées" : "À vérifier" },
    { valeur: "VERIFIEE", libelle: "Vérifiées" },
  ];
}

export function correspond(nc: NonConformite, valeur: string): boolean {
  if (!valeur) return true;
  if (valeur === "RETARD") return nc.en_retard;
  return nc.statut === valeur;
}