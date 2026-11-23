import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/client";
import BoutonRetour from "../../components/BoutonRetour";
import Notification from "../../components/Notification";
import PanneauVerre from "../../components/PanneauVerre";
import type { Origine } from "../../components/PanneauIle";
import { extraireListe, origineDe } from "../outilsListe";
import DetailPartenaire from "./DetailPartenaire";
import FormulairePartenaire from "./FormulairePartenaire";
import { URL_PARTENAIRES } from "./types";
import type { DonneesPartenaire, ModePanneau, Partenaire } from "./types";
import "../Liste.css";
import "../Sites/Sites.css";
import "./Partenaires.css";

interface EtatPanneau {
  mode: ModePanneau;
  partenaire?: Partenaire;
  origine: Origine;
}

interface EtatNotification {
  cle: number;
  type: "succes" | "erreur";
  texte: string;
}

export default function Partenaires() {
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");
  const [panneau, setPanneau] = useState<EtatPanneau | null>(null);
  const [notification, setNotification] = useState<EtatNotification | null>(null);
  const [parametres, setParametres] = useSearchParams();

  const notifier = useCallback((type: "succes" | "erreur", texte: string) => {
    setNotification({ cle: Date.now(), type, texte });
  }, []);
  const fermerNotification = useCallback(() => setNotification(null), []);
  const fermerPanneau = useCallback(() => setPanneau(null), []);

  // ---- Chargement des données (synchronisées avec le backend) ----

  const charger = useCallback(async (silencieux = false) => {
    try {
      const reponse = await api.get(URL_PARTENAIRES);
      setPartenaires(extraireListe<Partenaire>(reponse.data));
      setErreur("");
    } catch {
      if (!silencieux) setErreur("Impossible de charger les partenaires.");
    } finally {
      if (!silencieux) setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // Lien depuis la fiche d'un site : /partenaires?ouvrir=<id> ouvre directement la fiche
  const idAOuvrir = parametres.get("ouvrir");
  useEffect(() => {
    if (!idAOuvrir || partenaires.length === 0) return;
    const trouve = partenaires.find((p) => String(p.id) === idAOuvrir);
    if (trouve) {
      setPanneau({
        mode: "voir",
        partenaire: trouve,
        origine: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      });
    }
    setParametres({}, { replace: true });
  }, [idAOuvrir, partenaires, setParametres]);

  // ---- Opérations ----

  async function creer(donnees: DonneesPartenaire) {
    await api.post(URL_PARTENAIRES, donnees);
    notifier("succes", `Le partenaire « ${donnees.nom} » a été créé.`);
    await charger(true);
  }

  async function modifier(id: number, donnees: DonneesPartenaire) {
    await api.patch(`${URL_PARTENAIRES}${id}/`, donnees);
    notifier("succes", "Le partenaire a été modifié.");
    await charger(true);
    setPanneau((p) => (p ? { ...p, mode: "voir" } : p));
  }

  async function supprimer(partenaire: Partenaire) {
    await api.delete(`${URL_PARTENAIRES}${partenaire.id}/`);
    notifier("succes", `Le partenaire « ${partenaire.nom} » a été supprimé.`);
    await charger(true);
  }

  // ---- Panneau ----

  function ouvrir(mode: ModePanneau, origine: Origine, partenaire?: Partenaire) {
    setPanneau({ mode, partenaire, origine });
  }

  function changerMode(mode: ModePanneau) {
    setPanneau((p) => (p ? { ...p, mode } : p));
  }

  function surTouche(e: KeyboardEvent<HTMLTableRowElement>, partenaire: Partenaire) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ouvrir("voir", origineDe(e.currentTarget), partenaire);
    }
  }

  // Le partenaire affiché dans le panneau suit toujours la dernière version reçue
  const partenaireOuvert = panneau?.partenaire
    ? partenaires.find((p) => p.id === panneau.partenaire?.id) ?? panneau.partenaire
    : undefined;

  let titrePanneau = "";
  let sousTitrePanneau: string | undefined;
  if (panneau?.mode === "creer") {
    titrePanneau = "Nouveau partenaire";
    sousTitrePanneau = "Station de télévision, radio ou fournisseur internet";
  } else if (panneau?.mode === "modifier" && partenaireOuvert) {
    titrePanneau = "Modifier le partenaire";
    sousTitrePanneau = partenaireOuvert.nom;
  } else if (partenaireOuvert) {
    titrePanneau = partenaireOuvert.nom;
    sousTitrePanneau = "Fiche du partenaire";
  }

  // ---- Filtrage ----

  const terme = recherche.trim().toLowerCase();
  const visibles = partenaires.filter((p) =>
    !terme
      ? true
      : [p.nom, p.contact, p.telephone, p.email].join(" ").toLowerCase().includes(terme)
  );

  return (
    <div className="pat-page">
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <div className="entete-page">
        <h1>Partenaires</h1>
      </div>

      {erreur && (
        <div className="pat-ile-zone">
          <div className="pat-ile" role="alert">
            <span className="pat-ile-point" aria-hidden="true" />
            <span className="pat-ile-texte">{erreur}</span>
          </div>
        </div>
      )}

      {/* Pilule : recherche + bouton d'ajout */}
      <div className="lst-ilot-zone">
        <div className="lst-ilot lst-ilot-recherche pat-ilot">
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
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un partenaire, un contact…"
            aria-label="Rechercher un partenaire"
          />
          {!chargement && (
            <span className="lst-compte">
              {partenaires.length} partenaire{partenaires.length > 1 ? "s" : ""}
            </span>
          )}
          <span className="lst-separateur" aria-hidden="true" />
          <button
            type="button"
            className="lst-ajout"
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
            Nouveau partenaire
          </button>
        </div>
      </div>

      {chargement ? (
        <div className="lst-chargement">
          <span className="lst-spinner" aria-hidden="true" />
          Chargement des partenaires…
        </div>
      ) : (
        <div className="lst-tableau-cadre">
          {visibles.length === 0 ? (
            <p className="lst-vide">
              {partenaires.length === 0
                ? "Aucun partenaire pour l'instant. Cliquez sur « Nouveau partenaire »."
                : `Aucun partenaire ne correspond à « ${recherche} ».`}
            </p>
          ) : (
            <table className="lst-tableau">
              <thead>
                <tr>
                  <th>Partenaire</th>
                  <th>Contact</th>
                  <th>Téléphone</th>
                  <th>E-mail</th>
                  <th className="centre">Sites</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const nombre = p.nombre_sites ?? 0;
                  return (
                    <tr
                      key={p.id}
                      className="cliquable"
                      tabIndex={0}
                      onClick={(e) => ouvrir("voir", { x: e.clientX, y: e.clientY }, p)}
                      onKeyDown={(e) => surTouche(e, p)}
                    >
                      <td className="lst-nom">
                        <strong>{p.nom}</strong>
                      </td>
                      <td>{p.contact || <span className="lst-absent">—</span>}</td>
                      <td>{p.telephone || <span className="lst-absent">—</span>}</td>
                      <td>{p.email || <span className="lst-absent">—</span>}</td>
                      <td className="centre">
                        <span className={`lst-compteur ${nombre > 0 ? "ok" : "zero"}`}>{nombre}</span>
                      </td>
                      <td className="lst-chevron" aria-hidden="true">
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
                <FormulairePartenaire
                  onEnvoyer={async (donnees) => {
                    await creer(donnees);
                    fermer();
                  }}
                  onAnnuler={fermer}
                />
              )}

              {panneau.mode === "modifier" && partenaireOuvert && (
                <FormulairePartenaire
                  partenaire={partenaireOuvert}
                  onEnvoyer={(donnees) => modifier(partenaireOuvert.id, donnees)}
                  onAnnuler={() => changerMode("voir")}
                />
              )}

              {panneau.mode === "voir" && partenaireOuvert && (
                <DetailPartenaire
                  partenaire={partenaireOuvert}
                  onModifier={() => changerMode("modifier")}
                  onSupprimer={async () => {
                    await supprimer(partenaireOuvert);
                    fermer();
                  }}
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