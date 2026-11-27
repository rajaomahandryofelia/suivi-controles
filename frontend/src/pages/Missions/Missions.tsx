import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import BoutonRetour from "../../components/BoutonRetour";
import Notification from "../../components/Notification";
import PanneauVerre from "../../components/PanneauVerre";
import type { Origine } from "../../components/PanneauIle";
import ServiceBadge from "../../components/ServiceBadge";
import type { Utilisateur } from "../../types";
import ClotureMission from "./ClotureMission";
import DetailMission from "./DetailMission";
import FicheMission from "./FicheMission";
import FormulaireGrille from "./FormulaireGrille";
import FormulaireAttribution from "./FormulaireAttribution";
import type { DonneesAttribution } from "./FormulaireAttribution";
import FormulaireMission from "./FormulaireMission";
import {
  SEGMENTS,
  correspond,
  creneauCourt,
  echeanceDe,
  formaterDate,
  formaterHeure,
  joursDeRetard,
  nomComplet,
  rangDe,
} from "./outils";
import { libelleOuverture, missionOuverte as grilleOuverte } from "./horaire";
import type { DonneesMission, Mission, ModePanneau, Modele, Site } from "./types";
import "./Missions.css";
import "./Horaire.css";
import "./Creneau.css";
import "./Grille.css";
import "./PageMissions.css";

interface EtatPanneau {
  mode: ModePanneau;
  mission?: Mission;
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

// Une ligne de la liste : une mission (un ou plusieurs sites) ou une ancienne mission isolée
interface Ligne {
  cle: string;
  // Représente toute la mission : mêmes date et contrôleur, état d'ensemble
  resume: Mission;
  membres: Mission[];
}

type MissionRangee = Mission & { ordre_dans_tournee?: number | null };

// Le service d'une mission à plusieurs sites : radio, télévision, ou les deux
function serviceDe(membres: Mission[]): string | undefined {
  const services = membres.map((m) => m.site_service).filter(Boolean);
  if (services.length === 0) return undefined;
  const radio = services.some((s) => s === "RADIO" || s === "RADIO_TELEVISION");
  const television = services.some((s) => s === "TELEVISION" || s === "RADIO_TELEVISION");
  if (radio && television) return "RADIO_TELEVISION";
  return radio ? "RADIO" : "TELEVISION";
}

// Réunit les sites d'une même mission : une seule ligne au lieu d'une par site
function regrouper(missions: Mission[]): Ligne[] {
  const parMission = new Map<number, MissionRangee[]>();
  const lignes: Ligne[] = [];

  for (const m of missions as MissionRangee[]) {
    if (m.tournee) {
      const liste = parMission.get(m.tournee) ?? [];
      liste.push(m);
      parMission.set(m.tournee, liste);
    } else {
      lignes.push({ cle: `m${m.id}`, resume: m, membres: [m] });
    }
  }

  parMission.forEach((membres, id) => {
    membres.sort((a, b) => (a.ordre_dans_tournee ?? 0) - (b.ordre_dans_tournee ?? 0));
    const premier = membres[0];
    const statuts = new Set(membres.map((m) => m.statut));

    // Même règle que le backend : toutes planifiées, toutes clôturées, sinon en cours
    let statut = "EN_COURS";
    let libelle = "En cours";
    if (statuts.size === 1 && statuts.has("PLANIFIEE")) {
      statut = "PLANIFIEE";
      libelle = "Planifiée";
    } else if (statuts.size === 1 && statuts.has("CLOTUREE")) {
      statut = "CLOTUREE";
      libelle = "Clôturée";
    }

    lignes.push({
      cle: `t${id}`,
      membres,
      resume: {
        ...premier,
        statut,
        statut_libelle: libelle,
        site_nom: membres.length > 1 ? `${membres.length} sites` : premier.site_nom,
        site_localisation: membres.map((m) => m.site_nom).join(" · "),
        site_service: serviceDe(membres),
      },
    });
  });

  return lignes;
}

export default function Missions() {
  const { estDirecteur } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Lien venant du registre « Ordres délivrés » : /missions?mission=ID
  const [parametres, setParametres] = useSearchParams();
  const missionDemandee = parametres.get("mission");
  // Lien venant du registre pour une mission à plusieurs sites : /missions?tournee=ID
  const tourneeDemandee = parametres.get("tournee");
  // Lien « Remplir la grille » de l'accueil du contrôleur : /missions?mission=ID&action=grille
  const actionDemandee = parametres.get("action");

  const [missions, setMissions] = useState<Mission[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [controleurs, setControleurs] = useState<Utilisateur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [segment, setSegment] = useState("");
  const [panneau, setPanneau] = useState<EtatPanneau | null>(null);
  const [notification, setNotification] = useState<EtatNotification | null>(null);

  const aujourdhui = new Date().toLocaleDateString("sv-SE");

  const notifier = useCallback((type: "succes" | "erreur", texte: string) => {
    setNotification({ cle: Date.now(), type, texte });
  }, []);
  const fermerNotification = useCallback(() => setNotification(null), []);
  const fermerPanneau = useCallback(() => setPanneau(null), []);

  // ---- Chargement des données (synchronisées avec le backend) ----

  const chargerMissions = useCallback(async (silencieux = false) => {
    try {
      const reponse = await api.get("/controles/missions/");
      setMissions(reponse.data);
      setErreur("");
    } catch {
      if (!silencieux) setErreur("Impossible de charger les missions.");
    } finally {
      if (!silencieux) setChargement(false);
    }
  }, []);

  const chargerReferentiels = useCallback(async () => {
    if (!estDirecteur) return;
    try {
      const [s, m, c] = await Promise.all([
        api.get("/referentiels/sites/"),
        api.get("/referentiels/modeles-grille/"),
        api.get("/auth/controleurs/"),
      ]);
      setSites((s.data as Site[]).filter((x) => x.est_actif));
      setModeles((m.data as Modele[]).filter((x) => x.est_actif));
      setControleurs(c.data);
    } catch {
      // Silencieux : la liste des missions reste utilisable
    }
  }, [estDirecteur]);

  useEffect(() => {
    chargerMissions();
    chargerReferentiels();
  }, [chargerMissions, chargerReferentiels]);

  // Rafraîchissement automatique : toutes les 30 s et au retour sur l'onglet
  useEffect(() => {
    const rafraichir = () => {
      if (document.visibilityState === "visible") chargerMissions(true);
    };
    const minuteur = window.setInterval(rafraichir, 30000);
    document.addEventListener("visibilitychange", rafraichir);
    window.addEventListener("focus", rafraichir);
    return () => {
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", rafraichir);
      window.removeEventListener("focus", rafraichir);
    };
  }, [chargerMissions]);

  // ---- Opérations (CRUD) ----

  // Une mission = un contrôleur, un créneau et un ou plusieurs sites, attribués en une action
  async function creer(donnees: DonneesAttribution) {
    await api.post("/controles/missions/attribuer/", donnees);
    const controleur = controleurs.find((c) => c.id === donnees.controleur);
    const nombre = donnees.etapes.length;
    notifier(
      "succes",
      `La mission de ${nombre} site${nombre > 1 ? "s" : ""} a été attribuée. ${
        controleur ? nomComplet(controleur) : "Le contrôleur"
      } a été notifié.`
    );
    await chargerMissions(true);
  }

  async function modifier(id: number, donnees: DonneesMission) {
    const reponse = await api.patch(`/controles/missions/${id}/`, donnees);
    notifier("succes", "La mission a été modifiée. Le contrôleur a été notifié.");
    setPanneau((p) => (p ? { ...p, mode: "voir", mission: reponse.data } : p));
    await chargerMissions(true);
  }

  async function supprimer(id: number) {
    await api.delete(`/controles/missions/${id}/`);
    notifier("succes", "La mission a été supprimée. Le contrôleur a été notifié.");
    await chargerMissions(true);
  }

  // ---- Panneau ----

  function ouvrir(mode: ModePanneau, origine: Origine, mission?: Mission) {
    if (mode === "creer" || mode === "modifier") chargerReferentiels();
    setPanneau({ mode, mission, origine });
  }

  function changerMode(mode: ModePanneau) {
    if (mode === "modifier") chargerReferentiels();
    setPanneau((p) => (p ? { ...p, mode } : p));
  }

  // Ouvre la grille ou la clôture d'un site précis de la mission affichée
  function choisirEtape(mode: ModePanneau, etape: Mission) {
    setPanneau((p) => (p ? { ...p, mode, mission: etape } : p));
  }

  function surTouche(e: KeyboardEvent<HTMLTableRowElement>, mission: Mission) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ouvrir("voir", origineDe(e.currentTarget), mission);
    }
  }

  // Arrivée depuis le tableau de bord (bouton « Nouvelle mission ») : le formulaire s'ouvre directement
  useEffect(() => {
    if (estDirecteur && (location.state as { creer?: boolean } | null)?.creer) {
      ouvrir("creer", { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      // On efface la demande : un rechargement de la page ne rouvre pas le formulaire
      navigate(location.pathname, { replace: true, state: null });
    }
    // Une seule fois, à l'arrivée sur la page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arrivée depuis le registre des ordres (/missions?mission=ID) : le détail de la mission s'ouvre
  useEffect(() => {
    if (chargement || (!missionDemandee && !tourneeDemandee)) return;
    // Le chargement a échoué : le message d'erreur de la page suffit, on garde le lien tel quel
    if (erreur) return;

    const id = Number(missionDemandee ?? tourneeDemandee);
    const trouvee = Number.isInteger(id)
      ? missionDemandee
        ? missions.find((m) => m.id === id)
        : missions.find((m) => m.tournee === id)
      : undefined;
    if (trouvee) {
      // Le contrôleur arrive pour remplir la grille : on l'ouvre directement si c'est possible
      const versGrille =
        actionDemandee === "grille" && !estDirecteur && trouvee.statut === "EN_COURS" && grilleOuverte(trouvee);
      ouvrir(versGrille ? "grille" : "voir", { x: window.innerWidth / 2, y: window.innerHeight / 2 }, trouvee);
    } else {
      notifier("erreur", "Cette mission est introuvable.");
    }
    // On retire le paramètre : un rechargement de la page ne rouvre pas la mission
    setParametres({}, { replace: true });
    // `ouvrir` change à chaque rendu : on ne réagit qu'aux données utiles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargement, erreur, missionDemandee, tourneeDemandee, actionDemandee, missions]);

  // La mission affichée dans le panneau suit toujours la dernière version reçue
  const missionOuverte = panneau?.mission
    ? missions.find((m) => m.id === panneau.mission?.id) ?? panneau.mission
    : undefined;

  let titrePanneau = "";
  let sousTitrePanneau: string | undefined;
  if (panneau?.mode === "creer") {
    titrePanneau = "Nouvelle mission";
    sousTitrePanneau = "Attribuez un ou plusieurs sites à un contrôleur, sur un même créneau";
  } else if (panneau?.mode === "modifier" && missionOuverte) {
    titrePanneau = "Modifier la mission";
    sousTitrePanneau = missionOuverte.site_nom;
  } else if (panneau?.mode === "grille" && missionOuverte) {
    titrePanneau = "Grille de contrôle";
    sousTitrePanneau = `${missionOuverte.site_nom} · ${missionOuverte.modele_grille_nom}`;
  } else if (panneau?.mode === "cloture" && missionOuverte) {
    titrePanneau = "Clôturer la mission";
    sousTitrePanneau = missionOuverte.site_nom;
  } else if (missionOuverte) {
    const heure = formaterHeure(missionOuverte.heure_prevue);
    const quand = `${formaterDate(missionOuverte.date_prevue)}${heure ? ` à ${heure}` : ""}`;
    if (missionOuverte.tournee) {
      // Une mission à un ou plusieurs sites : la fiche réunit tout
      titrePanneau = `Mission du ${quand}`;
      sousTitrePanneau = missionOuverte.controleur_nom;
    } else {
      titrePanneau = missionOuverte.site_nom;
      sousTitrePanneau = `Mission du ${quand}`;
    }
  }

  // ---- Filtrage et tri ----

  // Une ligne par mission : les sites d'une même mission sont réunis
  const lignes = useMemo(() => regrouper(missions), [missions]);

  const nombrePour = (valeur: string) =>
    lignes.filter((l) => correspond(l.resume, valeur, aujourdhui)).length;

  const visibles = lignes
    .filter((l) => correspond(l.resume, segment, aujourdhui))
    .sort((la, lb) => {
      const a = la.resume;
      const b = lb.resume;
      const ra = rangDe(a, aujourdhui);
      const rb = rangDe(b, aujourdhui);
      if (ra !== rb) return ra - rb;
      const heureA = a.heure_prevue ?? "";
      const heureB = b.heure_prevue ?? "";
      // Les clôturées : la plus récente en premier ; les autres : la plus ancienne d'abord
      return ra === 4
        ? b.date_prevue.localeCompare(a.date_prevue) || heureB.localeCompare(heureA)
        : a.date_prevue.localeCompare(b.date_prevue) || heureA.localeCompare(heureB);
    });

  const ilYADesRetards = nombrePour("RETARD") > 0;

  return (
    <div className="mis-page">
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <div className="entete-page">
        <h1>{estDirecteur ? "Missions" : "Mes missions"}</h1>
      </div>

      {erreur && (
        <div className="mpp-ile-zone">
          <div className="mpp-ile" role="alert">
            <span className="mpp-ile-point" aria-hidden="true" />
            <span className="mpp-ile-texte">{erreur}</span>
          </div>
        </div>
      )}

      {/* Pilule : filtres + bouton d'ajout (Directeur) */}
      <div className="mis-ilot-zone">
        <div className="mis-ilot" role="group" aria-label="Filtrer les missions">
          {SEGMENTS.map((s) => {
            const nombre = nombrePour(s.valeur);
            return (
              <button
                key={s.valeur}
                type="button"
                aria-pressed={segment === s.valeur}
                className={`mis-segment${segment === s.valeur ? " actif" : ""}`}
                onClick={() => setSegment(s.valeur)}
                title={`${nombre} mission${nombre > 1 ? "s" : ""}`}
              >
                {s.libelle}
                {s.valeur === "RETARD" && ilYADesRetards && (
                  <span className="mis-point" aria-label="Il y a des missions en retard" />
                )}
              </button>
            );
          })}

          {estDirecteur && (
            <>
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
                Nouvelle mission
              </button>
            </>
          )}
        </div>
      </div>

      {chargement ? (
        <div className="mis-chargement">
          <span className="mis-spinner" aria-hidden="true" />
          Chargement des missions…
        </div>
      ) : (
        <div className="mis-tableau-cadre">
          {visibles.length === 0 ? (
            <p className="mis-vide">
              {missions.length === 0
                ? estDirecteur
                  ? "Aucune mission pour l'instant. Cliquez sur « Nouvelle mission »."
                  : "Aucune mission ne vous est confiée pour l'instant."
                : "Aucune mission dans cette catégorie."}
            </p>
          ) : (
            <table className="mis-tableau">
              <thead>
                <tr>
                  <th>Date prévue</th>
                  <th>Site</th>
                  {estDirecteur && <th>Contrôleur</th>}
                  <th>Grille</th>
                  <th>Statut</th>
                  {!estDirecteur && <th>Action</th>}
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((l) => {
                  const m = l.resume;
                  const ech = echeanceDe(m, aujourdhui);
                  const jours = ech === "retard" ? joursDeRetard(m.date_prevue, aujourdhui) : 0;
                  const creneau = creneauCourt(m);
                  return (
                    <tr
                      key={l.cle}
                      className={ech === "retard" || ech === "aujourdhui" ? ech : ""}
                      tabIndex={0}
                      onClick={(e) => ouvrir("voir", { x: e.clientX, y: e.clientY }, m)}
                      onKeyDown={(e) => surTouche(e, m)}
                    >
                      <td className="mis-date">
                        <span className="mis-date-texte">{formaterDate(m.date_prevue)}</span>
                        {creneau && <span className="mis-heure">{creneau}</span>}
                        {ech === "retard" && (
                          <span className="mis-echeance retard">
                            En retard de {jours} jour{jours > 1 ? "s" : ""}
                          </span>
                        )}
                        {ech === "aujourdhui" && (
                          <span className="mis-echeance aujourdhui">Aujourd'hui</span>
                        )}
                      </td>
                      <td className="mis-site">
                        <strong>{m.site_nom}</strong>
                        <span>{m.site_localisation}</span>
                        <ServiceBadge service={m.site_service} />
                      </td>
                      {estDirecteur && <td>{m.controleur_nom}</td>}
                      <td>{l.membres.length > 1 ? "Selon le site" : m.modele_grille_nom}</td>
                      <td>
                        <span className={`mis-statut ${m.statut}`}>{m.statut_libelle}</span>
                      </td>
                      {!estDirecteur && (
                        <td>
                          {m.statut === "PLANIFIEE" && (
                            <span className="mis-ouverture">{libelleOuverture(m)}</span>
                          )}
                          {m.statut === "EN_COURS" && grilleOuverte(m) && (
                            <button
                              type="button"
                              className="bouton"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Un seul site : la grille s'ouvre directement ; sinon la fiche de la mission
                                if (l.membres.length === 1) {
                                  ouvrir("grille", origineDe(e.currentTarget), l.membres[0]);
                                } else {
                                  ouvrir("voir", origineDe(e.currentTarget), m);
                                }
                              }}
                            >
                              {l.membres.length === 1 ? "Remplir la grille" : "Ouvrir la mission"}
                            </button>
                          )}
                        </td>
                      )}
                      <td className="mis-chevron" aria-hidden="true">
                        ›
                      </td>
                    </tr>
                  );
                })}
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
                <FormulaireAttribution
                  sites={sites}
                  modeles={modeles}
                  controleurs={controleurs}
                  aujourdhui={aujourdhui}
                  onEnvoyer={async (donnees) => {
                    await creer(donnees);
                    fermer();
                  }}
                  onAnnuler={fermer}
                />
              )}

              {panneau.mode === "modifier" && missionOuverte && (
                <FormulaireMission
                  mission={missionOuverte}
                  sites={sites}
                  modeles={modeles}
                  controleurs={controleurs}
                  aujourdhui={aujourdhui}
                  onEnvoyer={(donnees) => modifier(missionOuverte.id, donnees)}
                  onAnnuler={() => changerMode("voir")}
                />
              )}

              {panneau.mode === "voir" && missionOuverte && missionOuverte.tournee && (
                <FicheMission
                  tourneeId={missionOuverte.tournee}
                  estDirecteur={estDirecteur}
                  onRemplir={(etape) => choisirEtape("grille", etape)}
                  onCloturer={(etape) => choisirEtape("cloture", etape)}
                  onNotifier={notifier}
                  onChange={() => chargerMissions(true)}
                  onFermer={fermer}
                />
              )}

              {panneau.mode === "voir" && missionOuverte && !missionOuverte.tournee && (
                <DetailMission
                  mission={missionOuverte}
                  estDirecteur={estDirecteur}
                  aujourdhui={aujourdhui}
                  onRemplir={() => changerMode("grille")}
                  onCloturer={() => changerMode("cloture")}
                  onModifier={() => changerMode("modifier")}
                  onSupprimer={async () => {
                    await supprimer(missionOuverte.id);
                    fermer();
                  }}
                  onFermer={fermer}
                  onNotifier={notifier}
                  onActualiser={() => chargerMissions(true)}
                />
              )}

              {panneau.mode === "grille" && missionOuverte && (
                <FormulaireGrille
                  mission={missionOuverte}
                  onNotifier={notifier}
                  onRetour={() => changerMode("voir")}
                  onCloturer={() => changerMode("cloture")}
                />
              )}

              {panneau.mode === "cloture" && missionOuverte && (
                <ClotureMission
                  mission={missionOuverte}
                  onNotifier={notifier}
                  onRetour={() => changerMode("voir")}
                  onRemplir={() => changerMode("grille")}
                  onTerminee={() => chargerMissions(true)}
                  onFermer={fermer}
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