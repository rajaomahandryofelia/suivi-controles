// Filtres de la pilule
export const SEGMENTS = [
    { valeur: "", libelle: "Tous" },
    { valeur: "EN_COURS", libelle: "En cours" },
    { valeur: "RETABLI", libelle: "Rétablis" },
  ];
  
  // Listes de choix du formulaire (mêmes valeurs que le backend)
  export const SERVICES = [
    { valeur: "RADIO", libelle: "Radio" },
    { valeur: "TELEVISION", libelle: "Télévision" },
    { valeur: "RADIO_TELEVISION", libelle: "Radio et télévision" },
  ];
  
  export const TYPES = [
    { valeur: "INTERRUPTION", libelle: "Interruption de diffusion" },
    { valeur: "PANNE_EMETTEUR", libelle: "Panne d'émetteur" },
    { valeur: "COUPURE_ELECTRIQUE", libelle: "Coupure électrique" },
    { valeur: "DEFAILLANCE_GROUPE", libelle: "Défaillance du groupe électrogène" },
    { valeur: "PROBLEME_ANTENNE", libelle: "Problème d'antenne" },
    { valeur: "AUTRE", libelle: "Autre" },
  ];
  
  export const GRAVITES = [
    { valeur: "MINEURE", libelle: "Mineure" },
    { valeur: "MAJEURE", libelle: "Majeure" },
    { valeur: "CRITIQUE", libelle: "Critique" },
  ];
  
  // « 12 nov. 2026, 14:30 »
  export function formaterDateHeure(iso: string): string {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  
  export function formaterDate(iso: string): string {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  
  export function formaterHeure(iso: string): string {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  
  // 45 → « 45 min » ; 135 → « 2 h 15 » ; 1700 → « 1 j 4 h »
  export function formaterDuree(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const heures = Math.floor(minutes / 60);
    if (heures < 24) {
      const reste = minutes % 60;
      return reste ? `${heures} h ${String(reste).padStart(2, "0")}` : `${heures} h`;
    }
    const jours = Math.floor(heures / 24);
    const heuresRestantes = heures % 24;
    return heuresRestantes ? `${jours} j ${heuresRestantes} h` : `${jours} j`;
  }
  
  // Date et heure actuelles au format du champ « datetime-local » (AAAA-MM-JJTHH:MM)
  export function maintenantLocal(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  
  // Valeur d'un champ « datetime-local » → date ISO attendue par l'API
  export function localVersIso(valeur: string): string {
    return new Date(valeur).toISOString();
  }
  
  interface ErreurApi {
    response?: { data?: unknown };
  }
  
  // Extrait un message lisible d'une erreur de l'API (DRF renvoie un objet champ → messages)
  export function messageErreur(erreur: unknown, defaut: string): string {
    const donnees = (erreur as ErreurApi | null)?.response?.data;
    if (donnees && typeof donnees === "object") {
      const textes = Object.values(donnees as Record<string, unknown>)
        .flat()
        .filter((v): v is string => typeof v === "string");
      if (textes.length > 0) return textes.join(" ");
    }
    return defaut;
  }