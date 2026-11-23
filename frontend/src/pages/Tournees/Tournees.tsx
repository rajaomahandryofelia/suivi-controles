import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import api from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import BoutonRetour from "../../components/BoutonRetour";
import Notification from "../../components/Notification";
import PanneauVerre from "../../components/PanneauVerre";
import type { Origine } from "../../components/PanneauIle";
import type { Utilisateur } from "../../types";
import { formaterDate, lienCarte, messagesErreur, nomComplet } from "../Missions/outils";
import { extraireListe } from "../outilsListe";
import TelechargerOrdres from "./TelechargerOrdres";
import "../Liste.css";
import "./Tournees.css";
import "./PageTournees.css";

const URL_TOURNEES = "/controles/tournees/";

type Appartenance = "MINISTERE" | "HORS_MINISTERE";

interface CarteProfessionnelle {
  numero: string;
  date_expiration: string;
  valide: boolean; // calculé par le backend pour la date de la tournée
}

interface OrdreMission {
  numero: string;
  date_emission: string;
}

interface OrdreRoute {
  numero: string;
  depart: string;
  destination: string;
  transport: string;
}

interface Etape {
  rang: number;
  mission: number;
  site: number;
  site_nom: string;
  site_localisation: string;
  appartenance?: Appartenance | null;
  latitude: string;
  longitude: string;
  risque: number | null;
  niveau: string | null;
  niveau_libelle: string | null;
  distance_depuis_precedent_km: number | null;
  explication: string;
}

interface Tournee {
  id: number;
  date: string;
  statut: "PROPOSEE" | "VALIDEE";
  statut_libelle: string;
  controleur: number;
  controleur_nom: string;
  distance_estimee_km: string;
  duree_estimee_min: number;
  distance_reference_km: number;
  etapes: Etape[];
  carte_professionnelle?: CarteProfessionnelle | null;
  ordre_mission?: OrdreMission | null;
  ordre_route?: OrdreRoute | null;
}

interface DonneesRoute {
  depart: string;
  transport: string;
}

// Ce qu'on retient d'une mission pour savoir combien de sites peuvent être regroupés
interface MissionPlanifiee {
  id: number;
  controleur: number;
  date_prevue: string;
  tournee?: number | null;
}

interface EtatNotification {
  cle: number;
  type: "succes" | "erreur";
  texte: string;
}

interface EtatPanneau {
  mode: "planifier" | "voir";
  id?: number;
  origine: Origine;
}

const SEGMENTS: { valeur: string; libelle: string }[] = [
  { valeur: "", libelle: "Toutes" },
  { valeur: "PROPOSEE", libelle: "Proposées" },
  { valeur: "VALIDEE", libelle: "Validées" },
];

// Centre d'un élément : point de départ de l'animation du panneau
function origineDe(el: Element): Origine {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ---------- Icônes (SVG intégrés : aucune dépendance) ----------

type NomIcone =
  | "route" | "calendar" | "user" | "check" | "clock" | "pin" | "search" | "card"
  | "file" | "road" | "x" | "chevron" | "alert" | "list" | "map" | "inbox";

const CHEMINS: Record<NomIcone, ReactNode> = {
  route: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16a3 3 0 0 1 6 0M14 10h4M14 14h4" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  road: <path d="M5 21 9 3M19 21 15 3M12 4v3M12 11v3M12 18v3" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  alert: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
    </>
  ),
};

function Icone({ nom, taille = 18 }: { nom: NomIcone; taille?: number }) {
  return (
    <svg
      className="tou-icone"
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CHEMINS[nom]}
    </svg>
  );
}

// ---------- Utilitaires d'affichage ----------

function km(valeur: number | string) {
  return `${Number(valeur).toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

function dureeMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

// Ce que l'algorithme change par rapport à l'ordre chronologique des missions
function texteEcart(tournee: Tournee): { texte: string; ton: "mieux" | "pire" | "neutre" } | null {
  const reference = tournee.distance_reference_km;
  const reel = Number(tournee.distance_estimee_km);
  if (!(reference > 0.05)) return null;

  const ecart = reel - reference;
  const pourcentage = Math.abs((ecart / reference) * 100);
  if (Math.abs(ecart) < 0.05) {
    return { texte: "Même distance que l'ordre chronologique des missions.", ton: "neutre" };
  }
  if (ecart < 0) {
    return {
      texte: `${km(Math.abs(ecart))} de moins que l'ordre chronologique des missions (−${pourcentage.toFixed(0)} %).`,
      ton: "mieux",
    };
  }
  return {
    texte: `${km(ecart)} de plus que l'ordre chronologique (+${pourcentage.toFixed(0)} %) : les sites les plus risqués passent en premier.`,
    ton: "pire",
  };
}

function BadgeStatut({ tournee }: { tournee: Tournee }) {
  return (
    <span className={`tou-statut tou-statut-${tournee.statut.toLowerCase()}`}>
      <span className="tou-statut-point" aria-hidden="true" />
      {tournee.statut_libelle}
    </span>
  );
}

// ---------- Dossier officiel du contrôleur ----------

type EtatPiece = "ok" | "manquant" | "expire" | "attente";

const LIBELLE_ETAT: Record<EtatPiece, string> = {
  ok: "Valide",
  manquant: "Manquant",
  expire: "Expirée",
  attente: "En attente",
};

function Piece({
  icone,
  etat,
  libelle,
  titre,
  detail,
}: {
  icone: NomIcone;
  etat: EtatPiece;
  libelle?: string;
  titre: string;
  detail: string;
}) {
  return (
    <li className={`tou-piece ${etat}`}>
      <span className="tou-piece-icone">
        <Icone nom={icone} />
      </span>
      <div className="tou-piece-texte">
        <strong>{titre}</strong>
        <span>{detail}</span>
      </div>
      <span className={`tou-piece-etat ${etat}`}>{libelle ?? LIBELLE_ETAT[etat]}</span>
    </li>
  );
}

function PiecesOfficielles({ tournee }: { tournee: Tournee }) {
  const carte = tournee.carte_professionnelle;
  const ordreMission = tournee.ordre_mission;
  const ordreRoute = tournee.ordre_route;
  const proposee = tournee.statut === "PROPOSEE";
  // Avant validation, un ordre non délivré n'est pas une erreur : il est simplement en attente
  const etatOrdre = (delivre: boolean): EtatPiece => (delivre ? "ok" : proposee ? "attente" : "manquant");
  const aDelivrer = proposee ? "À délivrer à la validation" : "Non délivré";

  const etatCarte: EtatPiece = !carte ? "manquant" : carte.valide ? "ok" : "expire";

  return (
    <ul className="tou-pieces" aria-label="Dossier officiel">
      <Piece
        icone="card"
        etat={etatCarte}
        libelle={etatCarte === "expire" ? "Non valide" : undefined}
        titre="Carte professionnelle"
        detail={
          !carte
            ? "Aucune carte enregistrée pour ce contrôleur"
            : carte.valide
              ? `N° ${carte.numero} · valable jusqu'au ${formaterDate(carte.date_expiration)}`
              : `N° ${carte.numero} · expirée ou non valable le jour de la tournée (${formaterDate(carte.date_expiration)})`
        }
      />
      <Piece
        icone="file"
        etat={etatOrdre(!!ordreMission)}
        libelle={ordreMission ? "Délivré" : undefined}
        titre="Ordre de mission"
        detail={ordreMission ? `N° ${ordreMission.numero}` : aDelivrer}
      />
      <Piece
        icone="road"
        etat={etatOrdre(!!ordreRoute)}
        libelle={ordreRoute ? "Délivré" : undefined}
        titre="Ordre de route"
        detail={
          ordreRoute
            ? `N° ${ordreRoute.numero} · ${ordreRoute.depart} → ${ordreRoute.destination} (${ordreRoute.transport})`
            : aDelivrer
        }
      />
    </ul>
  );
}

// ---------- Détail d'une tournée (dans le panneau) ----------

interface DetailProps {
  tournee: Tournee;
  estDirecteur: boolean;
  enCours: boolean;
  onValider: (route: DonneesRoute) => void;
  onRefuser: () => void;
}

function Condition({ ok, texte }: { ok: boolean; texte: string }) {
  return (
    <li className={ok ? "ok" : "ko"}>
      <Icone nom={ok ? "check" : "x"} taille={14} />
      {texte}
    </li>
  );
}

function DetailTournee({ tournee, estDirecteur, enCours, onValider, onRefuser }: DetailProps) {
  const [confirmation, setConfirmation] = useState(false);
  const [depart, setDepart] = useState("");
  const [transport, setTransport] = useState("");

  const ecart = texteEcart(tournee);
  const proposee = tournee.statut === "PROPOSEE";
  const peutDecider = estDirecteur && proposee;
  const carteOk = !!tournee.carte_professionnelle?.valide;
  const departOk = depart.trim() !== "";
  const transportOk = transport.trim() !== "";
  const peutValider = carteOk && departOk && transportOk;

  return (
    <section className="tou-detail" aria-label="Détail de la tournée">
      <div className="tou-badges">
        <BadgeStatut tournee={tournee} />
      </div>

      <div className="tou-resume">
        <div className="tou-indicateur">
          <Icone nom="pin" />
          <div>
            <strong>{tournee.etapes.length}</strong>
            <span>site{tournee.etapes.length > 1 ? "s" : ""} à contrôler</span>
          </div>
        </div>
        <div className="tou-indicateur">
          <Icone nom="map" />
          <div>
            <strong>{km(tournee.distance_estimee_km)}</strong>
            <span>entre les sites</span>
          </div>
        </div>
        <div className="tou-indicateur">
          <Icone nom="clock" />
          <div>
            <strong>{dureeMinutes(tournee.duree_estimee_min)}</strong>
            <span>trajets et contrôles</span>
          </div>
        </div>
      </div>

      {peutDecider && !carteOk && (
        <p className="tou-alerte" role="alert">
          <Icone nom="alert" />
          Validation impossible : la carte professionnelle du contrôleur est absente ou expirée.
        </p>
      )}

      <div className="tou-colonnes">
        {/* ---- Itinéraire ---- */}
        <div className="tou-colonne">
          <h3 className="tou-colonne-titre">
            <Icone nom="route" taille={16} /> Itinéraire
          </h3>

          {ecart && <p className={`tou-ecart tou-ecart-${ecart.ton}`}>{ecart.texte}</p>}

          <ol className="tou-timeline">
            {tournee.etapes.map((e) => (
              <li key={e.mission} className="tou-etape">
                <span className="tou-rang">{e.rang}</span>
                <div className="tou-etape-carte">
                  <div className="tou-etape-tete">
                    <strong>{e.site_nom}</strong>
                    <span className="tou-etape-badges">
                      {e.appartenance && (
                        <span
                          className={`tou-type-site ${e.appartenance === "MINISTERE" ? "ministere" : "hors"}`}
                        >
                          {e.appartenance === "MINISTERE" ? "Ministère" : "Hors ministère"}
                        </span>
                      )}
                      {e.niveau && e.risque !== null ? (
                        <span className={`tou-risque tou-risque-${e.niveau.toLowerCase()}`}>
                          {e.niveau_libelle} · {Math.round(e.risque)}
                        </span>
                      ) : (
                        <span className="tou-risque tou-risque-inconnu">Risque non calculé</span>
                      )}
                    </span>
                  </div>
                  <p className="tou-etape-lieu">
                    <Icone nom="pin" taille={14} /> {e.site_localisation}
                  </p>
                  <p className="tou-etape-explication">{e.explication}</p>
                  <p className="tou-etape-meta">
                    <span>
                      {e.distance_depuis_precedent_km !== null
                        ? `${km(e.distance_depuis_precedent_km)} depuis le site précédent`
                        : "Point de départ"}
                    </span>
                    <a href={lienCarte(e.latitude, e.longitude)} target="_blank" rel="noopener noreferrer">
                      <Icone nom="map" taille={14} /> Voir sur la carte
                    </a>
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <details className="tou-methode">
            <summary>Comment l'ordre est choisi</summary>
            <p>
              On part du site le plus risqué de la journée. À chaque étape, on va vers le site qui combine
              le mieux proximité et risque : un site risqué paraît « plus proche » qu'il ne l'est, donc il
              passe plus tôt. Les distances sont à vol d'oiseau (formule de Haversine). La vitesse moyenne,
              la durée d'un contrôle et l'influence du risque se règlent dans les paramètres du score.
            </p>
          </details>
        </div>

        {/* ---- Dossier officiel ---- */}
        <div className="tou-colonne">
          <h3 className="tou-colonne-titre">
            <Icone nom="file" taille={16} /> Dossier officiel
          </h3>

          <PiecesOfficielles tournee={tournee} />

          <TelechargerOrdres
            tourneeId={tournee.id}
            aOrdreMission={!!tournee.ordre_mission}
            aOrdreRoute={!!tournee.ordre_route}
          />

          {peutDecider && !confirmation && (
            <fieldset className="tou-route-form" disabled={enCours}>
              <legend>Ordre de route</legend>
              <p>La destination sera le premier site de la tournée.</p>
              <div className="tou-route-champs">
                <label className="tou-champ">
                  <span>
                    Point de départ <em aria-hidden="true">*</em>
                  </span>
                  <input
                    value={depart}
                    onChange={(e) => setDepart(e.target.value)}
                    placeholder="Ex. Antananarivo, ORTM Anosy"
                    required
                  />
                </label>
                <label className="tou-champ">
                  <span>
                    Moyen de transport <em aria-hidden="true">*</em>
                  </span>
                  <input
                    value={transport}
                    onChange={(e) => setTransport(e.target.value)}
                    placeholder="Ex. Véhicule de service"
                    required
                  />
                </label>
              </div>
              <ul className="tou-conditions" aria-label="Conditions de validation">
                <Condition ok={carteOk} texte="Carte professionnelle valide" />
                <Condition ok={departOk} texte="Point de départ renseigné" />
                <Condition ok={transportOk} texte="Moyen de transport renseigné" />
              </ul>
            </fieldset>
          )}
        </div>
      </div>

      {/* ---- Barre d'actions ---- */}
      {peutDecider && (
        <footer className="tou-pied">
          {confirmation ? (
            <>
              <p className="tou-pied-danger">
                <Icone nom="alert" /> Refuser cette proposition ? Les missions restent planifiées, sans
                tournée.
              </p>
              <div className="tou-actions">
                <button
                  type="button"
                  className="tou-btn tou-btn-secondaire"
                  onClick={() => setConfirmation(false)}
                  disabled={enCours}
                >
                  Annuler
                </button>
                <button type="button" className="tou-btn tou-btn-danger" onClick={onRefuser} disabled={enCours}>
                  {enCours ? <span className="tou-spinner" aria-hidden="true" /> : null}
                  {enCours ? "Refus…" : "Oui, refuser"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                {peutValider
                  ? "Tout est prêt : la validation délivre l'ordre de mission et l'ordre de route."
                  : "Complétez les conditions ci-dessus pour valider."}
              </p>
              <div className="tou-actions">
                <button
                  type="button"
                  className="tou-btn tou-btn-contour-danger"
                  onClick={() => setConfirmation(true)}
                  disabled={enCours}
                >
                  Refuser
                </button>
                <button
                  type="button"
                  className="tou-btn tou-btn-principal"
                  onClick={() => onValider({ depart: depart.trim(), transport: transport.trim() })}
                  disabled={enCours || !peutValider}
                >
                  {enCours ? <span className="tou-spinner" aria-hidden="true" /> : <Icone nom="check" />}
                  {enCours ? "Validation…" : "Valider et délivrer les ordres"}
                </button>
              </div>
            </>
          )}
        </footer>
      )}
    </section>
  );
}

// ---------- La page ----------

export default function Tournees() {
  const { estDirecteur } = useAuth();

  const aujourdhui = new Date().toLocaleDateString("sv-SE");

  const [tournees, setTournees] = useState<Tournee[]>([]);
  const [missions, setMissions] = useState<MissionPlanifiee[]>([]);
  const [controleurs, setControleurs] = useState<Utilisateur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [controleurId, setControleurId] = useState("");
  const [date, setDate] = useState(aujourdhui);
  const [generation, setGeneration] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [panneau, setPanneau] = useState<EtatPanneau | null>(null);
  const [notification, setNotification] = useState<EtatNotification | null>(null);

  // Filtres de la liste (purement visuels, calculés sur les données chargées)
  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreControleur, setFiltreControleur] = useState("");
  const [filtreDate, setFiltreDate] = useState("");

  const notifier = useCallback((type: "succes" | "erreur", texte: string) => {
    setNotification({ cle: Date.now(), type, texte });
  }, []);
  const fermerNotification = useCallback(() => setNotification(null), []);
  const fermerPanneau = useCallback(() => setPanneau(null), []);

  // ---- Chargement (synchronisé avec le backend) ----

  const charger = useCallback(
    async (silencieux = false) => {
      try {
        const reponse = await api.get(URL_TOURNEES);
        setTournees(extraireListe<Tournee>(reponse.data));
        if (estDirecteur) {
          const planifiees = await api.get("/controles/missions/?statut=PLANIFIEE");
          setMissions(extraireListe<MissionPlanifiee>(planifiees.data));
        }
        setErreur("");
      } catch {
        if (!silencieux) setErreur("Impossible de charger les tournées.");
      } finally {
        if (!silencieux) setChargement(false);
      }
    },
    [estDirecteur]
  );

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    if (!estDirecteur) return;
    api
      .get("/auth/controleurs/")
      .then((reponse) => setControleurs(reponse.data))
      .catch(() => {
        // La page reste utilisable pour consulter les tournées existantes
      });
  }, [estDirecteur]);

  // ---- Combien de missions la tournée va-t-elle regrouper ? ----

  // Les missions d'une proposition non validée sont reprises : régénérer la remplace
  const idsProposees = new Set(tournees.filter((t) => t.statut === "PROPOSEE").map((t) => t.id));
  const nombreAregrouper = missions.filter(
    (m) =>
      String(m.controleur) === controleurId &&
      m.date_prevue === date &&
      (!m.tournee || idsProposees.has(m.tournee))
  ).length;

  // ---- Actions ----

  async function proposer() {
    setGeneration(true);
    try {
      const reponse = await api.post(`${URL_TOURNEES}generer/`, {
        controleur: Number(controleurId),
        date,
      });
      const creee = reponse.data as Tournee;
      await charger(true);
      // Le panneau bascule sur la tournée proposée, depuis le même point de départ
      setPanneau((p) => ({
        mode: "voir",
        id: creee.id,
        origine: p?.origine ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      }));
      notifier("succes", "Tournée proposée. Vérifiez l'ordre, puis validez-la.");
    } catch (e) {
      notifier("erreur", messagesErreur(e, "La tournée n'a pas pu être générée."));
    } finally {
      setGeneration(false);
    }
  }

  async function valider(tournee: Tournee, route: DonneesRoute) {
    setEnCours(true);
    try {
      await api.post(`${URL_TOURNEES}${tournee.id}/valider/`, route);
      notifier(
        "succes",
        `Tournée validée. Ordre de mission et ordre de route délivrés à ${tournee.controleur_nom}.`
      );
      await charger(true);
    } catch (e) {
      notifier("erreur", messagesErreur(e, "La tournée n'a pas pu être validée."));
    } finally {
      setEnCours(false);
    }
  }

  async function refuser(tournee: Tournee) {
    setEnCours(true);
    try {
      await api.post(`${URL_TOURNEES}${tournee.id}/refuser/`);
      setPanneau(null);
      notifier("succes", "La proposition a été refusée. Les missions restent planifiées.");
      await charger(true);
    } catch (e) {
      notifier("erreur", messagesErreur(e, "La proposition n'a pas pu être refusée."));
    } finally {
      setEnCours(false);
    }
  }

  function ouvrirPlanification(origine: Origine) {
    charger(true);
    setPanneau({ mode: "planifier", origine });
  }

  function surTouche(e: KeyboardEvent<HTMLTableRowElement>, id: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPanneau({ mode: "voir", id, origine: origineDe(e.currentTarget) });
    }
  }

  // ---- Compteurs (pour les segments de la pilule) ----

  const nbProposees = tournees.filter((t) => t.statut === "PROPOSEE").length;
  const nombrePour = (valeur: string) =>
    valeur === "" ? tournees.length : tournees.filter((t) => t.statut === valeur).length;

  // ---- Filtres ----

  const controleursDesTournees = useMemo(() => {
    const vus = new Map<number, string>();
    tournees.forEach((t) => vus.set(t.controleur, t.controleur_nom));
    return Array.from(vus, ([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom));
  }, [tournees]);

  const tourneesFiltrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return tournees.filter((t) => {
      if (filtreStatut && t.statut !== filtreStatut) return false;
      if (filtreControleur && String(t.controleur) !== filtreControleur) return false;
      if (filtreDate && t.date !== filtreDate) return false;
      if (terme) {
        const texte = [t.controleur_nom, formaterDate(t.date), t.date, ...t.etapes.map((e) => e.site_nom)]
          .join(" ")
          .toLowerCase();
        if (!texte.includes(terme)) return false;
      }
      return true;
    });
  }, [tournees, recherche, filtreStatut, filtreControleur, filtreDate]);

  const filtresActifs = recherche !== "" || filtreStatut !== "" || filtreControleur !== "" || filtreDate !== "";
  function reinitialiserFiltres() {
    setRecherche("");
    setFiltreStatut("");
    setFiltreControleur("");
    setFiltreDate("");
  }

  const ouverte = panneau?.mode === "voir" ? tournees.find((t) => t.id === panneau.id) : undefined;
  const peutProposer = controleurId !== "" && date !== "" && nombreAregrouper > 0 && !generation;

  // Message dynamique de la zone de planification
  let indication: { ton: "neutre" | "ok" | "alerte"; texte: string };
  if (!controleurId) {
    indication = {
      ton: "neutre",
      texte: "Choisissez un contrôleur et une date : l'algorithme regroupe ses missions planifiées ce jour-là.",
    };
  } else if (date === "") {
    indication = { ton: "alerte", texte: "Choisissez une date pour proposer une tournée." };
  } else if (nombreAregrouper === 0) {
    indication = {
      ton: "alerte",
      texte:
        "Aucune mission planifiée pour ce contrôleur à cette date : impossible de proposer une tournée. Créez d'abord des missions ou changez la date.",
    };
  } else {
    indication = {
      ton: "ok",
      texte: `${nombreAregrouper} mission${nombreAregrouper > 1 ? "s" : ""} planifiée${
        nombreAregrouper > 1 ? "s" : ""
      } à regrouper.`,
    };
  }

  // Contenu du panneau
  const afficherPanneau = panneau !== null && (panneau.mode === "planifier" || ouverte !== undefined);
  let titrePanneau = "";
  let sousTitrePanneau: string | undefined;
  if (panneau?.mode === "planifier") {
    titrePanneau = "Planifier une tournée";
    sousTitrePanneau = "Choisissez un contrôleur et un jour";
  } else if (ouverte) {
    titrePanneau = `Tournée du ${formaterDate(ouverte.date)}`;
    sousTitrePanneau = ouverte.controleur_nom;
  }

  return (
    <div className="tou-page">
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <div className="entete-page">
        <h1>{estDirecteur ? "Gestion des tournées" : "Mes tournées"}</h1>
      </div>
      <p className="tou-intro">
        {estDirecteur
          ? "Regroupez les missions d'un contrôleur en une tournée optimisée, puis validez-la pour délivrer l'ordre de mission et l'ordre de route."
          : "Retrouvez les tournées qui vous sont confiées, avec l'itinéraire et vos documents officiels."}
      </p>

      {erreur && (
        <div className="tpp-ile-zone">
          <div className="tpp-ile" role="alert">
            <span className="tpp-ile-point" aria-hidden="true" />
            <span className="tpp-ile-texte">{erreur}</span>
          </div>
        </div>
      )}

      {/* Pilule : filtre par statut + bouton de planification (Directeur) */}
      <div className="tou-ilot-zone">
        <div className="tou-ilot" role="group" aria-label="Filtrer les tournées">
          {SEGMENTS.map((s) => {
            const nombre = nombrePour(s.valeur);
            return (
              <button
                key={s.valeur || "toutes"}
                type="button"
                aria-pressed={filtreStatut === s.valeur}
                className={`tou-segment${filtreStatut === s.valeur ? " actif" : ""}`}
                onClick={() => setFiltreStatut(s.valeur)}
                title={`${nombre} tournée${nombre > 1 ? "s" : ""}`}
              >
                {s.libelle}
                {s.valeur === "PROPOSEE" && nbProposees > 0 && (
                  <span className="tou-point" aria-label="Des tournées attendent votre validation" />
                )}
              </button>
            );
          })}

          {estDirecteur && (
            <>
              <span className="tou-separateur" aria-hidden="true" />
              <button
                type="button"
                className="tou-ajout"
                onClick={(e) => ouvrirPlanification(origineDe(e.currentTarget))}
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
                Planifier une tournée
              </button>
            </>
          )}
        </div>
      </div>

      {/* Recherche et filtres */}
      {!chargement && tournees.length > 0 && (
        <div className="tou-filtres" role="search" aria-label="Rechercher dans les tournées">
          <label className="tou-recherche">
            <Icone nom="search" taille={16} />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un contrôleur, un site, une date…"
              aria-label="Rechercher"
            />
          </label>
          {estDirecteur && (
            <select
              value={filtreControleur}
              onChange={(e) => setFiltreControleur(e.target.value)}
              aria-label="Filtrer par contrôleur"
            >
              <option value="">Tous les contrôleurs</option>
              {controleursDesTournees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={filtreDate}
            onChange={(e) => setFiltreDate(e.target.value)}
            aria-label="Filtrer par date"
          />
          {filtresActifs && (
            <button type="button" className="tou-btn tou-btn-secondaire" onClick={reinitialiserFiltres}>
              Réinitialiser
            </button>
          )}
        </div>
      )}

      {/* Liste des tournées */}
      {chargement ? (
        <div className="tou-chargement">
          <span className="tou-spinner-vert" aria-hidden="true" />
          Chargement des tournées…
        </div>
      ) : (
        <div className="tou-cadre">
          {tournees.length === 0 ? (
            <p className="tou-vide">
              {estDirecteur
                ? "Aucune tournée pour l'instant. Cliquez sur « Planifier une tournée », choisissez un contrôleur et une date, puis proposez-la."
                : "Aucune tournée ne vous a été confiée pour l'instant. Vous serez notifié dès qu'une tournée sera validée."}
            </p>
          ) : tourneesFiltrees.length === 0 ? (
            <p className="tou-vide">
              Aucune tournée ne correspond à vos filtres.{" "}
              <button type="button" className="tou-lien" onClick={reinitialiserFiltres}>
                Réinitialiser les filtres
              </button>
            </p>
          ) : (
            <table className="tou-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Contrôleur</th>
                  <th className="num">Sites</th>
                  <th className="num">Distance</th>
                  <th className="num">Durée</th>
                  <th>Statut</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {tourneesFiltrees.map((t) => (
                  <tr
                    key={t.id}
                    tabIndex={0}
                    onClick={(e) => setPanneau({ mode: "voir", id: t.id, origine: { x: e.clientX, y: e.clientY } })}
                    onKeyDown={(e) => surTouche(e, t.id)}
                  >
                    <td className="tou-cellule-date">
                      <strong>{formaterDate(t.date)}</strong>
                    </td>
                    <td>{t.controleur_nom}</td>
                    <td className="num">{t.etapes.length}</td>
                    <td className="num">{km(t.distance_estimee_km)}</td>
                    <td className="num">{dureeMinutes(t.duree_estimee_min)}</td>
                    <td>
                      <BadgeStatut tournee={t} />
                    </td>
                    <td className="tou-chevron" aria-hidden="true">
                      ›
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {afficherPanneau && panneau && (
        <PanneauVerre
          titre={titrePanneau}
          sousTitre={sousTitrePanneau}
          origine={panneau.origine}
          onFermer={fermerPanneau}
        >
          {(fermer) => (
            <div className="ile-vue" key={panneau.mode === "voir" ? `voir-${panneau.id}` : "planifier"}>
              {panneau.mode === "planifier" && (
                <div className="tou-planification">
                  <div className="tou-grille-champs">
                    <label className="tou-champ">
                      <span>Contrôleur</span>
                      <span className="tou-champ-icone">
                        <Icone nom="user" taille={16} />
                        <select value={controleurId} onChange={(e) => setControleurId(e.target.value)}>
                          <option value="">— Choisir —</option>
                          {controleurs.map((c) => (
                            <option key={c.id} value={c.id}>
                              {nomComplet(c)}
                            </option>
                          ))}
                        </select>
                      </span>
                    </label>

                    <label className="tou-champ">
                      <span>Date</span>
                      <span className="tou-champ-icone">
                        <Icone nom="calendar" taille={16} />
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                      </span>
                    </label>
                  </div>

                  <p className={`tou-indication ${indication.ton}`} aria-live="polite">
                    <Icone
                      nom={indication.ton === "ok" ? "check" : indication.ton === "alerte" ? "alert" : "list"}
                      taille={16}
                    />
                    {indication.texte}
                  </p>

                  <div className="tou-actions">
                    <button type="button" className="tou-btn tou-btn-secondaire" onClick={fermer}>
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="tou-btn tou-btn-principal"
                      onClick={proposer}
                      disabled={!peutProposer}
                    >
                      {generation ? <span className="tou-spinner" aria-hidden="true" /> : <Icone nom="route" />}
                      {generation ? "Calcul…" : "Proposer une tournée"}
                    </button>
                  </div>
                </div>
              )}

              {panneau.mode === "voir" && ouverte && (
                <DetailTournee
                  tournee={ouverte}
                  estDirecteur={estDirecteur}
                  enCours={enCours}
                  onValider={(route) => valider(ouverte, route)}
                  onRefuser={() => refuser(ouverte)}
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