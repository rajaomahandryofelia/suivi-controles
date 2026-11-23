import { useState } from "react";
import type { FormEvent } from "react";
import { messagesErreur } from "../Missions/outils";
import { MODELES_TYPES, trouverType } from "./modelesTypes";
import type { ModeleType } from "./modelesTypes";
import { LIBELLES_REPONSE } from "./types";
import type {
  DonneesCritere,
  DonneesModele,
  DonneesTypeSite,
  Modele,
  TypeReponse,
  TypeSite,
} from "./types";
import "./CreationModele.css";

interface Props {
  modele?: Modele; // présent = modification, absent = création
  types: TypeSite[];
  // En création, les critères sont envoyés avec le modèle ; en modification, la liste est vide
  onEnvoyer: (donnees: DonneesModele, criteres: DonneesCritere[]) => Promise<void>;
  // Création rapide du type de site conseillé par un modèle type (création uniquement)
  onCreerType?: (donnees: DonneesTypeSite) => Promise<TypeSite>;
  onAnnuler: () => void;
}

// Une ligne de la liste de critères (en cours de saisie)
interface Ligne {
  cle: number;
  libelle: string;
  type_reponse: TypeReponse;
  ponderation: string;
  est_obligatoire: boolean;
}

let prochaineCle = 0;

function nouvelleLigne(depart?: Partial<DonneesCritere>): Ligne {
  prochaineCle += 1;
  return {
    cle: prochaineCle,
    libelle: depart?.libelle ?? "",
    type_reponse: depart?.type_reponse ?? "OUI_NON",
    ponderation: depart?.ponderation !== undefined ? String(depart.ponderation) : "1",
    est_obligatoire: depart?.est_obligatoire ?? true,
  };
}

export default function FormulaireModele({ modele, types, onEnvoyer, onCreerType, onAnnuler }: Props) {
  const creation = !modele;

  const [nom, setNom] = useState(modele?.nom ?? "");
  const [typeId, setTypeId] = useState(modele ? String(modele.type_site) : "");
  // Vrai tant que le type de site a été choisi par un modèle type (et non à la main)
  const [typeAuto, setTypeAuto] = useState(false);
  const [description, setDescription] = useState(modele?.description ?? "");
  const [estActif, setEstActif] = useState(modele?.est_actif ?? true);
  const [lignes, setLignes] = useState<Ligne[]>(() => (creation ? [nouvelleLigne()] : []));
  const [typeChoisi, setTypeChoisi] = useState("");
  const [creationType, setCreationType] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  // Un modèle déjà utilisé par des missions garde son type de site
  const typeVerrouille = (modele?.nombre_missions ?? 0) > 0;

  // Seuls les types actifs sont proposés (plus celui que le modèle a déjà)
  const typesChoisissables = types.filter((t) => t.est_actif || String(t.id) === typeId);

  const modifie =
    creation ||
    nom.trim() !== modele.nom ||
    typeId !== String(modele.type_site) ||
    description.trim() !== modele.description ||
    estActif !== modele.est_actif;

  const nbObligatoires = lignes.filter((l) => l.est_obligatoire).length;

  // Le modèle type choisi, son type de site conseillé, et son état
  const modeleType = MODELES_TYPES.find((m) => m.cle === typeChoisi);
  const typeExistant = modeleType ? trouverType(types, modeleType) : undefined;
  const typeDesactive = !!typeExistant && !typeExistant.est_actif;
  const choixLibre = typeId === "" || typeAuto;
  const proposerCreationType = creation && !!onCreerType && !!modeleType && !typeExistant && choixLibre;
  const signalerTypeDesactive = creation && !!modeleType && typeDesactive && choixLibre;

  function appliquerModeleType(m: ModeleType) {
    setTypeChoisi(m.cle);
    setLignes(m.criteres.map((c) => nouvelleLigne(c)));
    if (!nom.trim()) setNom(m.titre);
    if (!description.trim()) setDescription(m.description);

    // On choisit le type de site conseillé (s'il est actif), sans écraser un choix fait à la main
    if (typeId === "" || typeAuto) {
      const existant = trouverType(types, m);
      const utilisable = existant && existant.est_actif ? existant : undefined;
      setTypeId(utilisable ? String(utilisable.id) : "");
      setTypeAuto(!!utilisable);
    }
  }

  async function creerTypeConseille(m: ModeleType) {
    if (!onCreerType) return;
    setErreur("");
    setCreationType(true);
    try {
      const cree = await onCreerType({
        libelle: m.typeSite.libelle,
        description: m.typeSite.description,
      });
      setTypeId(String(cree.id));
      setTypeAuto(true);
    } catch (e) {
      setErreur(messagesErreur(e, "Le type de site n'a pas pu être créé."));
    } finally {
      setCreationType(false);
    }
  }

  function changerLigne(cle: number, changement: Partial<Ligne>) {
    setLignes((anciennes) => anciennes.map((l) => (l.cle === cle ? { ...l, ...changement } : l)));
  }

  function deplacer(index: number, sens: -1 | 1) {
    setLignes((anciennes) => {
      const cible = index + sens;
      if (cible < 0 || cible >= anciennes.length) return anciennes;
      const copie = [...anciennes];
      [copie[index], copie[cible]] = [copie[cible], copie[index]];
      return copie;
    });
  }

  function retirer(cle: number) {
    setLignes((anciennes) => anciennes.filter((l) => l.cle !== cle));
  }

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur("");

    if (creation) {
      if (lignes.length === 0) {
        setErreur("Ajoutez au moins un critère : un modèle sans critère ne peut pas servir à un contrôle.");
        return;
      }
      const sansLibelle = lignes.findIndex((l) => l.libelle.trim() === "");
      if (sansLibelle >= 0) {
        setErreur(`Le critère n° ${sansLibelle + 1} n'a pas de libellé.`);
        return;
      }
      const mauvaisPoids = lignes.findIndex(
        (l) =>
          l.ponderation.trim() === "" ||
          !(Number(l.ponderation) >= 0) ||
          Number(l.ponderation) > 999
      );
      if (mauvaisPoids >= 0) {
        setErreur(`Le poids du critère n° ${mauvaisPoids + 1} doit être un nombre entre 0 et 999.`);
        return;
      }
    }

    setEnvoi(true);
    try {
      await onEnvoyer(
        {
          nom: nom.trim(),
          description: description.trim(),
          type_site: Number(typeId),
          est_actif: estActif,
        },
        creation
          ? lignes.map((l) => ({
              libelle: l.libelle.trim(),
              type_reponse: l.type_reponse,
              ponderation: String(Number(l.ponderation)),
              est_obligatoire: l.est_obligatoire,
            }))
          : []
      );
      // Succès : le panneau change de vue, le bouton reste bloqué d'ici là
    } catch (e) {
      setErreur(
        messagesErreur(
          e,
          creation ? "Le modèle n'a pas pu être créé." : "Le modèle n'a pas pu être modifié."
        )
      );
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      {erreur && (
        <div className="ile-erreur" role="alert">
          {erreur}
        </div>
      )}

      {creation && (
        <div className="crm-section" style={{ marginTop: 0 }}>
          <p className="crm-titre">Partir d'un modèle type</p>
          <p className="crm-aide">
            Choisissez un modèle prêt à l'emploi, puis adaptez-le. Les critères actuels seront remplacés.
          </p>
          <div className="crm-puces">
            {MODELES_TYPES.map((m) => (
              <button
                key={m.cle}
                type="button"
                className={`crm-puce${typeChoisi === m.cle ? " actif" : ""}`}
                onClick={() => appliquerModeleType(m)}
                title={m.description}
              >
                {m.titre}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sit-grille crm-section">
        <div className="champ sit-champ-large">
          <label htmlFor="gri-nom">Nom du modèle</label>
          <input
            id="gri-nom"
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            maxLength={100}
            placeholder="Ex. Contrôle d'un pylône"
            required
          />
        </div>

        <div className="champ sit-champ-large">
          <label htmlFor="gri-type">Type de site concerné</label>
          <select
            id="gri-type"
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              setTypeAuto(false);
            }}
            disabled={typeVerrouille}
            required
          >
            <option value="">— Choisir un type —</option>
            {typesChoisissables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.libelle}
                {t.est_actif ? "" : " (inactif)"}
              </option>
            ))}
          </select>

          {proposerCreationType && modeleType && (
            <div className="crm-type-propose">
              <span>Le type « {modeleType.typeSite.libelle} » n'existe pas encore.</span>
              <button
                type="button"
                className="crm-type-bouton"
                onClick={() => creerTypeConseille(modeleType)}
                disabled={creationType}
              >
                {creationType ? "Création…" : "Créer ce type"}
              </button>
            </div>
          )}

          {signalerTypeDesactive && typeExistant && (
            <p className="sit-aide alerte">
              Le type « {typeExistant.libelle} » est désactivé. Réactivez-le dans l'onglet « Types de site »,
              ou choisissez un autre type.
            </p>
          )}

          {typesChoisissables.length === 0 && !proposerCreationType && !signalerTypeDesactive && (
            <p className="sit-aide alerte">
              Aucun type de site actif. Créez-en un d'abord dans l'onglet « Types de site ».
            </p>
          )}
          {typeVerrouille && (
            <p className="sit-aide">
              Ce modèle est utilisé par des missions : son type de site ne peut plus changer.
            </p>
          )}
        </div>

        <div className="champ sit-champ-large">
          <label htmlFor="gri-description">Description (facultatif)</label>
          <input
            id="gri-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={255}
          />
        </div>

        <label className="sit-case sit-champ-large">
          <input type="checkbox" checked={estActif} onChange={(e) => setEstActif(e.target.checked)} />
          <span>
            Modèle actif
            <small>Un modèle actif peut être choisi pour une nouvelle mission.</small>
          </span>
        </label>
      </div>

      {creation && (
        <div className="crm-section">
          <p className="crm-titre">
            Critères du contrôle
            <small>
              {lignes.length} critère{lignes.length > 1 ? "s" : ""} · {nbObligatoires} obligatoire
              {nbObligatoires > 1 ? "s" : ""}
            </small>
          </p>
          <p className="crm-aide">
            Le poids mesure l'importance du critère dans le score de conformité. Un critère obligatoire doit
            être rempli pour clôturer la mission.
          </p>

          <ol className="crm-lignes">
            {lignes.map((l, i) => (
              <li key={l.cle} className="crm-ligne">
                <span className="crm-numero">{i + 1}</span>
                <div className="crm-corps">
                  <input
                    type="text"
                    aria-label={`Libellé du critère ${i + 1}`}
                    value={l.libelle}
                    onChange={(e) => changerLigne(l.cle, { libelle: e.target.value })}
                    maxLength={255}
                    placeholder="Ex. Balisage lumineux en état de fonctionnement"
                  />
                  <div className="crm-reglages">
                    <select
                      aria-label={`Type de réponse du critère ${i + 1}`}
                      value={l.type_reponse}
                      onChange={(e) => changerLigne(l.cle, { type_reponse: e.target.value as TypeReponse })}
                    >
                      {Object.entries(LIBELLES_REPONSE).map(([valeur, texte]) => (
                        <option key={valeur} value={valeur}>
                          {texte}
                        </option>
                      ))}
                    </select>

                    <label className="crm-poids">
                      Poids
                      <input
                        type="number"
                        min={0}
                        max={999}
                        step="0.5"
                        value={l.ponderation}
                        onChange={(e) => changerLigne(l.cle, { ponderation: e.target.value })}
                        aria-label={`Poids du critère ${i + 1}`}
                      />
                    </label>

                    <label className={`crm-obligatoire${l.est_obligatoire ? " oui" : ""}`}>
                      <input
                        type="checkbox"
                        checked={l.est_obligatoire}
                        onChange={(e) => changerLigne(l.cle, { est_obligatoire: e.target.checked })}
                      />
                      {l.est_obligatoire ? "Obligatoire" : "Facultatif"}
                    </label>

                    <span className="crm-actions">
                      <button
                        type="button"
                        onClick={() => deplacer(i, -1)}
                        disabled={i === 0}
                        aria-label="Monter ce critère"
                        title="Monter"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => deplacer(i, 1)}
                        disabled={i === lignes.length - 1}
                        aria-label="Descendre ce critère"
                        title="Descendre"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="retirer"
                        onClick={() => retirer(l.cle)}
                        aria-label="Retirer ce critère"
                        title="Retirer"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <button type="button" className="crm-ajout" onClick={() => setLignes((a) => [...a, nouvelleLigne()])}>
            + Ajouter un critère
          </button>
        </div>
      )}

      <div className="ile-actions">
        <button type="button" className="bouton secondaire" onClick={onAnnuler} disabled={envoi}>
          Annuler
        </button>
        <button type="submit" className="bouton" disabled={envoi || !modifie}>
          {envoi ? "Enregistrement…" : creation ? "Créer le modèle" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}