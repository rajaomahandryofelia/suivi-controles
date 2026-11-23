import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import api from "../../api/client";
import TelechargerOrdres from "../Tournees/TelechargerOrdres";
import { libelleOuverture, missionOuverte as grilleOuverte } from "./horaire";
import { formaterDate, formaterHeure, lienCarte, messagesErreur, obtenirPosition } from "./outils";
import type { Mission } from "./types";
import "../Tournees/Tournees.css";
import "./FicheMission.css";

// ---------- Ce que renvoie le backend (une mission d'ensemble) ----------

type Appartenance = "MINISTERE" | "HORS_MINISTERE";

interface CarteProfessionnelle {
  numero: string;
  date_expiration: string;
  valide: boolean;
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

interface RapportEtape {
  id: number;
  statut: string;
  statut_libelle: string;
  score_conformite: number | string;
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
  statut: string;
  statut_libelle: string;
  modele_grille_nom?: string;
  nb_criteres: number;
  nb_reponses: number;
  nb_non_conformites: number;
  derogation_convention?: boolean;
  motif_derogation?: string;
  rapport?: RapportEtape | null;
}

interface MissionEnsemble {
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
  missions: Mission[];
  statut_global: string;
  statut_global_libelle: string;
  nb_etapes: number;
  nb_etapes_cloturees: number;
  heure_prevue?: string | null;
  date_fin_prevue?: string | null;
  heure_fin_prevue?: string | null;
  carte_professionnelle?: CarteProfessionnelle | null;
  ordre_mission?: OrdreMission | null;
  ordre_route?: OrdreRoute | null;
}

interface Props {
  tourneeId: number;
  estDirecteur: boolean;
  onRemplir: (etape: Mission) => void;
  onCloturer: (etape: Mission) => void;
  onNotifier: (type: "succes" | "erreur", texte: string) => void;
  // Appelé quand la mission a changé (validation, refus) : la liste doit se recharger
  onChange: () => void;
  onFermer: () => void;
}

// ---------- Icônes (SVG intégrés) ----------

type NomIcone = "route" | "check" | "clock" | "pin" | "card" | "file" | "road" | "x" | "alert" | "map";

const CHEMINS: Record<NomIcone, ReactNode> = {
  route: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6" />
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
  alert: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
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

// Ce que l'algorithme change par rapport à l'ordre chronologique des sites
function texteEcart(m: MissionEnsemble): { texte: string; ton: "mieux" | "pire" | "neutre" } | null {
  const reference = m.distance_reference_km;
  const reel = Number(m.distance_estimee_km);
  if (!(reference > 0.05)) return null;

  const ecart = reel - reference;
  const pourcentage = Math.abs((ecart / reference) * 100);
  if (Math.abs(ecart) < 0.05) {
    return { texte: "Même distance que l'ordre chronologique des sites.", ton: "neutre" };
  }
  if (ecart < 0) {
    return {
      texte: `${km(Math.abs(ecart))} de moins que l'ordre chronologique (−${pourcentage.toFixed(0)} %).`,
      ton: "mieux",
    };
  }
  return {
    texte: `${km(ecart)} de plus que l'ordre chronologique (+${pourcentage.toFixed(0)} %) : les sites les plus risqués passent en premier.`,
    ton: "pire",
  };
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

function PiecesOfficielles({ mission }: { mission: MissionEnsemble }) {
  const carte = mission.carte_professionnelle;
  const ordreMission = mission.ordre_mission;
  const ordreRoute = mission.ordre_route;
  const proposee = mission.statut === "PROPOSEE";
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
              : `N° ${carte.numero} · expirée ou non valable le jour de la mission (${formaterDate(carte.date_expiration)})`
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

function Condition({ ok, texte }: { ok: boolean; texte: string }) {
  return (
    <li className={ok ? "ok" : "ko"}>
      <Icone nom={ok ? "check" : "x"} taille={14} />
      {texte}
    </li>
  );
}

// ---------- Le parcours d'une visite : où elle en est, et la prochaine action ----------

const PAS_PARCOURS = ["Attribuée", "Ordre délivré", "Sur place", "Grille remplie", "Rapport envoyé", "Validé"];

interface ParcoursVisite {
  faits: boolean[];
  actuel: number; // premier pas non fait (-1 si tout est fait)
  refuse: boolean;
  action: string;
}

function parcoursVisite(
  e: Etape,
  etape: Mission | undefined,
  ordreDelivre: boolean,
  estDirecteur: boolean
): ParcoursVisite {
  const brut = [
    true,
    ordreDelivre,
    (etape?.latitude_debut ?? null) !== null || e.statut === "CLOTUREE",
    e.statut === "CLOTUREE" || (e.nb_criteres > 0 && e.nb_reponses >= e.nb_criteres),
    !!e.rapport,
    e.rapport?.statut === "VALIDE",
  ];
  // Un pas franchi prouve que les précédents le sont aussi (ex. grille remplie sans « Je suis arrivé »)
  const faits = brut.map((_, i) => brut.slice(i).some(Boolean));
  const actuel = faits.findIndex((f) => !f);
  const refuse = e.rapport?.statut === "REJETE";

  let action = "Cette visite est terminée : le rapport est validé.";
  if (refuse) {
    action = estDirecteur
      ? "Le rapport a été rejeté : le contrôleur doit corriger puis le renvoyer."
      : "Votre rapport a été rejeté : corrigez-le selon le motif indiqué, puis renvoyez-le.";
  } else if (actuel === 1) {
    action = estDirecteur
      ? "Validez la mission pour délivrer l'ordre de mission au contrôleur."
      : "En attente de la validation de la mission par le Directeur.";
  } else if (actuel === 2) {
    action = estDirecteur
      ? "En attente de l'arrivée du contrôleur sur le site."
      : e.statut === "PLANIFIEE"
        ? "Rendez-vous sur le site à l'heure prévue."
        : "Cliquez sur « Je suis arrivé » une fois sur le site.";
  } else if (actuel === 3) {
    action = estDirecteur
      ? `Le contrôleur remplit la grille (${e.nb_reponses}/${e.nb_criteres} critères).`
      : `Remplissez la grille (${e.nb_reponses}/${e.nb_criteres} critères), puis clôturez la visite.`;
  } else if (actuel === 4) {
    action = estDirecteur
      ? "En attente de la clôture de la visite par le contrôleur."
      : "Clôturez la visite pour envoyer le rapport.";
  } else if (actuel === 5) {
    action = estDirecteur
      ? "Rapport reçu : ouvrez la page Rapports pour le valider ou le rejeter."
      : "Rapport envoyé : en attente de la validation du Directeur.";
  }
  return { faits, actuel, refuse, action };
}

function Parcours({ parcours }: { parcours: ParcoursVisite }) {
  return (
    <div className="fm-parcours">
      <ol className="fm-parcours-pas" aria-label="Avancement de la visite">
        {PAS_PARCOURS.map((nom, i) => {
          const fait = parcours.faits[i];
          const actuel = i === parcours.actuel || (parcours.refuse && i === 5);
          const classe = parcours.refuse && i === 5 ? "refuse" : fait ? "fait" : actuel ? "actuel" : "";
          return (
            <li key={nom} className={`fm-pas ${classe}`} aria-current={actuel ? "step" : undefined}>
              <span className="fm-pas-rond">{parcours.refuse && i === 5 ? "!" : fait ? "✓" : i + 1}</span>
              <span className="fm-pas-nom">{nom}</span>
            </li>
          );
        })}
      </ol>
      <p className={`fm-prochaine${parcours.refuse ? " refuse" : ""}`}>
        <strong>{parcours.actuel === -1 && !parcours.refuse ? "Terminé" : "Prochaine action"}</strong>
        {parcours.action}
      </p>
    </div>
  );
}

// ---------- La fiche : tout sur la mission, sans changer de page ----------

export default function FicheMission({
  tourneeId,
  estDirecteur,
  onRemplir,
  onCloturer,
  onNotifier,
  onChange,
  onFermer,
}: Props) {
  const [mission, setMission] = useState<MissionEnsemble | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [depart, setDepart] = useState("");
  const [transport, setTransport] = useState("");
  // Site pour lequel l'arrivée est en cours d'enregistrement
  const [arrivee, setArrivee] = useState<number | null>(null);

  const charger = useCallback(
    async (silencieux = false) => {
      try {
        const reponse = await api.get(`/controles/tournees/${tourneeId}/`);
        setMission(reponse.data);
        setErreur("");
      } catch (e) {
        if (!silencieux) {
          setErreur(
            isAxiosError(e) && e.response?.status === 404 && !estDirecteur
              ? "Cette mission n'a pas encore été validée par le Directeur."
              : messagesErreur(e, "Impossible de charger la mission.")
          );
        }
      } finally {
        if (!silencieux) setChargement(false);
      }
    },
    [tourneeId, estDirecteur]
  );

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

  async function valider() {
    if (!mission) return;
    setEnCours(true);
    try {
      await api.post(`/controles/tournees/${mission.id}/valider/`, {
        depart: depart.trim(),
        transport: transport.trim(),
      });
      onNotifier(
        "succes",
        `Mission validée. Ordre de mission et ordre de route délivrés à ${mission.controleur_nom}.`
      );
      await charger(true);
      onChange();
    } catch (e) {
      onNotifier("erreur", messagesErreur(e, "La mission n'a pas pu être validée."));
    } finally {
      setEnCours(false);
    }
  }

  // « Je suis arrivé » : heure réelle + position GPS du contrôleur sur le site
  async function signalerArrivee(etape: Mission) {
    setArrivee(etape.id);
    try {
      const position = await obtenirPosition();
      await api.post(`/controles/missions/${etape.id}/arrivee/`, position);
      onNotifier("succes", `Arrivée enregistrée sur « ${etape.site_nom} ».`);
      await charger(true);
      onChange();
    } catch (e) {
      onNotifier("erreur", messagesErreur(e, "L'arrivée n'a pas pu être enregistrée."));
    } finally {
      setArrivee(null);
    }
  }

  async function refuser() {
    if (!mission) return;
    setEnCours(true);
    try {
      await api.post(`/controles/tournees/${mission.id}/refuser/`);
      onNotifier("succes", "La proposition a été refusée. Les missions restent planifiées.");
      onChange();
      onFermer();
    } catch (e) {
      onNotifier("erreur", messagesErreur(e, "La proposition n'a pas pu être refusée."));
      setEnCours(false);
    }
  }

  if (chargement) {
    return (
      <div className="tou-chargement">
        <span className="tou-spinner-vert" aria-hidden="true" />
        Chargement de la mission…
      </div>
    );
  }

  if (erreur || !mission) {
    return (
      <section className="tou-detail">
        <p className="tou-alerte" role="alert">
          <Icone nom="alert" />
          {erreur || "Mission introuvable."}
        </p>
        <div className="tou-actions">
          <button type="button" className="tou-btn tou-btn-secondaire" onClick={onFermer}>
            Fermer
          </button>
        </div>
      </section>
    );
  }

  const ecart = texteEcart(mission);
  const proposee = mission.statut === "PROPOSEE";
  const peutDecider = estDirecteur && proposee;
  const carteOk = !!mission.carte_professionnelle?.valide;
  const departOk = depart.trim() !== "";
  const transportOk = transport.trim() !== "";
  const peutValider = carteOk && departOk && transportOk;

  const debut = formaterHeure(mission.heure_prevue ?? null);
  const fin = formaterHeure(mission.heure_fin_prevue ?? null);
  const memeJour = !mission.date_fin_prevue || mission.date_fin_prevue === mission.date;
  const creneau = debut
    ? fin
      ? memeJour
        ? `${debut} → ${fin}`
        : `${debut} → ${formaterDate(mission.date_fin_prevue as string)}, ${fin}`
      : debut
    : "";

  const etapeMission = (id: number) => mission.missions.find((m) => m.id === id);

  return (
    <section className="tou-detail" aria-label="Détail de la mission">
      <div className="tou-badges">
        <span className={`mis-statut ${mission.statut_global}`}>{mission.statut_global_libelle}</span>
        {proposee && <span className="tou-statut tou-statut-proposee">{mission.statut_libelle}</span>}
      </div>

      <p className="fm-ligne">
        <strong>{formaterDate(mission.date)}</strong>
        {creneau && <span>{creneau}</span>}
        <span>Contrôleur : {mission.controleur_nom}</span>
        <span>
          {mission.nb_etapes_cloturees}/{mission.nb_etapes} site{mission.nb_etapes > 1 ? "s" : ""} clôturé
          {mission.nb_etapes_cloturees > 1 ? "s" : ""}
        </span>
      </p>

      <div className="tou-resume">
        <div className="tou-indicateur">
          <Icone nom="pin" />
          <div>
            <strong>{mission.etapes.length}</strong>
            <span>site{mission.etapes.length > 1 ? "s" : ""} à contrôler</span>
          </div>
        </div>
        <div className="tou-indicateur">
          <Icone nom="map" />
          <div>
            <strong>{km(mission.distance_estimee_km)}</strong>
            <span>entre les sites</span>
          </div>
        </div>
        <div className="tou-indicateur">
          <Icone nom="clock" />
          <div>
            <strong>{dureeMinutes(mission.duree_estimee_min)}</strong>
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
        {/* ---- Itinéraire et avancement de chaque site ---- */}
        <div className="tou-colonne">
          <h3 className="tou-colonne-titre">
            <Icone nom="route" taille={16} /> Sites et itinéraire
          </h3>

          {ecart && <p className={`tou-ecart tou-ecart-${ecart.ton}`}>{ecart.texte}</p>}

          <ol className="tou-timeline">
            {mission.etapes.map((e) => {
              const etape = etapeMission(e.mission);
              const score = e.rapport ? Math.round(Number(e.rapport.score_conformite)) : null;
              return (
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

                    {/* Avancement du contrôle de ce site */}
                    <div className="fm-etat">
                      <span className={`mis-statut ${e.statut}`}>{e.statut_libelle}</span>
                      {e.nb_criteres > 0 && (
                        <span>
                          {e.nb_reponses}/{e.nb_criteres} critères
                        </span>
                      )}
                      {e.nb_non_conformites > 0 && (
                        <Link to={`/non-conformites?mission=${e.mission}`} className="fm-nc">
                          {e.nb_non_conformites} non-conformité{e.nb_non_conformites > 1 ? "s" : ""}
                        </Link>
                      )}
                      {e.rapport && (
                        <Link to="/rapports" className="fm-rapport">
                          Rapport {e.rapport.statut_libelle.toLowerCase()}
                          {score !== null ? ` · ${score} %` : ""}
                        </Link>
                      )}
                    </div>
                    {e.derogation_convention && (
                      <p className="fm-derogation">
                        Dérogation (convention absente){e.motif_derogation ? ` : ${e.motif_derogation}` : ""}
                      </p>
                    )}

                    <Parcours
                      parcours={parcoursVisite(e, etape, mission.statut === "VALIDEE", estDirecteur)}
                    />

                    {/* Actions du contrôleur sur ce site */}
                    {!estDirecteur && etape && (
                      <div className="fm-actions">
                        {e.statut === "PLANIFIEE" && (
                          <span className="mis-ouverture">{libelleOuverture(etape)}</span>
                        )}
                        {e.statut === "EN_COURS" && !etape.latitude_debut && (
                          <button
                            type="button"
                            className="bouton"
                            onClick={() => signalerArrivee(etape)}
                            disabled={arrivee !== null}
                          >
                            {arrivee === etape.id ? "Localisation…" : "Je suis arrivé"}
                          </button>
                        )}
                        {e.statut === "EN_COURS" && etape.latitude_debut && etape.date_debut_reelle && (
                          <span className="mis-ouverture">
                            Arrivée enregistrée à {new Date(etape.date_debut_reelle).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {e.statut === "EN_COURS" && grilleOuverte(etape) && (
                          <>
                            <button type="button" className="bouton" onClick={() => onRemplir(etape)}>
                              Remplir la grille
                            </button>
                            <button type="button" className="bouton secondaire" onClick={() => onCloturer(etape)}>
                              Clôturer ce site
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <details className="tou-methode">
            <summary>Comment l'ordre est choisi</summary>
            <p>
              On part du site le plus risqué. À chaque étape, on va vers le site qui combine le mieux
              proximité et risque : un site risqué paraît « plus proche » qu'il ne l'est, donc il passe plus
              tôt. Les distances sont à vol d'oiseau (formule de Haversine). La vitesse moyenne, la durée
              d'un contrôle et l'influence du risque se règlent dans les paramètres du score.
            </p>
          </details>
        </div>

        {/* ---- Dossier officiel ---- */}
        <div className="tou-colonne">
          <h3 className="tou-colonne-titre">
            <Icone nom="file" taille={16} /> Dossier officiel
          </h3>

          <PiecesOfficielles mission={mission} />

          <TelechargerOrdres
            tourneeId={mission.id}
            aOrdreMission={!!mission.ordre_mission}
            aOrdreRoute={!!mission.ordre_route}
          />

          {peutDecider && !confirmation && (
            <fieldset className="tou-route-form" disabled={enCours}>
              <legend>Ordre de route</legend>
              <p>La destination sera le premier site de la mission.</p>
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
      <footer className="tou-pied">
        {peutDecider ? (
          confirmation ? (
            <>
              <p className="tou-pied-danger">
                <Icone nom="alert" /> Refuser cette proposition ? Les missions restent planifiées, sans
                regroupement.
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
                <button type="button" className="tou-btn tou-btn-danger" onClick={refuser} disabled={enCours}>
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
                  onClick={valider}
                  disabled={enCours || !peutValider}
                >
                  {enCours ? <span className="tou-spinner" aria-hidden="true" /> : <Icone nom="check" />}
                  {enCours ? "Validation…" : "Valider et délivrer les ordres"}
                </button>
              </div>
            </>
          )
        ) : (
          <div className="tou-actions">
            <button type="button" className="tou-btn tou-btn-secondaire" onClick={onFermer}>
              Fermer
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}