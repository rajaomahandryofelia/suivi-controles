import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import api from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import BoutonRetour from "../../components/BoutonRetour";
import Notification from "../../components/Notification";
import PanneauVerre from "../../components/PanneauVerre";
import type { Origine } from "../../components/PanneauIle";
import DetailIncident from "./DetailIncident";
import FormulaireIncident from "./FormulaireIncident";
import {
  SEGMENTS,
  formaterDate,
  formaterDateHeure,
  formaterDuree,
  formaterHeure,
  messageErreur,
} from "./outils";
import type {
  DonneesIncident,
  DonneesRetablissement,
  Incident,
  ModePanneau,
  SiteChoix,
} from "./types";
// Même style que la page Missions : pilule de filtres, tableau, alerte
import "../Missions/Missions.css";
import "../Missions/PageMissions.css";
import "./Incidents.css";

interface EtatPanneau {
  mode: ModePanneau;
  incident?: Incident;
  origine: Origine;
}

interface EtatNotification {
  cle: number;
  type: "succes" | "erreur";
  texte: string;
}

// Centre d'un élément : point de départ de l'animation du panneau
function origineDe(el: Element): Origine {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const ENTETE_FICHIER = { headers: { "Content-Type": "multipart/form-data" } };

async function envoyerPiece(idIncident: number, fichier: File) {
  const donnees = new FormData();
  donnees.append("fichier", fichier);
  await api.post(`/incidents/${idIncident}/pieces/`, donnees, ENTETE_FICHIER);
}

export default function Incidents() {
  const { estDirecteur } = useAuth();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [sites, setSites] = useState<SiteChoix[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [segment, setSegment] = useState("");
  const [panneau, setPanneau] = useState<EtatPanneau | null>(null);
  const [notification, setNotification] = useState<EtatNotification | null>(null);

  const notifier = useCallback((type: "succes" | "erreur", texte: string) => {
    setNotification({ cle: Date.now(), type, texte });
  }, []);
  const fermerNotification = useCallback(() => setNotification(null), []);
  const fermerPanneau = useCallback(() => setPanneau(null), []);

  // ---- Chargement des données (synchronisées avec le backend) ----

  const chargerIncidents = useCallback(async (silencieux = false) => {
    try {
      const reponse = await api.get("/incidents/");
      setIncidents(reponse.data);
      setErreur("");
    } catch {
      if (!silencieux) setErreur("Impossible de charger les incidents.");
    } finally {
      if (!silencieux) setChargement(false);
    }
  }, []);

  const chargerSites = useCallback(async () => {
    try {
      const reponse = await api.get("/referentiels/sites/");
      setSites((reponse.data as SiteChoix[]).filter((s) => s.est_actif));
    } catch {
      // Silencieux : la liste des incidents reste utilisable
    }
  }, []);

  useEffect(() => {
    chargerIncidents();
    chargerSites();
  }, [chargerIncidents, chargerSites]);

  // Rafraîchissement automatique : toutes les 30 s et au retour sur l'onglet
  useEffect(() => {
    const rafraichir = () => {
      if (document.visibilityState === "visible") chargerIncidents(true);
    };
    const minuteur = window.setInterval(rafraichir, 30000);
    document.addEventListener("visibilitychange", rafraichir);
    window.addEventListener("focus", rafraichir);
    return () => {
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", rafraichir);
      window.removeEventListener("focus", rafraichir);
    };
  }, [chargerIncidents]);

  // ---- Opérations ----

  // Déclare l'incident puis envoie les preuves choisies. Une erreur de déclaration
  // remonte au formulaire, qui l'affiche.
  async function declarer(donnees: DonneesIncident, fichiers: File[]) {
    const reponse = await api.post("/incidents/", donnees);
    const id = (reponse.data as Incident).id;

    let echecs = 0;
    for (const fichier of fichiers) {
      try {
        await envoyerPiece(id, fichier);
      } catch {
        echecs += 1;
      }
    }

    if (echecs > 0) {
      notifier(
        "erreur",
        `L'incident a été déclaré, mais ${echecs} fichier${echecs > 1 ? "s n'ont" : " n'a"} pas pu être envoyé${echecs > 1 ? "s" : ""}.`
      );
    } else {
      notifier("succes", "L'incident a été déclaré.");
    }
    await chargerIncidents(true);
    setPanneau(null);
  }

  async function retablir(id: number, donnees: DonneesRetablissement) {
    try {
      await api.post(`/incidents/${id}/retablir/`, donnees);
      notifier("succes", "L'incident a été marqué comme rétabli.");
      await chargerIncidents(true);
    } catch (e) {
      notifier("erreur", messageErreur(e, "Impossible de rétablir l'incident."));
    }
  }

  async function ajouterPreuves(id: number, fichiers: File[]) {
    let echecs = 0;
    for (const fichier of fichiers) {
      try {
        await envoyerPiece(id, fichier);
      } catch {
        echecs += 1;
      }
    }
    if (echecs > 0) {
      notifier("erreur", `${echecs} fichier${echecs > 1 ? "s" : ""} n'${echecs > 1 ? "ont" : "a"} pas pu être envoyé${echecs > 1 ? "s" : ""}.`);
    } else {
      notifier("succes", fichiers.length > 1 ? "Les preuves ont été ajoutées." : "La preuve a été ajoutée.");
    }
    await chargerIncidents(true);
  }

  async function supprimer(id: number) {
    try {
      await api.delete(`/incidents/${id}/`);
      notifier("succes", "L'incident a été supprimé.");
      setPanneau(null);
      await chargerIncidents(true);
    } catch (e) {
      notifier("erreur", messageErreur(e, "Impossible de supprimer l'incident."));
    }
  }

  // ---- Panneau ----

  function ouvrir(mode: ModePanneau, origine: Origine, incident?: Incident) {
    if (mode === "creer") chargerSites();
    setPanneau({ mode, incident, origine });
  }

  function surTouche(e: KeyboardEvent<HTMLTableRowElement>, incident: Incident) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ouvrir("voir", origineDe(e.currentTarget), incident);
    }
  }

  // L'incident affiché dans le panneau suit toujours la dernière version reçue
  const incidentOuvert = panneau?.incident
    ? incidents.find((i) => i.id === panneau.incident?.id) ?? panneau.incident
    : undefined;

  let titrePanneau = "";
  let sousTitrePanneau: string | undefined;
  if (panneau?.mode === "creer") {
    titrePanneau = "Déclarer un incident";
    sousTitrePanneau = "Signalez une interruption ou une panne sur un site";
  } else if (incidentOuvert) {
    titrePanneau = incidentOuvert.type_libelle;
    sousTitrePanneau = `${incidentOuvert.site_nom} · ${formaterDateHeure(incidentOuvert.date_debut)}`;
  }

  // ---- Filtrage et tri ----

  const nombrePour = (valeur: string) =>
    valeur ? incidents.filter((i) => i.statut === valeur).length : incidents.length;

  // Les incidents en cours d'abord, puis les plus récents
  const visibles = useMemo(
    () =>
      incidents
        .filter((i) => !segment || i.statut === segment)
        .sort((a, b) => {
          if (a.statut !== b.statut) return a.statut === "EN_COURS" ? -1 : 1;
          return b.date_debut.localeCompare(a.date_debut);
        }),
    [incidents, segment]
  );

  const ilYADesEnCours = nombrePour("EN_COURS") > 0;

  return (
    <div className="mis-page">
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <div className="entete-page">
        <h1>Incidents de diffusion</h1>
      </div>

      {erreur && (
        <div className="mpp-ile-zone">
          <div className="mpp-ile" role="alert">
            <span className="mpp-ile-point" aria-hidden="true" />
            <span className="mpp-ile-texte">{erreur}</span>
          </div>
        </div>
      )}

      {/* Pilule : filtres + bouton de déclaration */}
      <div className="mis-ilot-zone">
        <div className="mis-ilot" role="group" aria-label="Filtrer les incidents">
          {SEGMENTS.map((s) => {
            const nombre = nombrePour(s.valeur);
            return (
              <button
                key={s.valeur}
                type="button"
                aria-pressed={segment === s.valeur}
                className={`mis-segment${segment === s.valeur ? " actif" : ""}`}
                onClick={() => setSegment(s.valeur)}
                title={`${nombre} incident${nombre > 1 ? "s" : ""}`}
              >
                {s.libelle}
                {s.valeur === "EN_COURS" && ilYADesEnCours && (
                  <span className="mis-point" aria-label="Il y a des incidents en cours" />
                )}
              </button>
            );
          })}

          <span className="mis-separateur" aria-hidden="true" />
          <button
            type="button"
            className="mis-ajout"
            onClick={(e) => ouvrir("creer", origineDe(e.currentTarget))}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Déclarer un incident
          </button>
        </div>
      </div>

      {chargement ? (
        <div className="mis-chargement">
          <span className="mis-spinner" aria-hidden="true" />
          Chargement des incidents…
        </div>
      ) : (
        <div className="mis-tableau-cadre">
          {visibles.length === 0 ? (
            <p className="mis-vide">
              {incidents.length === 0
                ? "Aucun incident enregistré. Cliquez sur « Déclarer un incident » pour en signaler un."
                : "Aucun incident dans cette catégorie."}
            </p>
          ) : (
            <table className="mis-tableau">
              <thead>
                <tr>
                  <th>Début</th>
                  <th>Site</th>
                  <th>Incident</th>
                  <th>Gravité</th>
                  <th>Durée</th>
                  <th>Statut</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((i) => (
                  <tr
                    key={i.id}
                    tabIndex={0}
                    onClick={(e) => ouvrir("voir", { x: e.clientX, y: e.clientY }, i)}
                    onKeyDown={(e) => surTouche(e, i)}
                  >
                    <td className="mis-date">
                      <span className="mis-date-texte">{formaterDate(i.date_debut)}</span>
                      <span className="mis-heure">{formaterHeure(i.date_debut)}</span>
                    </td>
                    <td className="mis-site">
                      <strong>{i.site_nom}</strong>
                      <span>{i.service_libelle}</span>
                    </td>
                    <td className="mis-site">
                      <strong>{i.type_libelle}</strong>
                      {i.est_recurrent && <span className="inc-recurrent">Récurrent</span>}
                    </td>
                    <td>
                      <span className={`inc-gravite ${i.gravite}`}>{i.gravite_libelle}</span>
                    </td>
                    <td>{formaterDuree(i.duree_minutes)}</td>
                    <td>
                      <span className={`inc-statut ${i.statut}`}>{i.statut_libelle}</span>
                    </td>
                    <td className="mis-chevron" aria-hidden="true">
                      ›
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {panneau && (
        <PanneauVerre
          titre={titrePanneau}
          sousTitre={sousTitrePanneau}
          origine={panneau.origine}
          onFermer={fermerPanneau}
        >
          {(fermer) => (
            <div className="ile-vue" key={panneau.mode}>
              {panneau.mode === "creer" && (
                <FormulaireIncident
                  sites={sites}
                  onEnvoyer={async (donnees, fichiers) => {
                    await declarer(donnees, fichiers);
                  }}
                  onAnnuler={fermer}
                />
              )}

              {panneau.mode === "voir" && incidentOuvert && (
                <DetailIncident
                  incident={incidentOuvert}
                  estDirecteur={estDirecteur}
                  onRetablir={(donnees) => retablir(incidentOuvert.id, donnees)}
                  onAjouterPreuves={(fichiers) => ajouterPreuves(incidentOuvert.id, fichiers)}
                  onSupprimer={() => supprimer(incidentOuvert.id)}
                />
              )}
            </div>
          )}
        </PanneauVerre>
      )}

      {notification && (
        <Notification
          key={notification.cle}
          type={notification.type}
          texte={notification.texte}
          onFermer={fermerNotification}
        />
      )}
    </div>
  );
}