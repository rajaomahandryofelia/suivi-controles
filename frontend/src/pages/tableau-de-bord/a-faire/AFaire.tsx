import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../api/client";
import "./AFaire.css";

interface Reponse {
  total: number;
  rapports: {
    nombre: number;
    elements: { id: number; site: string; controleur: string; score: string | number }[];
  };
  non_conformites_retard: {
    nombre: number;
    elements: {
      id: number;
      site: string;
      description: string;
      gravite: string;
      gravite_libelle: string;
      jours_retard: number;
    }[];
  };
  non_conformites_a_verifier: { nombre: number };
  missions_retard: {
    nombre: number;
    elements: { mission: number; site: string; controleur: string; fin_prevue: string }[];
  };
}

interface Note {
  cle: string;
  urgence: "rouge" | "ambre" | "vert";
  nombre: number;
  titre: string;
  apercu: string | null;
  vers: string;
}

// « Site X · 3 j de retard · +2 autres » : une seule ligne, jamais plus
function avecSuite(premier: string | undefined, nombre: number, repli: string | null): string | null {
  if (!premier) return repli;
  return nombre > 1 ? `${premier} · +${nombre - 1} autre${nombre > 2 ? "s" : ""}` : premier;
}

// Tableau de bord du Directeur : quelques notes sur ce qui demande son attention
export default function AFaire() {
  const [donnees, setDonnees] = useState<Reponse | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await api.get<Reponse>("/controles/a-faire/");
      setDonnees(r.data);
    } catch {
      // silencieux : les indicateurs du tableau de bord restent affichés
    }
  }, []);

  useEffect(() => {
    charger();
    const minuteur = window.setInterval(() => {
      if (document.visibilityState === "visible") charger();
    }, 60000);
    return () => window.clearInterval(minuteur);
  }, [charger]);

  if (!donnees) return null;

  const { rapports, non_conformites_retard: retard, non_conformites_a_verifier: verif, missions_retard: missions } = donnees;

  const premierRapport = rapports.elements[0];
  const premiereNc = retard.elements[0];
  const premiereMission = missions.elements[0];

  // Du plus urgent au moins urgent
  const toutes: Note[] = [
    {
      cle: "retard",
      urgence: "rouge",
      nombre: retard.nombre,
      titre: "Non-conformités en retard",
      apercu: avecSuite(
        premiereNc && `${premiereNc.site} · ${premiereNc.jours_retard} j de retard`,
        retard.nombre,
        null
      ),
      vers: "/non-conformites",
    },
    {
      cle: "missions",
      urgence: "rouge",
      nombre: missions.nombre,
      titre: "Visites en retard",
      apercu: avecSuite(
        premiereMission && `${premiereMission.site} · ${premiereMission.controleur}`,
        missions.nombre,
        null
      ),
      vers: "/tracabilite/carte",
    },
    {
      cle: "rapports",
      urgence: "ambre",
      nombre: rapports.nombre,
      titre: "Rapports à valider",
      apercu: avecSuite(
        premierRapport && `${premierRapport.site} · ${Math.round(Number(premierRapport.score))} %`,
        rapports.nombre,
        null
      ),
      vers: "/rapports",
    },
    {
      cle: "verif",
      urgence: "vert",
      nombre: verif.nombre,
      titre: "Corrections à vérifier",
      apercu: "À confirmer au prochain contrôle",
      vers: "/non-conformites",
    },
  ];

  // Les sujets vides ne sont pas affichés
  const notes = toutes.filter((n) => n.nombre > 0);

  return (
    <aside className="af-bloc" aria-labelledby="af-titre">
      <header className="af-entete">
        <h2 id="af-titre">À faire</h2>
        {donnees.total > 0 && <span className="af-total">{donnees.total}</span>}
      </header>

      {notes.length === 0 ? (
        <p className="af-ok">
          <span className="af-ok-point" aria-hidden="true" />
          Tout est à jour
        </p>
      ) : (
        <ul className="af-liste">
          {notes.map((n) => (
            <li key={n.cle}>
              <Link className={`af-note ${n.urgence}`} to={n.vers}>
                <span className="af-point" aria-hidden="true" />
                <span className="af-corps">
                  <strong>{n.titre}</strong>
                  {n.apercu && <span className="af-apercu">{n.apercu}</span>}
                </span>
                <span className="af-nombre">{n.nombre}</span>
                <span className="af-chevron" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}