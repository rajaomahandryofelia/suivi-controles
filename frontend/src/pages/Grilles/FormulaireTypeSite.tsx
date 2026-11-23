import { useState } from "react";
import type { FormEvent } from "react";
import { messagesErreur } from "../Missions/outils";
import { MODELES_TYPES } from "./modelesTypes";
import type { DonneesTypeSite, TypeSite } from "./types";
import "./CreationModele.css";

interface Props {
  typeSite?: TypeSite; // présent = modification, absent = création
  onEnvoyer: (donnees: DonneesTypeSite) => Promise<void>;
  onSupprimer?: () => Promise<void>;
  onAnnuler: () => void;
}

// Types de site courants d'un réseau de diffusion : les 4 premiers sont ceux des modèles de grille
const TYPES_SUGGERES: { libelle: string; description: string }[] = [
  ...MODELES_TYPES.map((m) => ({
    libelle: m.typeSite.libelle,
    description: m.typeSite.description,
  })),
  {
    libelle: "Centre de transmission",
    description: "Site de liaison et de distribution des signaux vers les stations",
  },
  {
    libelle: "Studio de production",
    description: "Studios, régies et salles de montage",
  },
];

export default function FormulaireTypeSite({ typeSite, onEnvoyer, onSupprimer, onAnnuler }: Props) {
  const [libelle, setLibelle] = useState(typeSite?.libelle ?? "");
  const [description, setDescription] = useState(typeSite?.description ?? "");
  const [estActif, setEstActif] = useState(typeSite?.est_actif ?? true);
  const [envoi, setEnvoi] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const [erreur, setErreur] = useState("");

  const creation = !typeSite;

  // Un type utilisé par des sites ou des modèles de grille ne se supprime pas : on le désactive
  const nombreSites = typeSite?.nombre_sites ?? 0;
  const nombreModeles = typeSite?.nombre_modeles ?? 0;
  const utilise = nombreSites > 0 || nombreModeles > 0;

  const modifie =
    creation ||
    libelle.trim() !== typeSite.libelle ||
    description.trim() !== typeSite.description ||
    estActif !== typeSite.est_actif;

  function appliquerSuggestion(suggestion: { libelle: string; description: string }) {
    setLibelle(suggestion.libelle);
    setDescription(suggestion.description);
  }

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      await onEnvoyer({
        libelle: libelle.trim(),
        description: description.trim(),
        est_actif: creation ? true : estActif,
      });
      // Succès : le panneau se ferme, le bouton reste bloqué d'ici là
    } catch (e) {
      setErreur(
        messagesErreur(
          e,
          creation ? "Le type de site n'a pas pu être créé." : "Le type de site n'a pas pu être modifié."
        )
      );
      setEnvoi(false);
    }
  }

  async function supprimer() {
    if (!onSupprimer) return;
    setErreur("");
    setSuppression(true);
    try {
      await onSupprimer();
    } catch (e) {
      setErreur(messagesErreur(e, "Le type de site n'a pas pu être supprimé."));
      setConfirmation(false);
      setSuppression(false);
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
          <p className="crm-titre">Types courants</p>
          <p className="crm-aide">Choisissez un type, puis adaptez son nom ou sa description si besoin.</p>
          <div className="crm-puces">
            {TYPES_SUGGERES.map((s) => (
              <button
                key={s.libelle}
                type="button"
                className={`crm-puce${libelle.trim() === s.libelle ? " actif" : ""}`}
                onClick={() => appliquerSuggestion(s)}
                title={s.description}
              >
                {s.libelle}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sit-grille crm-section">
        <div className="champ sit-champ-large">
          <label htmlFor="typ-libelle">Nom du type</label>
          <input
            id="typ-libelle"
            type="text"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            maxLength={50}
            placeholder="Ex. Pylône, Station, Relais"
            required
          />
        </div>

        <div className="champ sit-champ-large">
          <label htmlFor="typ-description">Description (facultatif)</label>
          <input
            id="typ-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={255}
          />
        </div>

        {!creation && (
          <label className="sit-case sit-champ-large">
            <input type="checkbox" checked={estActif} onChange={(e) => setEstActif(e.target.checked)} />
            <span>
              Type actif
              <small>
                Un type inactif n'est plus proposé pour de nouveaux sites ou modèles de grille. Les sites et
                modèles existants le gardent.
              </small>
            </span>
          </label>
        )}
      </div>

      {!creation && utilise && (
        <p className="sit-aide">
          Ce type est utilisé par {nombreSites} site{nombreSites > 1 ? "s" : ""} et {nombreModeles} modèle
          {nombreModeles > 1 ? "s" : ""} de grille : il ne peut pas être supprimé. Désactivez-le pour ne
          plus le proposer.
        </p>
      )}

      {confirmation ? (
        <div className="ile-confirmation">
          <p>Supprimer définitivement ce type de site ?</p>
          <div className="ile-actions">
            <button
              type="button"
              className="bouton secondaire"
              onClick={() => setConfirmation(false)}
              disabled={suppression}
            >
              Annuler
            </button>
            <button type="button" className="bouton danger" onClick={supprimer} disabled={suppression}>
              {suppression ? "Suppression…" : "Oui, supprimer"}
            </button>
          </div>
        </div>
      ) : (
        <div className="ile-actions">
          <button type="button" className="bouton secondaire" onClick={onAnnuler} disabled={envoi}>
            Annuler
          </button>
          {!creation && onSupprimer && (
            <button
              type="button"
              className="bouton secondaire"
              onClick={() => setConfirmation(true)}
              disabled={envoi || utilise}
              title={utilise ? "Ce type est encore utilisé : désactivez-le" : undefined}
            >
              Supprimer
            </button>
          )}
          <button type="submit" className="bouton" disabled={envoi || !modifie}>
            {envoi ? "Enregistrement…" : creation ? "Créer le type" : "Enregistrer"}
          </button>
        </div>
      )}
    </form>
  );
}