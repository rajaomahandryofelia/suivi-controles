import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../../api/client";
import { formaterDuree } from "../../Incidents/outils";
import CarteSites from "./CarteSites";
import DonutGravite from "./DonutGravite";
import GraphiqueEvolution from "./GraphiqueEvolution";
import type { Alerte, TableauIncidents } from "./typesSupervision";
import "./SupervisionIncidents.css";

// Les 12 derniers mois, le plus récent d'abord : « 2026-11 » → « Novembre 2026 »
function optionsMois() {
  const maintenant = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    const texte = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return {
      valeur: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      libelle: texte.charAt(0).toUpperCase() + texte.slice(1),
    };
  });
}

// « 23/11/2026 – 08:30 »
function dateHeure(iso: string): string {
  const d = new Date(iso);
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${d.toLocaleDateString("fr-FR")} – ${heure}`;
}

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      width="26"
      height="26"
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

const SYMBOLES_ALERTE: Record<Alerte["niveau"], string> = {
  critique: "!",
  recurrent: "↻",
  en_cours: "i",
};

// Le tableau de bord de supervision des incidents de diffusion (Directeur)
export default function SupervisionIncidents() {
  const navigate = useNavigate();
  const options = useMemo(optionsMois, []);
  const [mois, setMois] = useState(options[0].valeur);
  const [donnees, setDonnees] = useState<TableauIncidents | null>(null);
  const [erreur, setErreur] = useState(false);

  // Chargement à chaque changement de mois, puis une fois par minute
  useEffect(() => {
    let actif = true;
    const charger = async () => {
      try {
        const reponse = await api.get("/incidents/tableau-de-bord/", { params: { mois } });
        if (actif) {
          setDonnees(reponse.data);
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
  }, [mois]);

  const entete = (
    <div className="sup-entete">
      <div>
        <h2>Supervision des incidents</h2>
        <p>Une vision claire pour une diffusion continue</p>
      </div>
      <select
        className="sup-mois"
        value={mois}
        onChange={(e) => setMois(e.target.value)}
        aria-label="Mois affiché"
      >
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
    </div>
  );

  if (!donnees) {
    return (
      <section className="sup">
        {entete}
        {erreur ? (
          <div className="tdb-erreur" role="alert">
            Impossible de charger la supervision des incidents.
          </div>
        ) : (
          <div className="tdb-chargement">
            <span className="tdb-spinner" aria-hidden="true" />
            Chargement…
          </div>
        )}
      </section>
    );
  }

  const { kpis } = donnees;
  const variation = kpis.variation_pct;

  return (
    <section className="sup">
      {entete}

      {erreur && (
        <div className="tdb-erreur" role="alert">
          Actualisation impossible : les chiffres affichés peuvent ne pas être à jour.
        </div>
      )}

      {/* ---- Les quatre chiffres clés ---- */}
      <div className="sup-kpis">
        <div className="sup-kpi vert">
          <span className="sup-kpi-icone">
            <Icone>
              <circle cx="12" cy="11" r="1.6" />
              <path d="M12 12.6V21" />
              <path d="M8.5 21h7" />
              <path d="M8.6 7.6a4.9 4.9 0 0 0 0 6.8" />
              <path d="M15.4 7.6a4.9 4.9 0 0 1 0 6.8" />
              <path d="M5.8 4.8a8.8 8.8 0 0 0 0 12.4" />
              <path d="M18.2 4.8a8.8 8.8 0 0 1 0 12.4" />
            </Icone>
          </span>
          <div className="sup-kpi-texte">
            <strong>{kpis.sites_suivis}</strong>
            <span>Sites suivis</span>
          </div>
        </div>

        <div className="sup-kpi bleu">
          <span className="sup-kpi-icone">
            <Icone>
              <path d="M3 3v18h18" />
              <path d="M7 15l4-4 3 3 5-6" />
            </Icone>
          </span>
          <div className="sup-kpi-texte">
            <strong>{kpis.incidents_ce_mois}</strong>
            <span>Incidents ce mois</span>
          </div>
          {variation !== null && (
            <span className={`sup-badge ${variation > 0 ? "hausse" : variation < 0 ? "baisse" : ""}`}>
              {variation > 0 ? "↑ +" : variation < 0 ? "↓ " : "→ "}
              {variation} %
            </span>
          )}
        </div>

        <div className="sup-kpi orange">
          <span className="sup-kpi-icone">
            <Icone>
              <path d="M12 3 2 20h20z" />
              <path d="M12 10v4" />
              <path d="M12 17h.01" />
            </Icone>
          </span>
          <div className="sup-kpi-texte">
            <strong>{kpis.en_cours}</strong>
            <span>Incidents en cours</span>
          </div>
          {kpis.en_cours > 0 && <span className="sup-badge orange">À surveiller</span>}
        </div>

        <div className="sup-kpi rouge">
          <span className="sup-kpi-icone">
            <Icone>
              <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
              <path d="M12 8v5" />
              <path d="M12 16h.01" />
            </Icone>
          </span>
          <div className="sup-kpi-texte">
            <strong>{kpis.sites_critiques}</strong>
            <span>Sites critiques</span>
          </div>
          {kpis.sites_critiques > 0 && <span className="sup-badge rouge">Urgent</span>}
        </div>
      </div>

      {/* ---- Évolution, répartition, carte ---- */}
      <div className="sup-rangee trois">
        <article className="sup-carte-bloc">
          <h3>Évolution des incidents</h3>
          <GraphiqueEvolution points={donnees.evolution} />
        </article>

        <article className="sup-carte-bloc">
          <h3>Répartition par gravité</h3>
          <DonutGravite total={donnees.repartition.total} parts={donnees.repartition.parts} />
        </article>

        <article className="sup-carte-bloc">
          <h3>État des sites</h3>
          <CarteSites sites={donnees.sites} />
        </article>
      </div>

      {/* ---- Alertes et incidents récents ---- */}
      <div className="sup-rangee deux">
        <article className="sup-carte-bloc">
          <div className="sup-bloc-tete">
            <h3 className="alerte">Alertes prioritaires</h3>
            <Link to="/incidents">Voir tout ›</Link>
          </div>
          {donnees.alertes.length === 0 ? (
            <p className="tdb-vide">Aucune alerte : tout est normal.</p>
          ) : (
            <ul className="sup-alertes">
              {donnees.alertes.map((a) => (
                <li key={a.cle}>
                  <span className={`sup-alerte-icone ${a.niveau}`} aria-hidden="true">
                    {SYMBOLES_ALERTE[a.niveau]}
                  </span>
                  <div className="sup-alerte-texte">
                    <strong>{a.titre}</strong>
                    <span>{a.detail}</span>
                  </div>
                  <span className={`sup-etiquette ${a.niveau}`}>{a.etiquette}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="sup-carte-bloc">
          <div className="sup-bloc-tete">
            <h3>Incidents récents</h3>
            <Link to="/incidents">Voir tous ›</Link>
          </div>
          {donnees.recents.length === 0 ? (
            <p className="tdb-vide">Aucun incident enregistré.</p>
          ) : (
            <div className="sup-tableau-cadre">
              <table className="sup-tableau">
                <thead>
                  <tr>
                    <th>Date / Heure</th>
                    <th>Site</th>
                    <th>Type</th>
                    <th>Gravité</th>
                    <th>Statut</th>
                    <th>Durée</th>
                  </tr>
                </thead>
                <tbody>
                  {donnees.recents.map((i) => (
                    <tr key={i.id} onClick={() => navigate("/incidents")}>
                      <td>{dateHeure(i.date_debut)}</td>
                      <td className="sup-site">{i.site_nom}</td>
                      <td>{i.type_libelle}</td>
                      <td>
                        <span className={`sup-gravite ${i.gravite}`}>{i.gravite_libelle}</span>
                      </td>
                      <td>
                        <span className={`sup-statut ${i.statut}`}>{i.statut_libelle}</span>
                      </td>
                      <td>{formaterDuree(i.duree_minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>

      {/* ---- Actions rapides ---- */}
      <div className="sup-actions">
        <button
          type="button"
          className="sup-action principale"
          onClick={() => navigate("/missions", { state: { creer: true } })}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="3" width="14" height="18" rx="2" />
            <path d="M9 3v2h6V3" />
            <path d="M12 10v6M9 13h6" />
          </svg>
          Nouvelle mission
        </button>
        <button type="button" className="sup-action" onClick={() => navigate("/incidents")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3 2 20h20z" />
            <path d="M12 10v4" />
            <path d="M12 17h.01" />
          </svg>
          Déclarer un incident
        </button>
        <button type="button" className="sup-action" onClick={() => navigate("/trajets/direct")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          Consulter la carte
        </button>
        <button type="button" className="sup-action" onClick={() => navigate("/rapports")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
            <path d="M9 13h6M9 17h6" />
          </svg>
          Voir les rapports
        </button>
      </div>
    </section>
  );
}