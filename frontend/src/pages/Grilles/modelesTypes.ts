import type { DonneesCritere } from "./types";

export interface ModeleType {
  cle: string;
  titre: string;
  description: string;
  // Type de site conseillé pour ce modèle
  typeSite: { libelle: string; description: string; motCle: string };
  criteres: DonneesCritere[];
}

// Critère « conforme / non conforme »
function oui(libelle: string, ponderation: number, obligatoire = true): DonneesCritere {
  return {
    libelle,
    type_reponse: "OUI_NON",
    ponderation: String(ponderation),
    est_obligatoire: obligatoire,
  };
}

// Note chiffrée
function note(libelle: string, ponderation: number, obligatoire = true): DonneesCritere {
  return {
    libelle,
    type_reponse: "NOTE",
    ponderation: String(ponderation),
    est_obligatoire: obligatoire,
  };
}

// Observation libre (n'est pas obligatoire)
function texte(libelle: string): DonneesCritere {
  return { libelle, type_reponse: "TEXTE", ponderation: "0", est_obligatoire: false };
}

// Minuscules, sans accents : pour comparer des libellés
function simplifier(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Cherche, parmi les types existants, celui qui correspond au type conseillé du modèle
export function trouverType<T extends { id: number; libelle: string }>(
  types: T[],
  modele: ModeleType
): T | undefined {
  const mot = simplifier(modele.typeSite.motCle);
  return types.find((t) => simplifier(t.libelle).includes(mot));
}

// Modèles de départ, à valider avec les procédures de la DPC avant usage
export const MODELES_TYPES: ModeleType[] = [
  {
    cle: "pylone",
    titre: "Contrôle d'un pylône",
    description: "Structure, balisage d'obstacle, mise à la terre et sécurité de l'enceinte",
    typeSite: {
      libelle: "Pylône / tour d'antenne",
      description: "Structure porteuse d'antennes de diffusion",
      motCle: "pylone",
    },
    criteres: [
      oui("Structure du pylône sans corrosion ni déformation (cornières, boulonnerie)", 3),
      oui("Haubans en place, tendus et sans rupture de brins", 3),
      oui("Balisage lumineux d'obstacle en état de fonctionnement", 3),
      oui("Bandes de peinture de signalisation visibles", 1),
      oui("Mise à la terre et parafoudre contrôlés", 3),
      oui("Câbles et feeders correctement fixés, sans dégradation", 2),
      oui("Clôture et portail de l'enceinte en bon état, fermés à clé", 2),
      oui("Panneaux de danger et consignes d'accès affichés", 1),
      oui("Abords dégagés de toute végétation gênante", 1, false),
      texte("Observations de l'inspecteur"),
    ],
  },
  {
    cle: "emetteur",
    titre: "Contrôle d'une station d'émission",
    description: "Alimentation, secours, climatisation, supervision et sécurité incendie",
    typeSite: {
      libelle: "Station d'émission",
      description: "Site d'émission radio ou télévision avec salle technique",
      motCle: "emission",
    },
    criteres: [
      oui("Alimentation secteur et protections électriques en bon état", 3),
      oui("Groupe électrogène : niveau de carburant et démarrage d'essai", 3),
      oui("Onduleur et batteries en bon état, autonomie suffisante", 2),
      oui("Salle technique ventilée ou climatisée, température normale", 2),
      oui("Alarmes et supervision à distance fonctionnelles", 2),
      oui("Extincteurs présents, accessibles et à date de validité", 3),
      oui("Détection incendie en état de fonctionnement", 2),
      oui("Mise à la terre et parafoudre contrôlés", 3),
      oui("Registre de maintenance tenu à jour", 1),
      oui("Salle technique propre et rangée", 1, false),
      note("État général de l'installation (de 0 à 10)", 2),
      texte("Observations de l'inspecteur"),
    ],
  },
  {
    cle: "relais",
    titre: "Contrôle d'un relais isolé",
    description: "Site sans présence permanente : énergie, antenne, clôture et sécurité",
    typeSite: {
      libelle: "Relais isolé",
      description: "Réémetteur sans présence permanente de personnel",
      motCle: "relais",
    },
    criteres: [
      oui("Source d'énergie (secteur, solaire ou groupe) opérationnelle", 3),
      oui("Panneaux solaires et régulateur en bon état", 2, false),
      oui("Batteries en bon état (bornes, niveau, ventilation)", 2),
      oui("Antenne et feeders en bon état, sans infiltration d'eau", 3),
      oui("Mise à la terre et parafoudre contrôlés", 3),
      oui("Clôture, portail et cadenas en bon état", 2),
      oui("Extincteur présent et à date de validité", 2),
      oui("Piste d'accès praticable", 1, false),
      note("État général du site (de 0 à 10)", 2),
      texte("Observations de l'inspecteur"),
    ],
  },
  {
    cle: "locaux",
    titre: "Contrôle des locaux techniques",
    description: "Sécurité des personnes et des équipements dans un bâtiment",
    typeSite: {
      libelle: "Locaux techniques",
      description: "Bâtiments abritant studios, régies et salles d'équipements",
      motCle: "locaux",
    },
    criteres: [
      oui("Issues de secours dégagées et signalées", 3),
      oui("Extincteurs présents et à date de validité", 3),
      oui("Détection incendie en état de fonctionnement", 2),
      oui("Installations électriques sans câble dénudé ni surcharge de prises", 3),
      oui("Éclairage de secours fonctionnel", 2),
      oui("Climatisation des salles d'équipements en marche", 2),
      oui("Contrôle d'accès en place (badge, clé, registre des visiteurs)", 2),
      oui("Locaux propres et rangés", 1, false),
      texte("Observations de l'inspecteur"),
    ],
  },
];