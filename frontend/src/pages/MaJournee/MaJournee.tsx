import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import IndicateurTrajet from "../../suivi/IndicateurTrajet";
import { creneauCourt, formaterDate, messagesErreur, obtenirPosition } from "../Missions/outils";
import { libelleOuverture, missionOuverte } from "../Missions/horaire";
import type { Mission } from "../Missions/types";
import "./MaJournee.css";

const jourISO = () => new Date().toLocaleDateString("sv-SE");

// Ordre de passage : l'heure prévue, puis le numéro
function parHeure(a: Mission, b: Mission) {
  return (
    a.date_prevue.localeCompare(b.date_prevue) ||
    (a.heure_prevue ?? "").localeCompare(b.heure_prevue ?? "") ||
    a.id - b.id
  );
}

function etatTexte(m: Mission) {
  if (m.statut === "CLOTUREE") return { classe: "fini", texte: "Terminée" };
  if (m.statut === "EN_COURS")
    return m.latitude_debut
      ? { classe: "place", texte: "Sur place" }
      : { classe: "attente", texte: "À rejoindre" };
  return { classe: "prevu", texte: "Prévue" };
}

export default function MaJournee() {
  const { utilisateur } = useAuth();
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [arrivee, setArrivee] = useState<number | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await api.get<Mission[]>("/controles/missions/");
      setMissions(r.data);
      setErreur("");
    } catch (e) {
      setErreur(messagesErreur(e, "Impossible de charger vos missions. Réessayez."));
    }
  }, []);

  useEffect(() => {
    charger();
    const minuteur = window.setInterval(() => {
      if (document.visibilityState === "visible") charger();
    }, 30000);
    return () => window.clearInterval(minuteur);
  }, [charger]);

  async function signalerArrivee(m: Mission) {
    setArrivee(m.id);
    setMessage("");
    setErreur("");
    try {
      const position = await obtenirPosition();
      await api.post(`/controles/missions/${m.id}/arrivee/`, position);
      setMessage(`Votre arrivée sur « ${m.site_nom} » est enregistrée. Vous pouvez remplir la grille.`);
      await charger();
    } catch (e) {
      setErreur(messagesErreur(e, "L'arrivée n'a pas pu être enregistrée."));
    } finally {
      setArrivee(null);
    }
  }

  const aujourdhui = jourISO();
  const prenom = utilisateur?.first_name || utilisateur?.username || "";
  const toutes = (missions ?? []).slice().sort(parHeure);

  // À faire maintenant : ce qui est en cours (même d'un jour passé) et ce qui est prévu aujourd'hui
  const duJour = toutes.filter(
    (m) => m.statut !== "CLOTUREE" && (m.statut === "EN_COURS" || m.date_prevue === aujourdhui)
  );
  const terminees = toutes.filter((m) => m.statut === "CLOTUREE" && m.date_prevue === aujourdhui);
  const aVenir = toutes.filter((m) => m.statut === "PLANIFIEE" && m.date_prevue > aujourdhui).slice(0, 5);

  // La mission du jour : en cours d'abord, sinon la prochaine
  const enCours = duJour.filter((m) => m.statut === "EN_COURS");
  const principale = enCours[0] ?? duJour[0] ?? null;
  const suivantes = duJour.filter((m) => m.id !== principale?.id);

  function boutonPrincipal(m: Mission) {
    if (m.statut === "EN_COURS" && !m.latitude_debut) {
      return (
        <button type="button" className="mj-gros" onClick={() => signalerArrivee(m)} disabled={arrivee !== null}>
          {arrivee === m.id ? "Localisation en cours…" : "Je suis arrivé"}
        </button>
      );
    }
    if (m.statut === "EN_COURS") {
      return (
        <Link className="mj-gros" to={`/missions?mission=${m.id}&action=grille`}>
          Remplir la grille
        </Link>
      );
    }
    return (
      <p className="mj-attente">
        {missionOuverte(m) ? "La mission va démarrer." : libelleOuverture(m)}
      </p>
    );
  }

  return (
    <div className="mj-page">
      <header className="mj-entete">
        <h1>Bonjour {prenom}</h1>
        <p>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </header>

      <IndicateurTrajet />

      {erreur && (
        <p className="mj-message erreur" role="alert">
          {erreur}
        </p>
      )}
      {message && (
        <p className="mj-message ok" role="status">
          {message}
        </p>
      )}

      {missions === null && !erreur && <p className="mj-vide">Chargement de vos missions…</p>}

      {missions !== null && (
        <>
          {principale ? (
            <section className="mj-hero" aria-labelledby="mj-hero-titre">
              <span className={`mj-etiquette ${etatTexte(principale).classe}`}>
                {principale.statut === "EN_COURS" ? "En cours maintenant" : "Votre prochaine visite"}
              </span>
              <h2 id="mj-hero-titre">{principale.site_nom}</h2>
              <p className="mj-lieu">{principale.site_localisation}</p>
              <p className="mj-creneau">
                {principale.date_prevue === aujourdhui ? "Aujourd'hui" : formaterDate(principale.date_prevue)}
                {creneauCourt(principale) ? ` · ${creneauCourt(principale)}` : ""}
              </p>
              {boutonPrincipal(principale)}
              <Link className="mj-lien" to={`/missions?mission=${principale.id}`}>
                Voir le détail de la mission
              </Link>
            </section>
          ) : (
            <section className="mj-hero repos">
              <h2>Aucune visite à faire aujourd'hui</h2>
              <p className="mj-lieu">
                {aVenir[0]
                  ? `Prochaine visite : ${formaterDate(aVenir[0].date_prevue)}, ${aVenir[0].site_nom}.`
                  : "Le Directeur ne vous a pas encore attribué de mission."}
              </p>
            </section>
          )}

          {suivantes.length > 0 && (
            <section className="mj-bloc">
              <h2>Ensuite aujourd'hui</h2>
              <ul className="mj-liste">
                {suivantes.map((m) => (
                  <li key={m.id}>
                    <Link to={`/missions?mission=${m.id}`}>
                      <span className={`mj-puce ${etatTexte(m).classe}`} aria-hidden="true" />
                      <span className="mj-liste-texte">
                        <strong>{m.site_nom}</strong>
                        <span>{creneauCourt(m) || formaterDate(m.date_prevue)}</span>
                      </span>
                      <span className="mj-liste-etat">{etatTexte(m).texte}</span>
                      <span className="mj-chevron" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {terminees.length > 0 && (
            <section className="mj-bloc">
              <h2>Terminées aujourd'hui</h2>
              <ul className="mj-liste">
                {terminees.map((m) => (
                  <li key={m.id}>
                    <Link to={`/missions?mission=${m.id}`}>
                      <span className="mj-puce fini" aria-hidden="true" />
                      <span className="mj-liste-texte">
                        <strong>{m.site_nom}</strong>
                        <span>{m.site_localisation}</span>
                      </span>
                      <span className="mj-liste-etat">Terminée</span>
                      <span className="mj-chevron" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {aVenir.length > 0 && (
            <section className="mj-bloc">
              <h2>À venir</h2>
              <ul className="mj-liste">
                {aVenir.map((m) => (
                  <li key={m.id}>
                    <Link to={`/missions?mission=${m.id}`}>
                      <span className="mj-puce prevu" aria-hidden="true" />
                      <span className="mj-liste-texte">
                        <strong>{m.site_nom}</strong>
                        <span>
                          {formaterDate(m.date_prevue)}
                          {creneauCourt(m) ? ` · ${creneauCourt(m)}` : ""}
                        </span>
                      </span>
                      <span className="mj-chevron" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <nav className="mj-raccourcis" aria-label="Raccourcis">
        <Link to="/missions">Toutes mes missions</Link>
        <Link to="/rapports">Mes rapports</Link>
        <Link to="/trajets">Mes trajets</Link>
      </nav>
    </div>
  );
}