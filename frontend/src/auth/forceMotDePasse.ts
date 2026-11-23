export interface ForceMotDePasse {
    /** 0 = vide, 1 = faible, 2 = moyen, 3 = bon, 4 = très bon */
    score: 0 | 1 | 2 | 3 | 4;
    libelle: string;
    longueurSuffisante: boolean;
    pasUniquementDesChiffres: boolean;
  }
  
  const LIBELLES = ["", "Faible", "Moyen", "Bon", "Très bon"] as const;
  
  /**
   * Évaluation indicative, côté navigateur. Le backend Django reste seul juge
   * (il refuse aussi les mots de passe trop courants, ce qu'on ne peut pas vérifier ici).
   */
  export function evaluerMotDePasse(motDePasse: string): ForceMotDePasse {
    const longueurSuffisante = motDePasse.length >= 8;
    const pasUniquementDesChiffres = motDePasse.length > 0 && !/^\d+$/.test(motDePasse);
  
    let score: ForceMotDePasse["score"] = motDePasse.length > 0 ? 1 : 0;
    if (longueurSuffisante && pasUniquementDesChiffres) {
      score = 2;
      const varietes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) =>
        r.test(motDePasse)
      ).length;
      if (varietes >= 3) score = 3;
      if (varietes >= 3 && motDePasse.length >= 12) score = 4;
    }
  
    return {
      score,
      libelle: LIBELLES[score],
      longueurSuffisante,
      pasUniquementDesChiffres,
    };
  }