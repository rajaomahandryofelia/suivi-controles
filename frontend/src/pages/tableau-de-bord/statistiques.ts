// La forme des chiffres renvoyés par /api/suivi/tableau-de-bord/ (un jeu par rôle)

export type NiveauRisque = "FAIBLE" | "MOYEN" | "ELEVE" | "CRITIQUE" | "SANS_SCORE";

export interface CompteursMissions {
  planifiees: number;
  en_cours: number;
  cloturees: number;
}

export interface SiteARisque {
  id: number;
  nom: string;
  valeur: string | number; // le score arrive parfois sous forme de texte (« 66.67 »)
  niveau: Exclude<NiveauRisque, "SANS_SCORE">;
}

// Un mois de la courbe de conformité ; valeur vide = aucun rapport validé ce mois-là
export interface PointTendance {
  mois: string; // « 2026-10 »
  valeur: number | null;
}

export interface StatsDirecteur {
  role: "DIRECTEUR";
  missions: CompteursMissions;
  rapports_en_attente: number;
  non_conformites: { a_traiter: number; en_retard: number };
  sites_par_niveau: Record<NiveauRisque, number>;
  sites_a_risque: SiteARisque[];
  tendance_conformite: PointTendance[];
  alertes_non_lues: number;
}

export interface MissionDuJour {
  id: number;
  site_nom: string;
  site_localisation?: string;
  heure_prevue?: string | null;
  statut: "PLANIFIEE" | "EN_COURS" | "CLOTUREE";
  statut_libelle?: string;
}

export interface StatsControleur {
  role: "CONTROLEUR";
  missions: CompteursMissions;
  missions_du_jour: MissionDuJour[];
  rapports_a_corriger: number;
  non_conformites_a_verifier: number;
  notifications_non_lues: number;
}

export type Statistiques = StatsDirecteur | StatsControleur;

// ---------- Normalisation : garantit que tous les champs existent ----------

type Objet = Record<string, unknown>;

const estObjet = (v: unknown): v is Objet =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const nombre = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const tableau = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function missions(v: unknown): CompteursMissions {
  const m = estObjet(v) ? v : {};
  return {
    planifiees: nombre(m.planifiees),
    en_cours: nombre(m.en_cours),
    cloturees: nombre(m.cloturees),
  };
}

export function normaliserStats(brut: unknown): Statistiques | null {
  if (!estObjet(brut)) return null;

  if (brut.role === "DIRECTEUR") {
    const nc = estObjet(brut.non_conformites) ? brut.non_conformites : {};
    const niveaux = estObjet(brut.sites_par_niveau) ? brut.sites_par_niveau : {};
    return {
      role: "DIRECTEUR",
      missions: missions(brut.missions),
      rapports_en_attente: nombre(brut.rapports_en_attente),
      non_conformites: {
        a_traiter: nombre(nc.a_traiter),
        en_retard: nombre(nc.en_retard),
      },
      sites_par_niveau: {
        FAIBLE: nombre(niveaux.FAIBLE),
        MOYEN: nombre(niveaux.MOYEN),
        ELEVE: nombre(niveaux.ELEVE),
        CRITIQUE: nombre(niveaux.CRITIQUE),
        SANS_SCORE: nombre(niveaux.SANS_SCORE),
      },
      sites_a_risque: tableau<SiteARisque>(brut.sites_a_risque),
      tendance_conformite: tableau<PointTendance>(brut.tendance_conformite),
      alertes_non_lues: nombre(brut.alertes_non_lues),
    };
  }

  if (brut.role === "CONTROLEUR") {
    return {
      role: "CONTROLEUR",
      missions: missions(brut.missions),
      missions_du_jour: tableau<MissionDuJour>(brut.missions_du_jour),
      rapports_a_corriger: nombre(brut.rapports_a_corriger),
      non_conformites_a_verifier: nombre(brut.non_conformites_a_verifier),
      notifications_non_lues: nombre(brut.notifications_non_lues),
    };
  }

  return null; // réponse inattendue (HTML, rôle inconnu…)
}

// Le chiffre à afficher au-dessus de la courbe : dernière valeur et écart avec la précédente
export function resumeTendance(
  points: PointTendance[] | undefined | null
): { valeur: number; variation: number | null } | null {
  const valeurs = (points ?? [])
    .map((p) => p.valeur)
    .filter((v): v is number => v !== null);
  if (valeurs.length === 0) return null;
  const dernier = valeurs[valeurs.length - 1];
  const variation =
    valeurs.length > 1 ? Math.round((dernier - valeurs[valeurs.length - 2]) * 10) / 10 : null;
  return { valeur: dernier, variation };
}