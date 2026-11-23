import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import client from "../../api/client";
import BoutonRetour from "../../components/BoutonRetour";
import { extraireListe } from "./apiOutils";
import { ouvrirPdf } from "./ouvrirPdf";
import PanneauConvention from "./PanneauConvention";
import { FILTRES_STATUT, formaterAr, formaterDate } from "./typesConventions";
import type {
  Convention,
  OptionPartenaire,
  OptionSite,
  StatutConvention,
} from "./typesConventions";
import "../Liste.css";
import "./Conventions.css";
import "./ConventionsVerre.css";
import "../Liste.css";
import "./Conventions.css";
import "./ConventionsVerre.css";
import "./Echeances.css";

// Le panneau central : fermé, en création, ou ouvert sur une convention
type Onglet = "details" | "echeances";
type Panneau = { mode: "creer" } | { mode: "voir"; id: number; onglet: Onglet } | null;

export default function Conventions() {
  const [conventions, setConventions] = useState<Convention[]>([]);
  const [partenaires, setPartenaires] = useState<OptionPartenaire[]>([]);
  const [sites, setSites] = useState<OptionSite[]>([]);
  const [optionsIndisponibles, setOptionsIndisponibles] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [filtre, setFiltre] = useState<StatutConvention | "TOUTES">("TOUTES");
  const [recherche, setRecherche] = useState("");
  const [pdfEnCours, setPdfEnCours] = useState<number | null>(null);
  const [panneau, setPanneau] = useState<Panneau>(null);

  // (Re)charge la liste : aussi appelée après chaque création, modification ou suppression
  const charger = useCallback(async () => {
    try {
      const reponse = await client.get("/conventions/conventions/");
      setConventions(extraireListe<Convention>(reponse.data));
      setErreur("");
    } catch {
      setErreur("Impossible de charger les conventions.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Partenaires et sites : nécessaires au formulaire de création et de modification
  useEffect(() => {
    Promise.all([
      client.get("/referentiels/partenaires/"),
      client.get("/referentiels/sites/"),
    ])
      .then(([p, s]) => {
        setPartenaires(extraireListe<OptionPartenaire>(p.data));
        setSites(extraireListe<OptionSite>(s.data));
      })
      .catch(() => setOptionsIndisponibles(true));
  }, []);

  // Total de tous les arriérés, quel que soit le filtre choisi
  const totalArrieres = useMemo(
    () => conventions.reduce((somme, c) => somme + (Number(c.arrieres) || 0), 0),
    [conventions]
  );

  const nombrePour = (valeur: StatutConvention | "TOUTES") =>
    valeur === "TOUTES" ? conventions.length : conventions.filter((c) => c.statut === valeur).length;

  const affichees = useMemo(() => {
    const mot = recherche.trim().toLowerCase();
    return conventions.filter((c) => {
      if (filtre !== "TOUTES" && c.statut !== filtre) return false;
      if (!mot) return true;
      return [c.reference, c.partenaire_nom, c.site_nom].some((texte) =>
        texte.toLowerCase().includes(mot)
      );
    });
  }, [conventions, filtre, recherche]);

  const fermerPanneau = useCallback(() => setPanneau(null), []);

  // La convention ouverte est relue dans la liste : elle reste à jour après chaque action
  const ouverte =
    panneau?.mode === "voir"
      ? (conventions.find((c) => c.id === panneau.id) ?? null)
      : null;

  // Ouvre l'état de paiement (PDF) dans un nouvel onglet
  async function ouvrirEtat(convention: Convention) {
    setErreur("");
    setPdfEnCours(convention.id);
    const probleme = await ouvrirPdf(`/conventions/conventions/${convention.id}/etat-paiement/`);
    if (probleme) setErreur(probleme);
    setPdfEnCours(null);
  }

  function surTouche(e: KeyboardEvent<HTMLTableRowElement>, id: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPanneau({ mode: "voir", id, onglet: "details" });
    }
  }

  return (
    <div className="cv-page">
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <div className="entete-page">
        <h1>Conventions et paiements</h1>
      </div>

      {erreur && (
        <div className="cvi-ile-zone">
          <div className="cvi-ile" role="alert">
            <span className="cvi-ile-point" aria-hidden="true" />
            <span className="cvi-ile-texte">{erreur}</span>
          </div>
        </div>
      )}

      {/* Pilule : filtres par statut + bouton d'ajout */}
      <div className="lst-ilot-zone">
        <div className="lst-ilot" role="group" aria-label="Filtrer les conventions">
          {FILTRES_STATUT.map((choix) => {
            const nombre = nombrePour(choix.valeur);
            return (
              <button
                key={choix.valeur}
                type="button"
                aria-pressed={filtre === choix.valeur}
                className={`lst-segment${filtre === choix.valeur ? " actif" : ""}`}
                onClick={() => setFiltre(choix.valeur)}
                title={`${nombre} convention${nombre > 1 ? "s" : ""}`}
              >
                {choix.texte}
              </button>
            );
          })}

          <span className="lst-separateur" aria-hidden="true" />
          <button
            type="button"
            className="lst-ajout"
            onClick={() => {
              console.log("clic nouvelle convention"); // TEST : à retirer ensuite
              setPanneau({ mode: "creer" });
            }}
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
            Nouvelle convention
          </button>
        </div>
      </div>

      <div className="lst-outils">
        <div className="lst-recherche">
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
            placeholder="Rechercher un partenaire, un site, un numéro…"
            aria-label="Rechercher une convention"
          />
        </div>

        {!chargement && !erreur && (
          <div className="cv-arrieres" title="Somme des montants échus et non payés">
            <span>Total des arriérés</span>
            <strong className={totalArrieres > 0 ? "du" : ""}>{formaterAr(totalArrieres)}</strong>
          </div>
        )}
      </div>

      {chargement ? (
        <div className="lst-chargement">
          <span className="lst-spinner" aria-hidden="true" />
          Chargement des conventions…
        </div>
      ) : (
        <div className="lst-tableau-cadre">
          {affichees.length === 0 ? (
            <p className="lst-vide">
              {conventions.length === 0
                ? "Aucune convention pour l'instant. Cliquez sur « Nouvelle convention »."
                : "Aucune convention ne correspond à ces critères."}
            </p>
          ) : (
            <table className="lst-tableau">
              <thead>
                <tr>
                  <th>Convention</th>
                  <th>Partenaire</th>
                  <th>Statut</th>
                  <th>Période</th>
                  <th className="cv-droite">Montant</th>
                  <th className="cv-droite">Payé</th>
                  <th className="cv-droite">Arriérés</th>
                  <th aria-label="Paiements et état PDF" />
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {affichees.map((c) => {
                  const arrieres = Number(c.arrieres) || 0;
                  const paye = Number(c.total_paye) || 0;
                  return (
                    <tr
                      key={c.id}
                      className={`cliquable${arrieres > 0 ? " attention" : ""}`}
                      tabIndex={0}
                      onClick={() => setPanneau({ mode: "voir", id: c.id, onglet: "details" })}
                      onKeyDown={(e) => surTouche(e, c.id)}
                    >
                      <td className="lst-nom">
                        <strong>{c.reference}</strong>
                        <span>{c.site_nom}</span>
                      </td>
                      <td>{c.partenaire_nom}</td>
                      <td>
                        <span className={`conv-badge ${c.statut.toLowerCase()}`}>{c.statut_libelle}</span>
                      </td>
                      <td className="cv-periode">
                        {formaterDate(c.date_debut)} → {formaterDate(c.date_fin)}
                      </td>
                      <td className="cv-droite">
                        {formaterAr(c.montant_periodique)}
                        <small>{c.periodicite_libelle.toLowerCase()}</small>
                      </td>
                      <td className={`cv-droite${paye > 0 ? " paye" : ""}`}>
                        {paye > 0 ? formaterAr(c.total_paye) : <span className="lst-absent">—</span>}
                      </td>
                      <td className={`cv-droite${arrieres > 0 ? " du" : ""}`}>
                        {arrieres > 0 ? formaterAr(c.arrieres) : <span className="lst-absent">—</span>}
                      </td>
                      <td className="cv-droite">
                        <div className="cv-actions">
                          <button
                            type="button"
                            className="conv-pdf"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPanneau({ mode: "voir", id: c.id, onglet: "echeances" });
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            title="Voir les échéances et enregistrer un paiement"
                          >
                            Paiements
                          </button>
                          <button
                            type="button"
                            className="conv-pdf"
                            onClick={(e) => {
                              e.stopPropagation();
                              void ouvrirEtat(c);
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            disabled={pdfEnCours === c.id}
                            title="Ouvrir l'état de paiement en PDF"
                          >
                            {pdfEnCours === c.id ? "…" : "État PDF"}
                          </button>
                        </div>
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

      {/* Rendu directement dans <body> : le panneau se centre sur l'écran */}
      {(panneau?.mode === "creer" || ouverte) &&
        createPortal(
          <PanneauConvention
            key={ouverte ? ouverte.id : "nouvelle"}
            convention={ouverte}
            partenaires={partenaires}
            sites={sites}
            optionsIndisponibles={optionsIndisponibles}
            onFermer={fermerPanneau}
            onActualiser={charger}
            ongletInitial={panneau?.mode === "voir" ? panneau.onglet : "details"}
            onCree={(id) => setPanneau({ mode: "voir", id, onglet: "details" })}
          />,
          document.body
        )}
    </div>
  );
}