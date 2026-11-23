import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Cloche from "./Cloche";
import { IconeBouclier } from "./IconesAuth";
import PanneauMaki from "../maki/PanneauMaki";
import { NOM_INSTITUTION } from "./identite";
import "./Layout.css";
import "./MenuGroupes.css";
import "./FondPylones.css";

interface Lien {
  vers: string;
  texte: string;
}

// Une section réunit les pages qui servent à la même chose, sous un seul nom.
// Avec un titre : section repliable (on clique dessus pour voir ce qu'elle contient).
// Sans titre : liens simples, toujours visibles.
interface Section {
  id: string;
  titre?: string;
  liens: Lien[];
}

// On ajoute un lien ici chaque fois qu'une vraie page est construite
const SECTIONS_DIRECTEUR: Section[] = [
  { id: "accueil", liens: [{ vers: "/", texte: "Tableau de bord" }] },
  {
    id: "operations",
    titre: "Opérations",
    liens: [
      { vers: "/missions", texte: "Missions" },
      { vers: "/ordres", texte: "Ordres délivrés" },
    ],
  },
  {
    id: "suivi",
    titre: "Suivi",
    liens: [
      { vers: "/rapports", texte: "Rapports" },
      { vers: "/non-conformites", texte: "Non-conformités" },
      { vers: "/conventions", texte: "Conventions" },
      { vers: "/tracabilite", texte: "Traçabilité" },
      { vers: "/tracabilite/carte", texte: "Carte en direct" },
    ],
  },
  {
    id: "referentiels",
    titre: "Référentiels",
    liens: [
      { vers: "/sites", texte: "Sites" },
      { vers: "/partenaires", texte: "Partenaires" },
      { vers: "/grilles", texte: "Grilles" },
      { vers: "/controleurs", texte: "Contrôleurs" },
    ],
  },
];

const SECTIONS_CONTROLEUR: Section[] = [
  {
    id: "controleur",
    liens: [
      { vers: "/", texte: "Accueil" },
      { vers: "/missions", texte: "Mes missions" },
      { vers: "/rapports", texte: "Mes rapports" },
      { vers: "/tracabilite", texte: "Mon journal" },
    ],
  },
];

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// Une icône par page (celles des pages à venir sont déjà prêtes)
const ICONES: Record<string, ReactNode> = {
  "/": (
    <Svg>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Svg>
  ),
  "/missions": (
    <Svg>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3v2h6V3" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  ),
  "/partenaires": (
    <Svg>
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
    </Svg>
  ),
  "/controleurs": (
    <Svg>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </Svg>
  ),
  "/ordres": (
    <Svg>
      <circle cx="12" cy="9" r="5" />
      <path d="M9.5 13.5L8 21l4-2 4 2-1.5-7.5" />
      <path d="M10 9l1.5 1.5L14 8" />
    </Svg>
  ),
  "/rapports": (
    <Svg>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </Svg>
  ),
  "/non-conformites": (
    <Svg>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </Svg>
  ),
  "/tracabilite": (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
  "/tracabilite/carte": (
    <Svg>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M4 21h16" />
    </Svg>
  ),
  "/conventions": (
    <Svg>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9.5 15.5l1.7 1.7 3.3-3.4" />
    </Svg>
  ),
  "/sites": (
    <Svg>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  ),
  "/grilles": (
    <Svg>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </Svg>
  ),
};

const ICONE_SORTIE = (
  <Svg>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

const CHEVRON = (
  <svg
    className="menu-chevron"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

// La page affichée appartient-elle à ce lien ?
function lienActif(chemin: string, vers: string): boolean {
  return vers === "/" ? chemin === "/" : chemin === vers || chemin.startsWith(`${vers}/`);
}

// Le cadre commun de toutes les pages : menu à gauche + contenu à droite
export default function Layout() {
  const { utilisateur, estDirecteur, seDeconnecter } = useAuth();
  const { pathname } = useLocation();
  const sections = estDirecteur ? SECTIONS_DIRECTEUR : SECTIONS_CONTROLEUR;

  // Section repliable qui contient la page affichée (s'il y en a une)
  const sectionDeLaPage =
    sections.find((s) => s.titre && s.liens.some((l) => lienActif(pathname, l.vers)))?.id ?? null;

  // Une seule section ouverte à la fois ; celle de la page affichée s'ouvre d'elle-même
  const [ouverte, setOuverte] = useState<string | null>(sectionDeLaPage);

  useEffect(() => {
    if (sectionDeLaPage) setOuverte(sectionDeLaPage);
  }, [sectionDeLaPage]);

  const nom = `${utilisateur?.first_name ?? ""} ${utilisateur?.last_name ?? ""}`.trim();
  const nomAffiche = nom || utilisateur?.username || "";
  const initiales =
    `${(utilisateur?.first_name || utilisateur?.username || "?").charAt(0)}${(utilisateur?.last_name || "").charAt(0)}`.toUpperCase();

  const afficherLien = (lien: Lien) => (
    <NavLink
      key={lien.vers}
      to={lien.vers}
      end={lien.vers === "/" || lien.vers === "/tracabilite"}
      className={({ isActive }) => (isActive ? "actif" : "")}
    >
      {ICONES[lien.vers]}
      <span>{lien.texte}</span>
    </NavLink>
  );

  return (
    <div className="application">
      <aside className="menu-lateral">
        <div className="menu-marque">
          <div className="menu-logo">
            <IconeBouclier taille={22} />
          </div>
          <div className="menu-marque-texte">
            <strong>Suivi des contrôles</strong>
            <span>{NOM_INSTITUTION}</span>
          </div>
        </div>

        <nav aria-label="Navigation principale">
          {sections.map((section) => {
            // Liens simples, toujours visibles
            if (!section.titre) return section.liens.map(afficherLien);

            const estOuverte = ouverte === section.id;
            const contientPage = section.id === sectionDeLaPage;
            const idListe = `menu-section-${section.id}`;

            return (
              <div
                key={section.id}
                className={`menu-groupe${estOuverte ? " ouvert" : ""}${contientPage ? " contient-page" : ""}`}
              >
                <button
                  type="button"
                  className="menu-groupe-entete"
                  aria-expanded={estOuverte}
                  aria-controls={idListe}
                  onClick={() => setOuverte(estOuverte ? null : section.id)}
                >
                  <span className="menu-groupe-titre">{section.titre}</span>
                  {contientPage && !estOuverte && <span className="menu-groupe-point" aria-hidden="true" />}
                  {CHEVRON}
                </button>

                <div className="menu-groupe-liste" id={idListe} role="group" aria-label={section.titre}>
                  <div className="menu-groupe-interieur">{section.liens.map(afficherLien)}</div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="menu-utilisateur">
          <div className="menu-profil">
            <div className="menu-avatar" aria-hidden="true">
              {initiales}
            </div>
            <div className="menu-profil-texte">
              <strong>{nomAffiche}</strong>
              <span className="role">
                {utilisateur?.role === "CONTROLEUR" ? "Contrôleur" : "Directeur"}
              </span>
            </div>
            <Cloche />
          </div>
          <button type="button" className="menu-deconnexion" onClick={seDeconnecter}>
            {ICONE_SORTIE}
            Se déconnecter
          </button>
        </div>
      </aside>

      <main className="contenu">
        <Outlet />
      </main>

      <PanneauMaki />
    </div>
  );
}