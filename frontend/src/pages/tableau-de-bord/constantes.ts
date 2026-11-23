// Constantes du tableau de bord (libellés, champs affichés dans la fiche, indicateurs d'attention)

export const LIBELLES: Record<string, string> = {
    missions: "Missions",
    rapports_en_attente: "Rapports à valider",
    non_conformites: "Non-conformités",
    sites_par_niveau: "Sites par niveau de risque",
    sites_a_risque: "Sites les plus à risque",
    alertes_non_lues: "Alertes non lues",
    missions_du_jour: "Missions du jour",
    notifications_non_lues: "Notifications non lues",
  };
  
  // Indicateurs qui passent en rouge dès qu'ils sont supérieurs à zéro
  export const ATTENTION = new Set(["rapports_en_attente", "alertes_non_lues", "notifications_non_lues"]);
  
  // Fiche d'une demande : champs principaux, dans l'ordre d'affichage
  export const CHAMPS_PRINCIPAUX: { cle: string; libelle: string }[] = [
    { cle: "first_name", libelle: "Prénom" },
    { cle: "last_name", libelle: "Nom" },
    { cle: "matricule", libelle: "Matricule" },
    { cle: "telephone", libelle: "Téléphone" },
    { cle: "email", libelle: "Adresse e-mail" },
    { cle: "username", libelle: "Identifiant de connexion" },
  ];
  
  // Libellés lisibles pour les autres champs que le serveur peut renvoyer
  export const LIBELLES_FICHE: Record<string, string> = {
    date_joined: "Demande envoyée le",
    role: "Rôle",
    is_active: "Compte actif",
    last_login: "Dernière connexion",
  };
  
  // Champs jamais affichés dans la fiche
  export const CHAMPS_MASQUES = new Set([
    "id",
    "password",
    "is_staff",
    "is_superuser",
    "groups",
    "user_permissions",
    ...CHAMPS_PRINCIPAUX.map((c) => c.cle),
  ]);