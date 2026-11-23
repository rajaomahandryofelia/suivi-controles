import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import api from "../../api/client";
import BoutonRetour from "../../components/BoutonRetour";
import Notification from "../../components/Notification";
import PanneauVerre from "../../components/PanneauVerre";
import type { Origine } from "../../components/PanneauIle";
import { extraireListe, origineDe } from "../outilsListe";
import DetailModele from "./DetailModele";
import FormulaireCritere from "./FormulaireCritere";
import FormulaireModele from "./FormulaireModele";
import FormulaireTypeSite from "./FormulaireTypeSite";
import { URL_CRITERES, URL_MODELES, URL_TYPES } from "./types";
import type {
  Critere,
  DonneesCritere,
  DonneesModele,
  DonneesTypeSite,
  Modele,
  ModePanneau,
  Onglet,
  TypeSite,
} from "./types";
import "../Liste.css";
import "../Sites/Sites.css";
import "./Grilles.css";

interface EtatPanneau {
  mode: ModePanneau;
  modele?: Modele;
  critere?: Critere;
  typeSite?: TypeSite;
  origine: Origine;
}

interface EtatNotification {
  cle: number;
  type: "succes" | "erreur";
  texte: string;
}

export default function Grilles() {
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [types, setTypes] = useState<TypeSite[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [onglet, setOnglet] = useState<Onglet>("modeles");
  const [recherche, setRecherche] = useState("");
  const [panneau, setPanneau] = useState<EtatPanneau | null>(null);
  const [notification, setNotification] = useState<EtatNotification | null>(null);

  const notifier = useCallback((type: "succes" | "erreur", texte: string) => {
    setNotification({ cle: Date.now(), type, texte });
  }, []);
  const fermerNotification = useCallback(() => setNotification(null), []);
  const fermerPanneau = useCallback(() => setPanneau(null), []);

  // ---- Chargement des données (synchronisées avec le backend) ----

  const charger = useCallback(async (silencieux = false) => {
    try {
      const [m, t] = await Promise.all([api.get(URL_MODELES), api.get(URL_TYPES)]);
      setModeles(extraireListe<Modele>(m.data));
      setTypes(extraireListe<TypeSite>(t.data));
      setErreur("");
    } catch {
      if (!silencieux) setErreur("Impossible de charger les grilles et les types de site.");
    } finally {
      if (!silencieux) setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // ---- Panneau ----

  function ouvrir(mode: ModePanneau, origine: Origine, elements: Partial<EtatPanneau> = {}) {
    setPanneau({ mode, origine, ...elements });
  }

  function changerMode(mode: ModePanneau, elements: Partial<EtatPanneau> = {}) {
    setPanneau((p) => (p ? { ...p, mode, ...elements } : p));
  }

  // ---- Opérations : modèles de grille ----

  // Crée le modèle, puis ses critères un par un (dans l'ordre de la liste)
  async function creerModele(donnees: DonneesModele, criteres: DonneesCritere[]) {
    // Si cette étape échoue, l'erreur remonte au formulaire qui l'affiche
    const reponse = await api.post(URL_MODELES, donnees);
    const cree = reponse.data as Modele;

    let ajoutes = 0;
    try {
      for (let i = 0; i < criteres.length; i += 1) {
        await api.post(URL_CRITERES, { ...criteres[i], modele: cree.id, ordre: i + 1 });
        ajoutes += 1;
      }
    } catch {
      // Le modèle existe : on l'ouvre pour que l'utilisateur complète les critères manquants
      notifier(
        "erreur",
        `Le modèle « ${donnees.nom} » a été créé, mais seuls ${ajoutes} critère${ajoutes > 1 ? "s" : ""} sur ${criteres.length} ont été ajoutés. Complétez-les ci-dessous.`
      );
      await charger(true);
      changerMode("modele-voir", { modele: cree });
      return;
    }

    notifier(
      "succes",
      `Le modèle « ${donnees.nom} » a été créé avec ${criteres.length} critère${criteres.length > 1 ? "s" : ""}.`
    );
    await charger(true);
    changerMode("modele-voir", { modele: cree });
  }

  async function modifierModele(id: number, donnees: DonneesModele) {
    await api.patch(`${URL_MODELES}${id}/`, donnees);
    notifier("succes", "Le modèle a été modifié.");
    await charger(true);
    changerMode("modele-voir");
  }

  async function changerStatutModele(modele: Modele, actif: boolean) {
    await api.patch(`${URL_MODELES}${modele.id}/`, { est_actif: actif });
    notifier(
      "succes",
      actif ? `Le modèle « ${modele.nom} » est de nouveau actif.` : `Le modèle « ${modele.nom} » est désactivé.`
    );
    await charger(true);
  }

  async function supprimerModele(modele: Modele) {
    await api.delete(`${URL_MODELES}${modele.id}/`);
    notifier("succes", `Le modèle « ${modele.nom} » a été supprimé.`);
    await charger(true);
  }

  // ---- Opérations : critères ----

  async function creerCritere(modele: Modele, donnees: DonneesCritere) {
    const dernierOrdre = modele.criteres.reduce((max, c) => Math.max(max, c.ordre), 0);
    await api.post(URL_CRITERES, { ...donnees, modele: modele.id, ordre: dernierOrdre + 1 });
    notifier("succes", "Le critère a été ajouté.");
    await charger(true);
    changerMode("modele-voir", { critere: undefined });
  }

  async function modifierCritere(critere: Critere, donnees: DonneesCritere) {
    await api.patch(`${URL_CRITERES}${critere.id}/`, donnees);
    notifier("succes", "Le critère a été modifié.");
    await charger(true);
    changerMode("modele-voir", { critere: undefined });
  }

  async function supprimerCritere(critere: Critere) {
    await api.delete(`${URL_CRITERES}${critere.id}/`);
    notifier("succes", "Le critère a été supprimé.");
    await charger(true);
    changerMode("modele-voir", { critere: undefined });
  }

  async function reordonner(modele: Modele, ids: number[]) {
    await api.post(`${URL_MODELES}${modele.id}/reordonner/`, { ordre: ids });
    await charger(true);
  }

  // ---- Opérations : types de site ----

  async function creerType(donnees: DonneesTypeSite) {
    await api.post(URL_TYPES, donnees);
    notifier("succes", `Le type « ${donnees.libelle} » a été créé.`);
    await charger(true);
  }

  // Création depuis le formulaire de modèle : renvoie le type créé pour qu'il soit sélectionné
  async function creerTypeRapide(donnees: DonneesTypeSite): Promise<TypeSite> {
    const reponse = await api.post(URL_TYPES, donnees);
    notifier("succes", `Le type « ${donnees.libelle} » a été créé.`);
    await charger(true);
    return reponse.data as TypeSite;
  }

  async function modifierType(id: number, donnees: DonneesTypeSite) {
    await api.patch(`${URL_TYPES}${id}/`, donnees);
    notifier("succes", "Le type de site a été modifié.");
    await charger(true);
  }

  async function supprimerType(type: TypeSite) {
    await api.delete(`${URL_TYPES}${type.id}/`);
    notifier("succes", `Le type « ${type.libelle} » a été supprimé.`);
    await charger(true);
  }

  // ---- Éléments affichés dans le panneau (toujours à jour avec la liste) ----

  const modeleOuvert = panneau?.modele
    ? modeles.find((m) => m.id === panneau.modele?.id) ?? panneau.modele
    : undefined;
  const typeOuvert = panneau?.typeSite
    ? types.find((t) => t.id === panneau.typeSite?.id) ?? panneau.typeSite
    : undefined;
  const critereOuvert = panneau?.critere
    ? modeleOuvert?.criteres.find((c) => c.id === panneau.critere?.id) ?? panneau.critere
    : undefined;

  let titrePanneau = "";
  let sousTitrePanneau: string | undefined;
  switch (panneau?.mode) {
    case "modele-creer":
      titrePanneau = "Nouveau modèle de grille";
      sousTitrePanneau = "Partez d'un modèle type ou composez vos critères";
      break;
    case "modele-modifier":
      titrePanneau = "Modifier le modèle";
      sousTitrePanneau = modeleOuvert?.nom;
      break;
    case "modele-voir":
      titrePanneau = modeleOuvert?.nom ?? "";
      sousTitrePanneau = modeleOuvert
        ? `${modeleOuvert.type_site_libelle} · ${modeleOuvert.criteres.length} critère${modeleOuvert.criteres.length > 1 ? "s" : ""}`
        : undefined;
      break;
    case "critere-creer":
      titrePanneau = "Nouveau critère";
      sousTitrePanneau = modeleOuvert?.nom;
      break;
    case "critere-modifier":
      titrePanneau = "Modifier le critère";
      sousTitrePanneau = modeleOuvert?.nom;
      break;
    case "type-creer":
      titrePanneau = "Nouveau type de site";
      sousTitrePanneau = "Un type regroupe des sites de même nature";
      break;
    case "type-modifier":
      titrePanneau = "Modifier le type de site";
      sousTitrePanneau = typeOuvert?.libelle;
      break;
  }

  // ---- Filtrage ----

  const terme = recherche.trim().toLowerCase();
  const modelesVisibles = modeles.filter((m) =>
    !terme ? true : [m.nom, m.description, m.type_site_libelle].join(" ").toLowerCase().includes(terme)
  );
  const typesVisibles = types.filter((t) =>
    !terme ? true : [t.libelle, t.description].join(" ").toLowerCase().includes(terme)
  );

  function surTouche(e: KeyboardEvent<HTMLTableRowElement>, mode: ModePanneau, elements: Partial<EtatPanneau>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ouvrir(mode, origineDe(e.currentTarget), elements);
    }
  }

  return (
    <div className="gri-page">
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <div className="entete-page">
        <h1>Grilles de contrôle</h1>
      </div>

      {erreur && (
        <div className="gri-ile-zone">
          <div className="gri-ile" role="alert">
            <span className="gri-ile-point" aria-hidden="true" />
            <span className="gri-ile-texte">{erreur}</span>
          </div>
        </div>
      )}

      {/* Pilule : onglets + bouton d'ajout */}
      <div className="lst-ilot-zone">
        <div className="lst-ilot" role="group" aria-label="Choisir la liste à afficher">
          <button
            type="button"
            aria-pressed={onglet === "modeles"}
            className={`lst-segment${onglet === "modeles" ? " actif" : ""}`}
            onClick={() => setOnglet("modeles")}
            title={`${modeles.length} modèle${modeles.length > 1 ? "s" : ""}`}
          >
            Modèles de grille
          </button>
          <button
            type="button"
            aria-pressed={onglet === "types"}
            className={`lst-segment${onglet === "types" ? " actif" : ""}`}
            onClick={() => setOnglet("types")}
            title={`${types.length} type${types.length > 1 ? "s" : ""}`}
          >
            Types de site
          </button>

          <span className="lst-separateur" aria-hidden="true" />
          <button
            type="button"
            className="lst-ajout"
            onClick={(e) =>
              ouvrir(onglet === "modeles" ? "modele-creer" : "type-creer", origineDe(e.currentTarget))
            }
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
            {onglet === "modeles" ? "Nouveau modèle" : "Nouveau type"}
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
            placeholder={onglet === "modeles" ? "Rechercher un modèle…" : "Rechercher un type de site…"}
            aria-label="Rechercher"
          />
        </div>
      </div>

      {chargement ? (
        <div className="lst-chargement">
          <span className="lst-spinner" aria-hidden="true" />
          Chargement…
        </div>
      ) : onglet === "modeles" ? (
        <div className="lst-tableau-cadre">
          {modelesVisibles.length === 0 ? (
            <p className="lst-vide">
              {modeles.length === 0
                ? "Aucun modèle de grille pour l'instant. Cliquez sur « Nouveau modèle »."
                : `Aucun modèle ne correspond à « ${recherche} ».`}
            </p>
          ) : (
            <table className="lst-tableau">
              <thead>
                <tr>
                  <th>Modèle</th>
                  <th>Type de site</th>
                  <th className="centre">Critères</th>
                  <th className="centre">Missions</th>
                  <th>Statut</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {modelesVisibles.map((m) => {
                  const sansCritere = m.criteres.length === 0;
                  return (
                    <tr
                      key={m.id}
                      className={`cliquable${sansCritere && m.est_actif ? " attention" : ""}`}
                      tabIndex={0}
                      onClick={(e) =>
                        ouvrir("modele-voir", { x: e.clientX, y: e.clientY }, { modele: m })
                      }
                      onKeyDown={(e) => surTouche(e, "modele-voir", { modele: m })}
                    >
                      <td className="lst-nom">
                        <strong>{m.nom}</strong>
                        {m.description && <span>{m.description}</span>}
                      </td>
                      <td>{m.type_site_libelle}</td>
                      <td className="centre">
                        <span className={`lst-compteur ${sansCritere ? "alerte" : "ok"}`}>
                          {m.criteres.length}
                        </span>
                      </td>
                      <td className="centre">{m.nombre_missions ?? 0}</td>
                      <td>
                        <span className={`lst-statut ${m.est_actif ? "actif" : "inactif"}`}>
                          {m.est_actif ? "Actif" : "Inactif"}
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
      ) : (
        <div className="lst-tableau-cadre">
          {typesVisibles.length === 0 ? (
            <p className="lst-vide">
              {types.length === 0
                ? "Aucun type de site pour l'instant. Cliquez sur « Nouveau type »."
                : `Aucun type ne correspond à « ${recherche} ».`}
            </p>
          ) : (
            <table className="lst-tableau">
              <thead>
                <tr>
                  <th>Type de site</th>
                  <th>Description</th>
                  <th className="centre">Sites</th>
                  <th className="centre">Modèles de grille</th>
                  <th>Statut</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {typesVisibles.map((t) => (
                  <tr
                    key={t.id}
                    className="cliquable"
                    tabIndex={0}
                    onClick={(e) =>
                      ouvrir("type-modifier", { x: e.clientX, y: e.clientY }, { typeSite: t })
                    }
                    onKeyDown={(e) => surTouche(e, "type-modifier", { typeSite: t })}
                  >
                    <td className="lst-nom">
                      <strong>{t.libelle}</strong>
                    </td>
                    <td>{t.description || <span className="lst-absent">—</span>}</td>
                    <td className="centre">{t.nombre_sites ?? 0}</td>
                    <td className="centre">{t.nombre_modeles ?? 0}</td>
                    <td>
                      <span className={`lst-statut ${t.est_actif ? "actif" : "inactif"}`}>
                        {t.est_actif ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="lst-chevron" aria-hidden="true">
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
              {panneau.mode === "modele-creer" && (
                <FormulaireModele
                  types={types}
                  onEnvoyer={creerModele}
                  onCreerType={creerTypeRapide}
                  onAnnuler={fermer}
                />
              )}

              {panneau.mode === "modele-modifier" && modeleOuvert && (
                <FormulaireModele
                  modele={modeleOuvert}
                  types={types}
                  onEnvoyer={(donnees) => modifierModele(modeleOuvert.id, donnees)}
                  onAnnuler={() => changerMode("modele-voir")}
                />
              )}

              {panneau.mode === "modele-voir" && modeleOuvert && (
                <DetailModele
                  modele={modeleOuvert}
                  onModifier={() => changerMode("modele-modifier")}
                  onChangerStatut={(actif) => changerStatutModele(modeleOuvert, actif)}
                  onSupprimer={async () => {
                    await supprimerModele(modeleOuvert);
                    fermer();
                  }}
                  onAjouterCritere={() => changerMode("critere-creer", { critere: undefined })}
                  onModifierCritere={(critere) => changerMode("critere-modifier", { critere })}
                  onReordonner={(ids) => reordonner(modeleOuvert, ids)}
                  onFermer={fermer}
                />
              )}

              {panneau.mode === "critere-creer" && modeleOuvert && (
                <FormulaireCritere
                  onEnvoyer={(donnees) => creerCritere(modeleOuvert, donnees)}
                  onAnnuler={() => changerMode("modele-voir")}
                />
              )}

              {panneau.mode === "critere-modifier" && critereOuvert && (
                <FormulaireCritere
                  critere={critereOuvert}
                  onEnvoyer={(donnees) => modifierCritere(critereOuvert, donnees)}
                  onSupprimer={() => supprimerCritere(critereOuvert)}
                  onAnnuler={() => changerMode("modele-voir")}
                />
              )}

              {panneau.mode === "type-creer" && (
                <FormulaireTypeSite
                  onEnvoyer={async (donnees) => {
                    await creerType(donnees);
                    fermer();
                  }}
                  onAnnuler={fermer}
                />
              )}

              {panneau.mode === "type-modifier" && typeOuvert && (
                <FormulaireTypeSite
                  typeSite={typeOuvert}
                  onEnvoyer={async (donnees) => {
                    await modifierType(typeOuvert.id, donnees);
                    fermer();
                  }}
                  onSupprimer={async () => {
                    await supprimerType(typeOuvert);
                    fermer();
                  }}
                  onAnnuler={fermer}
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