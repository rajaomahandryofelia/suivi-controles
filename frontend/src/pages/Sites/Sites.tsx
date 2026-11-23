import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import api from "../../api/client";
import BoutonRetour from "../../components/BoutonRetour";
import Notification from "../../components/Notification";
import PanneauVerre from "../../components/PanneauVerre";
import type { Origine } from "../../components/PanneauIle";
import { extraireListe, formaterDate, origineDe } from "../outilsListe";
import DetailSite from "./DetailSite";
import FormulaireSite from "./FormulaireSite";
import { URL_PARTENAIRES, URL_SITES, URL_TYPES } from "./types";
import type { DonneesSite, ModePanneau, Option, Site } from "./types";
import "../Liste.css";
import "./Sites.css";
import "./PageSites.css";

type Segment = "actifs" | "inactifs" | "tous";

const SEGMENTS: { valeur: Segment; libelle: string }[] = [
  { valeur: "actifs", libelle: "Suivis" },
  { valeur: "inactifs", libelle: "Non suivis" },
  { valeur: "tous", libelle: "Tous" },
];

interface EtatPanneau {
  mode: ModePanneau;
  site?: Site;
  origine: Origine;
}

interface EtatNotification {
  cle: number;
  type: "succes" | "erreur";
  texte: string;
}

function correspond(s: Site, segment: Segment): boolean {
  if (segment === "actifs") return s.est_actif;
  if (segment === "inactifs") return !s.est_actif;
  return true;
}

export default function Sites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [types, setTypes] = useState<Option[]>([]);
  const [partenaires, setPartenaires] = useState<Option[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [segment, setSegment] = useState<Segment>("actifs");
  const [recherche, setRecherche] = useState("");
  const [filtreType, setFiltreType] = useState("");
  const [panneau, setPanneau] = useState<EtatPanneau | null>(null);
  const [notification, setNotification] = useState<EtatNotification | null>(null);

  const notifier = useCallback((type: "succes" | "erreur", texte: string) => {
    setNotification({ cle: Date.now(), type, texte });
  }, []);
  const fermerNotification = useCallback(() => setNotification(null), []);
  const fermerPanneau = useCallback(() => setPanneau(null), []);

  // ---- Chargement des données (synchronisées avec le backend) ----

  const chargerSites = useCallback(async (silencieux = false) => {
    try {
      const reponse = await api.get(URL_SITES);
      setSites(extraireListe<Site>(reponse.data));
      setErreur("");
    } catch {
      if (!silencieux) setErreur("Impossible de charger les sites.");
    } finally {
      if (!silencieux) setChargement(false);
    }
  }, []);

  const chargerReferentiels = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([api.get(URL_TYPES), api.get(URL_PARTENAIRES)]);
      setTypes(
        extraireListe<{ id: number; libelle: string }>(t.data).map((x) => ({
          id: x.id,
          libelle: x.libelle,
        }))
      );
      setPartenaires(
        extraireListe<{ id: number; nom: string }>(p.data).map((x) => ({
          id: x.id,
          libelle: x.nom,
        }))
      );
    } catch {
      // Silencieux : la liste des sites reste utilisable
    }
  }, []);

  useEffect(() => {
    chargerSites();
    chargerReferentiels();
  }, [chargerSites, chargerReferentiels]);

  // ---- Opérations ----

  async function creer(donnees: DonneesSite) {
    await api.post(URL_SITES, donnees);
    notifier("succes", `Le site « ${donnees.nom} » a été créé.`);
    await chargerSites(true);
  }

  async function modifier(id: number, donnees: DonneesSite) {
    await api.patch(`${URL_SITES}${id}/`, donnees);
    notifier("succes", "Le site a été modifié.");
    await chargerSites(true);
    setPanneau((p) => (p ? { ...p, mode: "voir" } : p));
  }

  // Désactiver ou réactiver : on ne supprime jamais, l'historique est conservé
  async function changerStatut(site: Site, actif: boolean) {
    await api.patch(`${URL_SITES}${site.id}/`, { est_actif: actif });
    notifier(
      "succes",
      actif ? `Le site « ${site.nom} » est de nouveau suivi.` : `Le site « ${site.nom} » n'est plus suivi.`
    );
    await chargerSites(true);
  }

  // ---- Panneau ----

  function ouvrir(mode: ModePanneau, origine: Origine, site?: Site) {
    if (mode === "creer" || mode === "modifier") chargerReferentiels();
    setPanneau({ mode, site, origine });
  }

  function changerMode(mode: ModePanneau) {
    if (mode === "modifier") chargerReferentiels();
    setPanneau((p) => (p ? { ...p, mode } : p));
  }

  function surTouche(e: KeyboardEvent<HTMLTableRowElement>, site: Site) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ouvrir("voir", origineDe(e.currentTarget), site);
    }
  }

  // Le site affiché dans le panneau suit toujours la dernière version reçue
  const siteOuvert = panneau?.site
    ? sites.find((s) => s.id === panneau.site?.id) ?? panneau.site
    : undefined;

  let titrePanneau = "";
  let sousTitrePanneau: string | undefined;
  if (panneau?.mode === "creer") {
    titrePanneau = "Nouveau site";
    sousTitrePanneau = "Ajoutez un site au suivi des contrôles";
  } else if (panneau?.mode === "modifier" && siteOuvert) {
    titrePanneau = "Modifier le site";
    sousTitrePanneau = siteOuvert.nom;
  } else if (siteOuvert) {
    titrePanneau = siteOuvert.nom;
    sousTitrePanneau = `${siteOuvert.type_site_libelle} · ${siteOuvert.localisation}`;
  }

  // ---- Filtrage ----

  const nombrePour = (valeur: Segment) => sites.filter((s) => correspond(s, valeur)).length;

  const terme = recherche.trim().toLowerCase();
  const visibles = sites.filter((s) => {
    if (!correspond(s, segment)) return false;
    if (filtreType && String(s.type_site) !== filtreType) return false;
    if (!terme) return true;
    return [s.nom, s.localisation, s.type_site_libelle, s.partenaire_nom ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(terme);
  });

  return (
    <div className="spg-page">
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <div className="entete-page">
        <h1>Sites</h1>
      </div>

      {erreur && (
        <div className="spg-ile-zone">
          <div className="spg-ile" role="alert">
            <span className="spg-ile-point" aria-hidden="true" />
            <span className="spg-ile-texte">{erreur}</span>
          </div>
        </div>
      )}

      {/* Pilule : filtres + bouton d'ajout */}
      <div className="lst-ilot-zone">
        <div className="lst-ilot" role="group" aria-label="Filtrer les sites">
          {SEGMENTS.map((s) => {
            const nombre = nombrePour(s.valeur);
            return (
              <button
                key={s.valeur}
                type="button"
                aria-pressed={segment === s.valeur}
                className={`lst-segment${segment === s.valeur ? " actif" : ""}`}
                onClick={() => setSegment(s.valeur)}
                title={`${nombre} site${nombre > 1 ? "s" : ""}`}
              >
                {s.libelle}
              </button>
            );
          })}

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
            Nouveau site
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
            placeholder="Rechercher un site, un lieu, un partenaire…"
            aria-label="Rechercher un site"
          />
        </div>

        <select
          className="lst-select"
          value={filtreType}
          onChange={(e) => setFiltreType(e.target.value)}
          aria-label="Filtrer par type de site"
        >
          <option value="">Tous les types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.libelle}
            </option>
          ))}
        </select>
      </div>

      {chargement ? (
        <div className="lst-chargement">
          <span className="lst-spinner" aria-hidden="true" />
          Chargement des sites…
        </div>
      ) : (
        <div className="lst-tableau-cadre">
          {visibles.length === 0 ? (
            <p className="lst-vide">
              {sites.length === 0
                ? "Aucun site pour l'instant. Cliquez sur « Nouveau site »."
                : "Aucun site ne correspond à ces critères."}
            </p>
          ) : (
            <table className="lst-tableau">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Type</th>
                  <th>Partenaire</th>
                  <th>Dernier contrôle</th>
                  <th className="centre">Contrôles</th>
                  <th className="centre">Non-conformités</th>
                  <th>Statut</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((s) => {
                  const ouvertes = s.non_conformites_ouvertes ?? 0;
                  return (
                    <tr
                      key={s.id}
                      className={`cliquable${ouvertes > 0 ? " attention" : ""}`}
                      tabIndex={0}
                      onClick={(e) => ouvrir("voir", { x: e.clientX, y: e.clientY }, s)}
                      onKeyDown={(e) => surTouche(e, s)}
                    >
                      <td className="lst-nom">
                        <strong>{s.nom}</strong>
                        <span>{s.localisation}</span>
                      </td>
                      <td>{s.type_site_libelle}</td>
                      <td>{s.partenaire_nom || <span className="lst-absent">Non renseigné</span>}</td>
                      <td>
                        {s.dernier_controle ? (
                          formaterDate(s.dernier_controle)
                        ) : (
                          <span className="lst-absent">Jamais contrôlé</span>
                        )}
                      </td>
                      <td className="centre">{s.nombre_controles ?? 0}</td>
                      <td className="centre">
                        <span className={`lst-compteur ${ouvertes > 0 ? "alerte" : "zero"}`}>
                          {ouvertes}
                        </span>
                      </td>
                      <td>
                        <span className={`lst-statut ${s.est_actif ? "actif" : "inactif"}`}>
                          {s.est_actif ? "Suivi" : "Non suivi"}
                        </span>
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
                <FormulaireSite
                  types={types}
                  partenaires={partenaires}
                  onEnvoyer={async (donnees) => {
                    await creer(donnees);
                    fermer();
                  }}
                  onAnnuler={fermer}
                />
              )}

              {panneau.mode === "modifier" && siteOuvert && (
                <FormulaireSite
                  site={siteOuvert}
                  types={types}
                  partenaires={partenaires}
                  onEnvoyer={(donnees) => modifier(siteOuvert.id, donnees)}
                  onAnnuler={() => changerMode("voir")}
                />
              )}

              {panneau.mode === "voir" && siteOuvert && (
                <DetailSite
                  site={siteOuvert}
                  onModifier={() => changerMode("modifier")}
                  onChangerStatut={(actif) => changerStatut(siteOuvert, actif)}
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