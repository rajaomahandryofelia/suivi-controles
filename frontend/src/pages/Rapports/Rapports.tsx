import { useCallback, useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import BoutonRetour from "../../components/BoutonRetour";
import Notification from "../../components/Notification";
import PanneauVerre from "../../components/PanneauVerre";
import type { Origine } from "../../components/PanneauIle";
import "./Rapports.css";
import "./PageRapports.css";

type StatutRapport = "GENERE" | "VALIDE" | "REJETE";

interface Rapport {
  id: number;
  mission: number;
  site: number;
  site_nom: string;
  controleur_nom: string;
  date_mission: string;
  date_generation: string;
  fichier_pdf: string;
  score_conformite: string | number;
  statut: StatutRapport;
  statut_libelle: string;
  motif_rejet: string;
  date_validation: string | null;
  directeur: number | null;
}

interface EtatPanneau {
  mode: "voir" | "rejeter";
  id: number;
  origine: Origine;
}

interface EtatNotification {
  cle: number;
  type: "succes" | "erreur";
  texte: string;
}

const LIBELLES: Record<StatutRapport, string> = {
  GENERE: "En attente de validation",
  VALIDE: "Validé",
  REJETE: "Rejeté",
};

// ---- Petits outils ----

function formaterDate(valeur: string | null, avecHeure = false): string {
  if (!valeur) return "-";
  // Une date seule (AAAA-MM-JJ) est lue à minuit, heure locale
  const date = new Date(valeur.length === 10 ? `${valeur}T00:00:00` : valeur);
  if (Number.isNaN(date.getTime())) return "-";
  return avecHeure
    ? date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
    : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function niveauScore(score: number): "bon" | "moyen" | "faible" {
  if (score >= 80) return "bon";
  if (score >= 50) return "moyen";
  return "faible";
}

function formaterScore(valeur: string | number): string {
  return `${Number(valeur).toFixed(2).replace(".", ",")} %`;
}

function messageErreur(e: unknown, defaut: string): string {
  const donnees = (e as { response?: { data?: unknown } })?.response?.data;
  if (donnees && typeof donnees === "object") {
    const d = donnees as Record<string, unknown>;
    if (typeof d.detail === "string") return d.detail;
    const premier = Object.values(d)[0];
    if (Array.isArray(premier) && typeof premier[0] === "string") return premier[0];
  }
  return defaut;
}

// Centre d'un élément : point de départ de l'animation du panneau
function origineDe(el: Element): Origine {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ---- Page ----

export default function Rapports() {
  const { estDirecteur } = useAuth();
  const navigate = useNavigate();

  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [segment, setSegment] = useState("");
  const [panneau, setPanneau] = useState<EtatPanneau | null>(null);
  const [notification, setNotification] = useState<EtatNotification | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [motif, setMotif] = useState("");
  const [erreurMotif, setErreurMotif] = useState("");

  const notifier = useCallback((type: "succes" | "erreur", texte: string) => {
    setNotification({ cle: Date.now(), type, texte });
  }, []);
  const fermerNotification = useCallback(() => setNotification(null), []);
  const fermerPanneau = useCallback(() => setPanneau(null), []);

  // ---- Chargement (synchronisé avec le backend) ----

  const charger = useCallback(async (silencieux = false) => {
    try {
      const reponse = await api.get("/controles/rapports/");
      setRapports(reponse.data);
      setErreur("");
    } catch {
      if (!silencieux) setErreur("Impossible de charger les rapports.");
    } finally {
      if (!silencieux) setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // Rafraîchissement automatique : toutes les 30 s et au retour sur l'onglet
  useEffect(() => {
    const rafraichir = () => {
      if (document.visibilityState === "visible") charger(true);
    };
    const minuteur = window.setInterval(rafraichir, 30000);
    document.addEventListener("visibilitychange", rafraichir);
    window.addEventListener("focus", rafraichir);
    return () => {
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", rafraichir);
      window.removeEventListener("focus", rafraichir);
    };
  }, [charger]);

  // ---- Actions du Directeur ----

  async function valider(rapport: Rapport) {
    setEnCours(true);
    try {
      const reponse = await api.post(`/controles/rapports/${rapport.id}/valider/`);
      const score = reponse.data?.score;
      notifier(
        "succes",
        score
          ? `Le rapport est validé. Score du site : ${score.valeur} (${score.niveau_libelle}).`
          : "Le rapport est validé."
      );
      await charger(true);
    } catch (e) {
      notifier("erreur", messageErreur(e, "Le rapport n'a pas pu être validé."));
    } finally {
      setEnCours(false);
    }
  }

  async function rejeter(evenement: FormEvent, rapport: Rapport) {
    evenement.preventDefault();
    const texte = motif.trim();
    if (!texte) {
      setErreurMotif("Le motif est obligatoire pour rejeter un rapport.");
      return;
    }
    setEnCours(true);
    try {
      await api.post(`/controles/rapports/${rapport.id}/rejeter/`, { motif: texte });
      notifier("succes", "Le rapport est rejeté. La mission repasse en cours et le contrôleur est prévenu.");
      setMotif("");
      setPanneau((p) => (p ? { ...p, mode: "voir" } : p));
      await charger(true);
    } catch (e) {
      setErreurMotif(messageErreur(e, "Le rapport n'a pas pu être rejeté."));
    } finally {
      setEnCours(false);
    }
  }

  // ---- Panneau ----

  function ouvrir(rapport: Rapport, origine: Origine) {
    setMotif("");
    setErreurMotif("");
    setPanneau({ mode: "voir", id: rapport.id, origine });
  }

  function surTouche(e: KeyboardEvent<HTMLTableRowElement>, rapport: Rapport) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ouvrir(rapport, origineDe(e.currentTarget));
    }
  }

  const rapportOuvert = panneau ? rapports.find((r) => r.id === panneau.id) : undefined;

  // ---- Filtrage et tri ----

  const segments = [
    { valeur: "", libelle: "Tous" },
    { valeur: "GENERE", libelle: estDirecteur ? "À traiter" : "En attente" },
    { valeur: "VALIDE", libelle: "Validés" },
    { valeur: "REJETE", libelle: "Rejetés" },
  ];

  const nombrePour = (valeur: string) =>
    valeur ? rapports.filter((r) => r.statut === valeur).length : rapports.length;

  // Le Directeur voit d'abord ce qu'il doit traiter ; le contrôleur, ce qu'on lui a rejeté
  const rang = (r: Rapport) => {
    const ordre: StatutRapport[] = estDirecteur
      ? ["GENERE", "REJETE", "VALIDE"]
      : ["REJETE", "GENERE", "VALIDE"];
    return ordre.indexOf(r.statut);
  };

  const visibles = rapports
    .filter((r) => !segment || r.statut === segment)
    .sort((a, b) => rang(a) - rang(b) || b.date_generation.localeCompare(a.date_generation));

  const nombreATraiter = nombrePour("GENERE");
  const nombreRejetes = nombrePour("REJETE");

  return (
    <div className="rap-page">
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <div className="entete-page">
        <h1>{estDirecteur ? "Rapports" : "Mes rapports"}</h1>
      </div>

      {erreur && (
        <div className="rpp-ile-zone">
          <div className="rpp-ile" role="alert">
            <span className="rpp-ile-point" aria-hidden="true" />
            <span className="rpp-ile-texte">{erreur}</span>
          </div>
        </div>
      )}

      {/* Pilule : filtres par statut */}
      <div className="rap-ilot-zone">
        <div className="rap-ilot" role="group" aria-label="Filtrer les rapports">
          {segments.map((s) => {
            const nombre = nombrePour(s.valeur);
            const pastille =
              (s.valeur === "GENERE" && estDirecteur && nombreATraiter > 0) ||
              (s.valeur === "REJETE" && !estDirecteur && nombreRejetes > 0);
            return (
              <button
                key={s.valeur || "tous"}
                type="button"
                aria-pressed={segment === s.valeur}
                className={`rap-segment${segment === s.valeur ? " actif" : ""}`}
                onClick={() => setSegment(s.valeur)}
                title={`${nombre} rapport${nombre > 1 ? "s" : ""}`}
              >
                {s.libelle}
                {pastille && (
                  <span
                    className={`rap-point ${s.valeur === "REJETE" ? "rouge" : "ambre"}`}
                    aria-label={s.valeur === "REJETE" ? "Des rapports ont été rejetés" : "Des rapports attendent une décision"}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {chargement ? (
        <div className="rap-chargement">
          <span className="rap-spinner" aria-hidden="true" />
          Chargement des rapports…
        </div>
      ) : (
        <div className="rap-cadre">
          {visibles.length === 0 ? (
            <p className="rap-vide">
              {rapports.length === 0
                ? estDirecteur
                  ? "Aucun rapport pour l'instant. Ils apparaissent dès qu'un contrôleur clôture une mission."
                  : "Aucun rapport pour l'instant. Il est généré quand vous clôturez une mission."
                : "Aucun rapport dans cette catégorie."}
            </p>
          ) : (
            <table className="rap-tableau">
              <thead>
                <tr>
                  <th>Mission</th>
                  <th>Site</th>
                  {estDirecteur && <th>Contrôleur</th>}
                  <th>Score</th>
                  <th>Statut</th>
                  <th>PDF</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => (
                  <tr
                    key={r.id}
                    className={
                      r.statut === "GENERE" && estDirecteur
                        ? "a-traiter"
                        : r.statut === "REJETE"
                          ? "rejete"
                          : ""
                    }
                    tabIndex={0}
                    onClick={(e) => ouvrir(r, { x: e.clientX, y: e.clientY })}
                    onKeyDown={(e) => surTouche(e, r)}
                  >
                    <td className="rap-date">
                      <span>{formaterDate(r.date_mission)}</span>
                      <small>Rapport du {formaterDate(r.date_generation, true)}</small>
                    </td>
                    <td className="rap-site">
                      <strong>{r.site_nom}</strong>
                      {r.statut === "REJETE" && r.motif_rejet && (
                        <span className="rap-motif">Motif : {r.motif_rejet}</span>
                      )}
                    </td>
                    {estDirecteur && <td>{r.controleur_nom || "-"}</td>}
                    <td>
                      <span className={`rap-score ${niveauScore(Number(r.score_conformite))}`}>
                        {formaterScore(r.score_conformite)}
                      </span>
                    </td>
                    <td>
                      <span className={`rap-statut ${r.statut}`}>{LIBELLES[r.statut]}</span>
                    </td>
                    <td>
                      <a
                        className="rap-lien-pdf"
                        href={r.fichier_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Voir le PDF
                      </a>
                    </td>
                    <td className="rap-chevron" aria-hidden="true">
                      ›
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {estDirecteur && !chargement && nombreATraiter > 0 && (
        <p className="rap-note">
          {nombreATraiter} rapport{nombreATraiter > 1 ? "s" : ""} en attente de votre décision.
        </p>
      )}

      {panneau && rapportOuvert && (
        <PanneauVerre
          titre={panneau.mode === "rejeter" ? "Rejeter le rapport" : rapportOuvert.site_nom}
          sousTitre={
            panneau.mode === "rejeter"
              ? rapportOuvert.site_nom
              : `Mission du ${formaterDate(rapportOuvert.date_mission)}`
          }
          origine={panneau.origine}
          onFermer={fermerPanneau}
        >
          {(fermer) => (
            <div className="ile-vue" key={panneau.mode}>
              {panneau.mode === "voir" && (
                <DetailRapport
                  rapport={rapportOuvert}
                  estDirecteur={estDirecteur}
                  enCours={enCours}
                  onValider={() => valider(rapportOuvert)}
                  onRejeter={() => {
                    setMotif("");
                    setErreurMotif("");
                    setPanneau((p) => (p ? { ...p, mode: "rejeter" } : p));
                  }}
                  onReprendre={() => navigate("/missions")}
                  onFermer={fermer}
                />
              )}

              {panneau.mode === "rejeter" && (
                <form
                  className="rap-formulaire"
                  noValidate
                  onSubmit={(e) => rejeter(e, rapportOuvert)}
                >
                  <label htmlFor="rap-motif">Motif du rejet</label>
                  <textarea
                    id="rap-motif"
                    rows={5}
                    maxLength={500}
                    value={motif}
                    placeholder="Expliquez au contrôleur ce qui doit être corrigé."
                    onChange={(e) => {
                      setMotif(e.target.value);
                      setErreurMotif("");
                    }}
                    aria-invalid={erreurMotif ? true : undefined}
                  />
                  <p className="rap-aide">
                    {motif.length}/500 · La mission repasse en cours : le contrôleur voit ce motif, corrige, puis clôture de nouveau.
                  </p>
                  {erreurMotif && (
                    <p className="rap-erreur" role="alert">
                      {erreurMotif}
                    </p>
                  )}
                  <div className="rap-actions">
                    <button
                      type="button"
                      className="bouton rap-secondaire"
                      disabled={enCours}
                      onClick={() => setPanneau((p) => (p ? { ...p, mode: "voir" } : p))}
                    >
                      Annuler
                    </button>
                    <button type="submit" className="bouton rap-rejet" disabled={enCours}>
                      {enCours ? "Envoi…" : "Rejeter le rapport"}
                    </button>
                  </div>
                </form>
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

// ---- Contenu du panneau : consulter un rapport ----

interface PropsDetail {
  rapport: Rapport;
  estDirecteur: boolean;
  enCours: boolean;
  onValider: () => void;
  onRejeter: () => void;
  onReprendre: () => void;
  onFermer: () => void;
}

function DetailRapport({
  rapport,
  estDirecteur,
  enCours,
  onValider,
  onRejeter,
  onReprendre,
  onFermer,
}: PropsDetail) {
  const peutTraiter = estDirecteur && rapport.statut === "GENERE";
  const score = Number(rapport.score_conformite);

  return (
    <div>
      <div className="rap-badges">
        <span className={`rap-statut ${rapport.statut}`}>{LIBELLES[rapport.statut]}</span>
      </div>

      {rapport.statut === "REJETE" && rapport.motif_rejet && (
        <div className="rap-alerte-rejet" role="note">
          <strong>Motif du rejet</strong>
          <p>{rapport.motif_rejet}</p>
        </div>
      )}

      <dl className="rap-infos">
        <div className="rap-info">
          <dt>Score de conformité</dt>
          <dd>
            <span className={`rap-score gros ${niveauScore(score)}`}>
              {formaterScore(rapport.score_conformite)}
            </span>
          </dd>
        </div>
        <div className="rap-info">
          <dt>Contrôleur</dt>
          <dd>{rapport.controleur_nom || "-"}</dd>
        </div>
        <div className="rap-info">
          <dt>Mission du</dt>
          <dd>{formaterDate(rapport.date_mission)}</dd>
        </div>
        <div className="rap-info">
          <dt>Rapport généré le</dt>
          <dd>{formaterDate(rapport.date_generation, true)}</dd>
        </div>
        {rapport.statut !== "GENERE" && (
          <div className="rap-info large">
            <dt>{rapport.statut === "VALIDE" ? "Validé le" : "Rejeté le"}</dt>
            <dd>{formaterDate(rapport.date_validation)}</dd>
          </div>
        )}
      </dl>

      <div className="rap-actions">
        <a
          className="bouton rap-pdf"
          href={rapport.fichier_pdf}
          target="_blank"
          rel="noopener noreferrer"
        >
          Voir le PDF
        </a>
        {!estDirecteur && rapport.statut === "REJETE" && (
          <button type="button" className="bouton" onClick={onReprendre}>
            Reprendre la mission
          </button>
        )}
        {peutTraiter && (
          <>
            <button
              type="button"
              className="bouton rap-rejet"
              disabled={enCours}
              onClick={onRejeter}
            >
              Rejeter
            </button>
            <button type="button" className="bouton" disabled={enCours} onClick={onValider}>
              {enCours ? "Validation…" : "Valider le rapport"}
            </button>
          </>
        )}
        <button type="button" className="bouton rap-secondaire" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </div>
  );
}