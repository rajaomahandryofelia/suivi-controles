import { useState } from "react";
import type { FormEvent } from "react";
import { messagesErreur } from "../Missions/outils";
import { LIBELLES_REPONSE } from "./types";
import type { Critere, DonneesCritere, TypeReponse } from "./types";

interface Props {
  critere?: Critere; // présent = modification, absent = création
  onEnvoyer: (donnees: DonneesCritere) => Promise<void>;
  onSupprimer?: () => Promise<void>; // fourni uniquement en modification
  onAnnuler: () => void;
}

const TYPES_REPONSE = Object.keys(LIBELLES_REPONSE) as TypeReponse[];

export default function FormulaireCritere({ critere, onEnvoyer, onSupprimer, onAnnuler }: Props) {
  const [libelle, setLibelle] = useState(critere?.libelle ?? "");
  const [typeReponse, setTypeReponse] = useState<TypeReponse>(critere?.type_reponse ?? "OUI_NON");
  const [ponderation, setPonderation] = useState(critere?.ponderation ?? "1");
  const [estObligatoire, setEstObligatoire] = useState(critere?.est_obligatoire ?? true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  // Confirmation de suppression affichée dans le formulaire (pas de boîte du navigateur)
  const [suppression, setSuppression] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const modifie =
    !critere ||
    libelle.trim() !== critere.libelle ||
    typeReponse !== critere.type_reponse ||
    ponderation.trim() !== critere.ponderation ||
    estObligatoire !== critere.est_obligatoire;

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    if (suppression) return;
    setErreur("");
    setEnvoi(true);
    try {
      await onEnvoyer({
        libelle: libelle.trim(),
        type_reponse: typeReponse,
        ponderation: ponderation.trim(),
        est_obligatoire: estObligatoire,
      });
      // Succès : le panneau change de vue, le bouton reste bloqué d'ici là
    } catch (e) {
      setErreur(
        messagesErreur(
          e,
          critere ? "Le critère n'a pas pu être modifié." : "Le critère n'a pas pu être ajouté."
        )
      );
      setEnvoi(false);
    }
  }

  async function supprimer() {
    if (!onSupprimer) return;
    setErreur("");
    setSuppressionEnCours(true);
    try {
      await onSupprimer();
      // Succès : le panneau change de vue
    } catch (e) {
      setErreur(messagesErreur(e, "Le critère n'a pas pu être supprimé."));
      setSuppressionEnCours(false);
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

      <div className="sit-grille">
        <div className="champ sit-champ-large">
          <label htmlFor="gri-critere-libelle">Libellé du critère</label>
          <input
            id="gri-critere-libelle"
            type="text"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            maxLength={255}
            placeholder="Ex. Les haubans sont en bon état"
            required
          />
        </div>

        <div className="champ sit-champ-large">
          <label htmlFor="gri-critere-type">Type de réponse</label>
          <select
            id="gri-critere-type"
            value={typeReponse}
            onChange={(e) => setTypeReponse(e.target.value as TypeReponse)}
            required
          >
            {TYPES_REPONSE.map((t) => (
              <option key={t} value={t}>
                {LIBELLES_REPONSE[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="champ sit-champ-large">
          <label htmlFor="gri-critere-ponderation">Pondération</label>
          <input
            id="gri-critere-ponderation"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={ponderation}
            onChange={(e) => setPonderation(e.target.value)}
            required
          />
          <p className="sit-aide">Poids de ce critère par rapport aux autres critères du modèle.</p>
        </div>

        <label className="sit-case sit-champ-large">
          <input
            type="checkbox"
            checked={estObligatoire}
            onChange={(e) => setEstObligatoire(e.target.checked)}
          />
          <span>
            Réponse obligatoire
            <small>Le contrôleur devra répondre à ce critère.</small>
          </span>
        </label>
      </div>

      {suppression ? (
        <>
          <p className="sit-aide alerte" role="alert">
            Supprimer définitivement ce critère ? Cette action est irréversible.
          </p>
          <div className="ile-actions">
            <button
              type="button"
              className="bouton secondaire"
              onClick={() => setSuppression(false)}
              disabled={suppressionEnCours}
            >
              Non, le garder
            </button>
            <button
              type="button"
              className="bouton danger"
              onClick={supprimer}
              disabled={suppressionEnCours}
            >
              {suppressionEnCours ? "Suppression…" : "Oui, supprimer"}
            </button>
          </div>
        </>
      ) : (
        <div className="ile-actions">
          {critere && onSupprimer && (
            <button
              type="button"
              className="bouton danger"
              style={{ marginRight: "auto" }}
              onClick={() => setSuppression(true)}
              disabled={envoi}
            >
              Supprimer
            </button>
          )}
          <button type="button" className="bouton secondaire" onClick={onAnnuler} disabled={envoi}>
            Annuler
          </button>
          <button type="submit" className="bouton" disabled={envoi || !modifie}>
            {envoi ? "Enregistrement…" : critere ? "Enregistrer" : "Ajouter le critère"}
          </button>
        </div>
      )}
    </form>
  );
}