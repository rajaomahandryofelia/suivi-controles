import { useState } from "react";
import type { FormEvent } from "react";
import {
  GRAVITES,
  SERVICES,
  TYPES,
  libelleService,
  localVersIso,
  maintenantLocal,
  messageErreur,
} from "./outils";
import type { DonneesIncident, SiteChoix } from "./types";

interface Props {
  sites: SiteChoix[];
  onEnvoyer: (donnees: DonneesIncident, fichiers: File[]) => Promise<void>;
  onAnnuler: () => void;
}

// Déclaration d'un incident : le Directeur et les contrôleurs peuvent la remplir
export default function FormulaireIncident({ sites, onEnvoyer, onAnnuler }: Props) {
  const [site, setSite] = useState("");
  const [service, setService] = useState("RADIO");
  const [type, setType] = useState("INTERRUPTION");
  const [gravite, setGravite] = useState("MAJEURE");
  const [debut, setDebut] = useState(maintenantLocal());
  const [cause, setCause] = useState("");
  const [observations, setObservations] = useState("");
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  // Les services proposés dépendent du site : un site « Radio » ne diffuse pas de télévision
  const siteChoisi = sites.find((s) => String(s.id) === site);
  const servicesPermis =
    siteChoisi && siteChoisi.service !== "RADIO_TELEVISION"
      ? SERVICES.filter((s) => s.valeur === siteChoisi.service)
      : SERVICES;

  function choisirSite(valeur: string) {
    setSite(valeur);
    const choisi = sites.find((s) => String(s.id) === valeur);
    // Un site qui ne diffuse qu'un service : on le sélectionne d'office
    if (choisi && choisi.service !== "RADIO_TELEVISION") setService(choisi.service);
  }

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (!site) {
      setErreur("Choisissez le site concerné.");
      return;
    }
    if (!debut) {
      setErreur("Indiquez la date et l'heure du début.");
      return;
    }
    setErreur("");
    setEnvoi(true);
    try {
      await onEnvoyer(
        {
          site: Number(site),
          service,
          type,
          gravite,
          date_debut: localVersIso(debut),
          cause_supposee: cause.trim(),
          observations: observations.trim(),
        },
        fichiers
      );
    } catch (erreurApi) {
      setErreur(messageErreur(erreurApi, "Impossible de déclarer l'incident."));
      setEnvoi(false);
    }
  }

  return (
    <form className="inc-formulaire" onSubmit={valider}>
      <label className="inc-champ">
        <span>Site concerné</span>
        <select value={site} onChange={(e) => choisirSite(e.target.value)} required>
          <option value="">Choisir un site…</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom} — {s.localisation} ({libelleService(s.service)})
            </option>
          ))}
        </select>
      </label>

      <div className="inc-ligne">
        <label className="inc-champ">
          <span>Service affecté</span>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            disabled={servicesPermis.length === 1}
          >
            {servicesPermis.map((s) => (
              <option key={s.valeur} value={s.valeur}>
                {s.libelle}
              </option>
            ))}
          </select>
        </label>

        <label className="inc-champ">
          <span>Type d'incident</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t.valeur} value={t.valeur}>
                {t.libelle}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="inc-champ">
        <span>Gravité</span>
        <div className="inc-choix" role="group" aria-label="Gravité">
          {GRAVITES.map((g) => (
            <button
              key={g.valeur}
              type="button"
              aria-pressed={gravite === g.valeur}
              className={`inc-choix-bouton ${g.valeur}${gravite === g.valeur ? " actif" : ""}`}
              onClick={() => setGravite(g.valeur)}
            >
              {g.libelle}
            </button>
          ))}
        </div>
      </div>

      <label className="inc-champ">
        <span>Début de l'incident</span>
        <input
          type="datetime-local"
          value={debut}
          max={maintenantLocal()}
          onChange={(e) => setDebut(e.target.value)}
          required
        />
      </label>

      <label className="inc-champ">
        <span>Cause supposée (facultatif)</span>
        <input
          type="text"
          value={cause}
          maxLength={500}
          placeholder="Ex. : coupure JIRAMA, défaut du groupe électrogène…"
          onChange={(e) => setCause(e.target.value)}
        />
      </label>

      <label className="inc-champ">
        <span>Observations (facultatif)</span>
        <textarea
          rows={3}
          value={observations}
          placeholder="Ce qui a été constaté, ce qui a été fait…"
          onChange={(e) => setObservations(e.target.value)}
        />
      </label>

      <label className="inc-champ">
        <span>Preuves : photos ou PDF (facultatif, 10 Mo maximum chacune)</span>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => setFichiers(Array.from(e.target.files ?? []))}
        />
        {fichiers.length > 0 && (
          <small className="inc-aide">
            {fichiers.length} fichier{fichiers.length > 1 ? "s" : ""} sélectionné
            {fichiers.length > 1 ? "s" : ""}
          </small>
        )}
      </label>

      {erreur && (
        <p className="inc-erreur" role="alert">
          {erreur}
        </p>
      )}

      <div className="inc-actions">
        <button type="button" className="inc-secondaire" onClick={onAnnuler} disabled={envoi}>
          Annuler
        </button>
        <button type="submit" className="bouton" disabled={envoi}>
          {envoi ? "Envoi…" : "Déclarer l'incident"}
        </button>
      </div>
    </form>
  );
}