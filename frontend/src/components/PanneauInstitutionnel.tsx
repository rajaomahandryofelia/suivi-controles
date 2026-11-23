import { useState } from "react";
import {
  IconeMission,
  IconePosition,
  IconeDocument,
  IconeAlerte,
} from "./IconesAuth";
import {
  NOM_MINISTERE,
  NOM_INSTITUTION,
  NOM_APPLICATION,
  URL_LOGO,
} from "./identite";

const ACCROCHE =
  "Un espace sécurisé pour piloter les missions de contrôle des sites, du terrain jusqu'au rapport.";

const FONCTIONS = [
  {
    icone: <IconeMission taille={20} />,
    titre: "Missions de contrôle",
    texte: "Planifiez et suivez chaque mission, du départ à la clôture.",
  },
  {
    icone: <IconePosition taille={20} />,
    titre: "Traçabilité sur site",
    texte: "Position GPS et horodatage enregistrés pendant le contrôle.",
  },
  {
    icone: <IconeDocument taille={20} />,
    titre: "Rapports PDF",
    texte: "Un rapport structuré, généré à la clôture de la mission.",
  },
  {
    icone: <IconeAlerte taille={20} />,
    titre: "Non-conformités",
    texte: "Suivi des corrections jusqu'à leur vérification.",
  },
];

export default function PanneauInstitutionnel() {
  // État purement visuel : masque le logo s'il est introuvable
  const [logoDisponible, setLogoDisponible] = useState(true);

  return (
    <aside className="cnx-panneau" aria-label="Présentation de l'application">
      <div className="cnx-decor" aria-hidden="true">
        <span className="cnx-cercle cnx-cercle-1" />
        <span className="cnx-cercle cnx-cercle-2" />
      </div>

      <div className="cnx-marque">
        {logoDisponible && (
          <img
            className="cnx-logo"
            src={URL_LOGO}
            alt={`Logo – ${NOM_MINISTERE}`}
            onError={() => setLogoDisponible(false)}
          />
        )}
        <div className="cnx-marque-texte">
          <span className="cnx-ministere">{NOM_MINISTERE}</span>
          <span className="cnx-institution">{NOM_INSTITUTION}</span>
        </div>
      </div>

      <div className="cnx-hero">
        <span className="cnx-etiquette">Plateforme de suivi</span>
        <p className="cnx-hero-titre">{NOM_APPLICATION}</p>
        <p className="cnx-hero-texte">{ACCROCHE}</p>
      </div>

      <ul className="cnx-fonctions">
        {FONCTIONS.map((fonction) => (
          <li className="cnx-fonction" key={fonction.titre}>
            <span className="cnx-fonction-icone">{fonction.icone}</span>
            <div>
              <span className="cnx-fonction-titre">{fonction.titre}</span>
              <span className="cnx-fonction-texte">{fonction.texte}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="cnx-ruban" aria-hidden="true" />
    </aside>
  );
}