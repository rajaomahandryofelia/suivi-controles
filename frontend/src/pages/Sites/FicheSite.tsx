import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/client";
import PanneauIle from "../../components/PanneauIle";
import type { Origine } from "../../components/PanneauIle";
import { origineDe } from "../outilsListe";
import FormulaireSite from "./FormulaireSite";
import type { Option, Site } from "./types";
import "../Liste.css";
import "./Sites.css";
import "./FicheSite.css";

// Adresses de l'API (app « referentiels »). Si ton préfixe est différent, change-le ici.
const URL_SITES = "/referentiels/sites/";
const URL_TYPES = "/referentiels/types-site/";
const URL_PARTENAIRES = "/referentiels/partenaires/";

interface ElementInventaire {
  id: number;
  type: string;
  description: string;
  date_ajout: string;
}

// Le site de la liste, enrichi de ce que la fiche affiche
type SiteDetail = Site & {
  type_site_libelle: string;
  partenaire_nom: string | null;
  nombre_controles?: number;
  non_conformites_ouvertes?: number;
  dernier_controle?: string | null;
  elements: ElementInventaire[];
};

interface Partenaire {
  id: number;
  nom: string;
}

interface MissionHistorique {
  id: number;
  date_prevue: string;
  statut: string;
  statut_libelle: string;
  date_fin_reelle: string | null;
  controleur_nom: string;
  rapport_statut: string | null;
  rapport_statut_libelle: string | null;
  score_conformite: string | null;
}

interface NonConformite {
  id: number;
  description: string;
  gravite: string;
  gravite_libelle: string;
  statut: string;
  statut_libelle: string;
  date_detection: string;
  date_limite_correction: string;
  date_correction: string | null;
  date_verification: string | null;
}

type Ton = "neutre" | "vert" | "rouge" | "ambre";

const TON_MISSION: Record<string, Ton> = {
  PLANIFIEE: "neutre",
  EN_COURS: "ambre",
  CLOTUREE: "vert",
};
const TON_RAPPORT: Record<string, Ton> = {
  GENERE: "neutre",
  VALIDE: "vert",
  REJETE: "rouge",
};
const TON_GRAVITE: Record<string, Ton> = {
  MINEURE: "neutre",
  MAJEURE: "ambre",
  CRITIQUE: "rouge",
};
const TON_NC: Record<string, Ton> = {
  OUVERTE: "rouge",
  CORRIGEE: "ambre",
  VERIFIEE: "vert",
};

// Accepte une liste simple ou une réponse paginée de DRF ({ results: [...] })
function extraireListe<T>(donnees: unknown): T[] {
  if (Array.isArray(donnees)) return donnees as T[];
  const resultats = (donnees as { results?: T[] } | null)?.results;
  return resultats ?? [];
}

function formaterDate(valeur?: string | null): string {
  if (!valeur) return "";
  // Une date seule (AAAA-MM-JJ) est lue en heure locale pour éviter tout décalage d'un jour
  const date = new Date(valeur.length === 10 ? `${valeur}T00:00:00` : valeur);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function Badge({ ton, children }: { ton: Ton; children: string }) {
  return <span className={`fs-badge fs-badge-${ton}`}>{children}</span>;
}

function Vide({ children }: { children: string }) {
  return <p className="fs-vide">{children}</p>;
}

export default function FicheSite() {
  const { id } = useParams<{ id: string }>();
  const [site, setSite] = useState<SiteDetail | null>(null);
  const [missions, setMissions] = useState<MissionHistorique[]>([]);
  const [nonConformites, setNonConformites] = useState<NonConformite[]>([]);
  const [types, setTypes] = useState<Option[]>([]);
  const [partenaires, setPartenaires] = useState<Option[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [erreurAction, setErreurAction] = useState("");
  const [succes, setSucces] = useState("");
  const [enCours, setEnCours] = useState(false);
  // Présent = le panneau de modification est ouvert (il garde le point d'où il s'anime)
  const [origine, setOrigine] = useState<Origine | null>(null);
  // Incrémenté après une modification pour recharger la fiche
  const [version, setVersion] = useState(0);
  const fermerPanneau = useCallback(() => setOrigine(null), []);

  useEffect(() => {
    let actif = true;
    async function charger() {
      setErreur("");
      try {
        const [reponseSite, reponseHistorique] = await Promise.all([
          api.get(`${URL_SITES}${id}/`),
          api.get(`${URL_SITES}${id}/historique/`),
        ]);
        if (!actif) return;
        setSite(reponseSite.data);
        setMissions(reponseHistorique.data.missions ?? []);
        setNonConformites(reponseHistorique.data.non_conformites ?? []);
      } catch (e) {
        if (!actif) return;
        const statut = (e as { response?: { status?: number } }).response?.status;
        setErreur(
          statut === 404 ? "Ce site n'existe pas." : "Impossible de charger la fiche du site."
        );
      } finally {
        if (actif) setChargement(false);
      }
    }
    charger();
    return () => {
      actif = false;
    };
  }, [id, version]);

  // Types et partenaires ne servent qu'au formulaire de modification : chargés une fois
  useEffect(() => {
    let actif = true;
    Promise.all([api.get(URL_TYPES), api.get(URL_PARTENAIRES)])
      .then(([reponseTypes, reponsePartenaires]) => {
        if (!actif) return;
        setTypes(extraireListe<Option>(reponseTypes.data));
        setPartenaires(
          extraireListe<Partenaire>(reponsePartenaires.data).map((p) => ({
            id: p.id,
            libelle: p.nom,
          }))
        );
      })
      .catch(() => {
        // Le formulaire s'affichera avec des listes vides
      });
    return () => {
      actif = false;
    };
  }, []);

  // Désactiver ou réactiver le site : on ne supprime jamais, l'historique est conservé
  async function changerStatut(actif: boolean) {
    if (!site) return;
    if (
      !actif &&
      !window.confirm(
        `Désactiver le site « ${site.nom} » ? Il ne pourra plus recevoir de nouvelles missions, mais son historique sera conservé.`
      )
    ) {
      return;
    }
    setErreurAction("");
    setSucces("");
    setEnCours(true);
    try {
      await api.patch(`${URL_SITES}${site.id}/`, { est_actif: actif });
      setSucces(actif ? "Le site est de nouveau suivi." : "Le site n'est plus suivi.");
      setVersion((v) => v + 1);
    } catch {
      setErreurAction("Le changement de statut a échoué. Réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  const retour = (
    <Link to="/sites" className="fs-retour" aria-label="Retour à la liste des sites">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
      Sites
    </Link>
  );

  if (chargement) {
    return (
      <div className="fs-page">
        {retour}
        <div className="fs-chargement">
          <span className="fs-spinner" aria-hidden="true" />
          Chargement de la fiche…
        </div>
      </div>
    );
  }

  if (erreur || !site) {
    return (
      <div className="fs-page">
        {retour}
        <div className="fs-erreur" role="alert">
          {erreur || "Impossible de charger la fiche du site."}
        </div>
      </div>
    );
  }

  const lienCarte = `https://www.openstreetmap.org/?mlat=${site.latitude}&mlon=${site.longitude}#map=16/${site.latitude}/${site.longitude}`;

  return (
    <div className="fs-page">
      {retour}

      <header className="fs-entete">
        <div>
          <h1 className="fs-titre">{site.nom}</h1>
          <p className="fs-sous-titre">{site.localisation}</p>
        </div>
        <div className="fs-actions">
          <span className={site.est_actif ? "fs-statut fs-statut-actif" : "fs-statut"}>
            {site.est_actif ? "Suivi" : "Non suivi"}
          </span>
          <button
            type="button"
            className="fs-bouton fs-bouton-principal"
            onClick={(e) => {
              setSucces("");
              setErreurAction("");
              setOrigine(origineDe(e.currentTarget));
            }}
          >
            Modifier
          </button>
          {site.est_actif ? (
            <button
              type="button"
              className="fs-bouton fs-bouton-danger"
              onClick={() => changerStatut(false)}
              disabled={enCours}
            >
              Désactiver
            </button>
          ) : (
            <button
              type="button"
              className="fs-bouton fs-bouton-secondaire"
              onClick={() => changerStatut(true)}
              disabled={enCours}
            >
              Réactiver
            </button>
          )}
        </div>
      </header>

      {erreurAction && (
        <div className="fs-erreur" role="alert">
          {erreurAction}
        </div>
      )}
      {succes && (
        <div className="fs-succes" role="status">
          {succes}
        </div>
      )}

      <section className="fs-carte" aria-labelledby="fs-titre-infos">
        <h2 id="fs-titre-infos" className="fs-section-titre">
          Informations
        </h2>
        <dl className="fs-infos">
          <div>
            <dt>Type de site</dt>
            <dd>{site.type_site_libelle}</dd>
          </div>
          <div>
            <dt>Partenaire</dt>
            <dd>{site.partenaire_nom || <span className="fs-absent">Non renseigné</span>}</dd>
          </div>
          <div>
            <dt>Position GPS</dt>
            <dd>
              {site.latitude}, {site.longitude}{" "}
              <a href={lienCarte} target="_blank" rel="noopener noreferrer">
                Voir sur la carte
              </a>
            </dd>
          </div>
          <div>
            <dt>Dernier contrôle</dt>
            <dd>
              {site.dernier_controle ? (
                formaterDate(site.dernier_controle)
              ) : (
                <span className="fs-absent">Jamais contrôlé</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Contrôles effectués</dt>
            <dd>{site.nombre_controles ?? 0}</dd>
          </div>
          <div>
            <dt>Non-conformités ouvertes</dt>
            <dd>
              <span
                className={
                  site.non_conformites_ouvertes
                    ? "fs-badge fs-badge-rouge"
                    : "fs-badge fs-badge-neutre"
                }
              >
                {site.non_conformites_ouvertes ?? 0}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="fs-carte" aria-labelledby="fs-titre-inventaire">
        <h2 id="fs-titre-inventaire" className="fs-section-titre">
          Inventaire <span className="fs-nombre">{site.elements.length}</span>
        </h2>
        {site.elements.length === 0 ? (
          <Vide>L'inventaire de ce site est vide. Il se remplit lors des contrôles.</Vide>
        ) : (
          <div className="fs-tableau-cadre">
            <table className="fs-tableau">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Ajouté le</th>
                </tr>
              </thead>
              <tbody>
                {site.elements.map((e) => (
                  <tr key={e.id}>
                    <td>{e.type}</td>
                    <td>{e.description}</td>
                    <td>{formaterDate(e.date_ajout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="fs-carte" aria-labelledby="fs-titre-missions">
        <h2 id="fs-titre-missions" className="fs-section-titre">
          Historique des missions <span className="fs-nombre">{missions.length}</span>
        </h2>
        {missions.length === 0 ? (
          <Vide>Aucune mission n'a encore été créée pour ce site.</Vide>
        ) : (
          <div className="fs-tableau-cadre">
            <table className="fs-tableau">
              <thead>
                <tr>
                  <th>Date prévue</th>
                  <th>Contrôleur</th>
                  <th>Statut</th>
                  <th>Terminée le</th>
                  <th>Rapport</th>
                  <th className="fs-colonne-nombre">Score</th>
                </tr>
              </thead>
              <tbody>
                {missions.map((m) => (
                  <tr key={m.id}>
                    <td>{formaterDate(m.date_prevue)}</td>
                    <td>{m.controleur_nom}</td>
                    <td>
                      <Badge ton={TON_MISSION[m.statut] ?? "neutre"}>{m.statut_libelle}</Badge>
                    </td>
                    <td>
                      {m.date_fin_reelle ? (
                        formaterDate(m.date_fin_reelle)
                      ) : (
                        <span className="fs-absent">—</span>
                      )}
                    </td>
                    <td>
                      {m.rapport_statut && m.rapport_statut_libelle ? (
                        <Badge ton={TON_RAPPORT[m.rapport_statut] ?? "neutre"}>
                          {m.rapport_statut_libelle}
                        </Badge>
                      ) : (
                        <span className="fs-absent">—</span>
                      )}
                    </td>
                    <td className="fs-colonne-nombre">
                      {m.score_conformite !== null ? (
                        `${Number(m.score_conformite)} %`
                      ) : (
                        <span className="fs-absent">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="fs-carte" aria-labelledby="fs-titre-nc">
        <h2 id="fs-titre-nc" className="fs-section-titre">
          Non-conformités <span className="fs-nombre">{nonConformites.length}</span>
        </h2>
        {nonConformites.length === 0 ? (
          <Vide>Aucune non-conformité n'a été relevée sur ce site.</Vide>
        ) : (
          <div className="fs-tableau-cadre">
            <table className="fs-tableau">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Gravité</th>
                  <th>Statut</th>
                  <th>Détectée le</th>
                  <th>À corriger avant le</th>
                </tr>
              </thead>
              <tbody>
                {nonConformites.map((n) => (
                  <tr key={n.id}>
                    <td className="fs-colonne-large">{n.description}</td>
                    <td>
                      <Badge ton={TON_GRAVITE[n.gravite] ?? "neutre"}>{n.gravite_libelle}</Badge>
                    </td>
                    <td>
                      <Badge ton={TON_NC[n.statut] ?? "neutre"}>{n.statut_libelle}</Badge>
                    </td>
                    <td>{formaterDate(n.date_detection)}</td>
                    <td>{formaterDate(n.date_limite_correction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {origine && (
        <PanneauIle
          titre="Modifier le site"
          sousTitre={site.nom}
          origine={origine}
          onFermer={fermerPanneau}
        >
          {(fermer) => (
            <div className="ile-vue">
              <FormulaireSite
                site={site}
                types={types}
                partenaires={partenaires}
                onEnvoyer={async (donnees) => {
                  await api.patch(`${URL_SITES}${site.id}/`, donnees);
                  fermer();
                  setSucces("Les modifications ont été enregistrées.");
                  setVersion((v) => v + 1);
                }}
                onAnnuler={fermer}
              />
            </div>
          )}
        </PanneauIle>
      )}
    </div>
  );
}