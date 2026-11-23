export type Role = "DIRECTEUR" | "CONTROLEUR";

export interface Utilisateur {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: Role | "";
  telephone: string;
  matricule: string | null;
}

export type EtatMaki = "accueil" | "attentif" | "content" | "neutre";

export interface MessageMaki {
  /** Change à chaque nouveau message (permet de répéter un même texte). */
  cle: number;
  texte: string;
  /** Prononcer le message (si la voix est activée). */
  parler: boolean;
  /** Message de fin (ex. connexion réussie) : on le laisse finir même si la page change. */
  final?: boolean;

  /**
   * Annoncer le message aux lecteurs d'écran (par défaut : oui).
   * À mettre à false quand une alerte écrite équivalente est déjà annoncée ailleurs
   * (erreur de formulaire, message de succès), pour éviter la double annonce.
   */
  annoncer?: boolean;
}