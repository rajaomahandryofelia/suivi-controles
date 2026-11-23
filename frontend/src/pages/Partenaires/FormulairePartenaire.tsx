import { useState } from "react";
import type { FormEvent } from "react";
import { messagesErreur } from "../Missions/outils";
import type { DonneesPartenaire, Partenaire } from "./types";

interface Props {
  partenaire?: Partenaire; // présent = modification, absent = création
  onEnvoyer: (donnees: DonneesPartenaire) => Promise<void>;
  onAnnuler: () => void;
}

export default function FormulairePartenaire({ partenaire, onEnvoyer, onAnnuler }: Props) {
  const [nom, setNom] = useState(partenaire?.nom ?? "");
  const [contact, setContact] = useState(partenaire?.contact ?? "");
  const [telephone, setTelephone] = useState(partenaire?.telephone ?? "");
  const [email, setEmail] = useState(partenaire?.email ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  // En modification : rien à enregistrer tant que rien n'a changé
  const modifie =
    !partenaire ||
    nom.trim() !== partenaire.nom ||
    contact.trim() !== partenaire.contact ||
    telephone.trim() !== partenaire.telephone ||
    email.trim() !== partenaire.email;

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur("");
    setEnvoi(true);
    try {
      await onEnvoyer({
        nom: nom.trim(),
        contact: contact.trim(),
        telephone: telephone.trim(),
        email: email.trim(),
      });
      // Succès : le panneau se ferme ou change de vue, le bouton reste bloqué d'ici là
    } catch (e) {
      setErreur(
        messagesErreur(
          e,
          partenaire
            ? "Le partenaire n'a pas pu être modifié."
            : "Le partenaire n'a pas pu être créé."
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

      <div className="sit-grille">
        <div className="champ sit-champ-large">
          <label htmlFor="pat-nom">Nom du partenaire</label>
          <input
            id="pat-nom"
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            maxLength={100}
            placeholder="Station de télévision, radio, fournisseur internet…"
            required
          />
        </div>

        <div className="champ sit-champ-large">
          <label htmlFor="pat-contact">Personne à contacter (facultatif)</label>
          <input
            id="pat-contact"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="champ">
          <label htmlFor="pat-telephone">Téléphone (facultatif)</label>
          <input
            id="pat-telephone"
            type="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            maxLength={20}
          />
        </div>

        <div className="champ">
          <label htmlFor="pat-email">E-mail (facultatif)</label>
          <input
            id="pat-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={100}
          />
        </div>
      </div>

      <div className="ile-actions">
        <button type="button" className="bouton secondaire" onClick={onAnnuler} disabled={envoi}>
          Annuler
        </button>
        <button type="submit" className="bouton" disabled={envoi || !modifie}>
          {envoi ? "Enregistrement…" : partenaire ? "Enregistrer" : "Créer le partenaire"}
        </button>
      </div>
    </form>
  );
}