import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../api/client";
import { formaterDuree } from "../../Incidents/outils";
import "./IndicateursIncidents.css";

interface SiteTouche {
  site_id: number;
  site_nom: string;
  nombre: number;
  duree_minutes: number;
}

// Ce que renvoie GET /api/incidents/statistiques/
interface StatsIncidents {
  mois: string; // « 2026-11 »
  incidents_ce_mois: number;
  non_resolus: number;
  sites_concernes: number;
  duree_totale_minutes: number;
  recurrents: number;
  par_type: Record<string, number>;
  sites_les_plus_touches: SiteTouche[];
}

// « 2026-11 » → « novembre 2026 »
function libelleMois(mois: string): string {
  return new Date(`${mois}-01T12:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

// Les indicateurs des incidents de diffusion, pour le Directeur
export default function IndicateursIncidents() {
  const [stats, setStats] = useState<StatsIncidents | null>(null);
  const [erreur, setErreur] = useState(false);

  // Chargement au départ, puis une fois par minute
  useEffect(() => {
    let actif = true;
    const charger = async () => {
      try {
        const reponse = await api.get("/incidents/statistiques/");
        if (actif) {
          setStats(reponse.data);
          setErreur(false);
        }
      } catch {
        if (actif) setErreur(true);
      }
    };
    charger();
    const minuteur = window.setInterval(charger, 60000);
    return () => {
      actif = false;
      window.clearInterval(minuteur);
    };
  }, []);

  const entete = (sousTitre: string) => (
    <div className="tdb-carte-tete">
      <span className="tdb-icone" aria-hidden="true">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="11" r="1.6" />
          <path d="M12 12.6V21" />
          <path d="M8.5 21h7" />
          <path d="M8.6 7.6a4.9 4.9 0 0 0 0 6.8" />
          <path d="M15.4 7.6a4.9 4.9 0 0 1 0 6.8" />
          <path d="M5.8 4.8a8.8 8.8 0 0 0 0 12.4" />
          <path d="M18.2 4.8a8.8 8.8 0 0 1 0 12.4" />
        </svg>
      </span>
      <div>
        <h2>Incidents de diffusion</h2>
        <p>{sousTitre}</p>
      </div>
      <Link to="/incidents" className="tdi-lien">
        Voir tout ›
      </Link>
    </div>
  );

  if (!stats) {
    if (!erreur) return null;
    return (
      <section className="tdb-carte tdi-carte">
        {entete("Indicateurs indisponibles")}
        <p className="tdb-vide">Impossible de charger les indicateurs des incidents.</p>
      </section>
    );
  }

  const plusTouches = stats.sites_les_plus_touches;
  const maximum = Math.max(...plusTouches.map((s) => s.nombre), 1);

  return (
    <section className="tdb-carte tdi-carte">
      {entete(`Mois de ${libelleMois(stats.mois)}`)}

      <div className="tdi-grille">
        <div className="tdi-tuile">
          <span className="tdi-valeur">{stats.incidents_ce_mois}</span>
          <span className="tdi-etiquette">Incidents ce mois</span>
        </div>
        <div className={`tdi-tuile${stats.non_resolus > 0 ? " alerte" : ""}`}>
          <span className="tdi-valeur">{stats.non_resolus}</span>
          <span className="tdi-etiquette">Non résolus</span>
        </div>
        <div className="tdi-tuile">
          <span className="tdi-valeur">{stats.sites_concernes}</span>
          <span className="tdi-etiquette">Sites concernés</span>
        </div>
        <div className="tdi-tuile">
          <span className="tdi-valeur">
            {stats.duree_totale_minutes > 0 ? formaterDuree(stats.duree_totale_minutes) : "0"}
          </span>
          <span className="tdi-etiquette">Durée totale d'interruption</span>
        </div>
        <div className={`tdi-tuile${stats.recurrents > 0 ? " attention" : ""}`}>
          <span className="tdi-valeur">{stats.recurrents}</span>
          <span className="tdi-etiquette">Incidents récurrents</span>
        </div>
      </div>

      <h3 className="tdi-sous-titre">Sites qui connaissent le plus d'interruptions</h3>
      {plusTouches.length === 0 ? (
        <p className="tdb-vide">Aucun incident ce mois-ci.</p>
      ) : (
        <ul className="tdi-sites">
          {plusTouches.map((s) => (
            <li key={s.site_id}>
              <div className="tdi-site-ligne">
                <strong>{s.site_nom}</strong>
                <span>
                  {pluriel(s.nombre, "incident")} · {formaterDuree(s.duree_minutes)}
                </span>
              </div>
              <div className="tdi-barre" aria-hidden="true">
                <span style={{ width: `${(s.nombre / maximum) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}