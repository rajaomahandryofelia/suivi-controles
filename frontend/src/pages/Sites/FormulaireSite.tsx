import { useState } from "react";
import type { FormEvent } from "react";
import { messagesErreur } from "../Missions/outils";
import CarteSite from "./CarteSite";
import type { DonneesSite, Option, Site } from "./types";

interface Props {
  site?: Site; // présent = modification, absent = création
  types: Option[];
  partenaires: Option[];
  onEnvoyer: (donnees: DonneesSite) => Promise<void>;
  onAnnuler: () => void;
}

export default function FormulaireSite({ site, types, partenaires, onEnvoyer, onAnnuler }: Props) {
  const [nom, setNom] = useState(site?.nom ?? "");
  const [typeId, setTypeId] = useState(site ? String(site.type_site) : "");
  const [partenaireId, setPartenaireId] = useState(site?.partenaire ? String(site.partenaire) : "");
  const [localisation, setLocalisation] = useState(site?.localisation ?? "");
  const [latitude, setLatitude] = useState(site?.latitude ?? "");
  const [longitude, setLongitude] = useState(site?.longitude ?? "");
  const [estActif, setEstActif] = useState(site?.est_actif ?? true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [localisationEnCours, setLocalisationEnCours] = useState(false);
  const [infoPosition, setInfoPosition] = useState<{ texte: string; erreur: boolean } | null>(null);

  // En modification : rien à enregistrer tant que rien n'a changé
  const modifie =
    !site ||
    nom.trim() !== site.nom ||
    typeId !== String(site.type_site) ||
    partenaireId !== (site.partenaire ? String(site.partenaire) : "") ||
    localisation.trim() !== site.localisation ||
    Number(latitude) !== Number(site.latitude) ||
    Number(longitude) !== Number(site.longitude) ||
    estActif !== site.est_actif;

  // Remplit la latitude et la longitude avec la position GPS de l'appareil
  function utiliserMaPosition() {
    setInfoPosition(null);
    if (!window.isSecureContext || !navigator.geolocation) {
      setInfoPosition({
        texte: "La localisation n'est disponible qu'en HTTPS ou sur localhost, avec un navigateur compatible.",
        erreur: true,
      });
      return;
    }
    setLocalisationEnCours(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setInfoPosition({
          texte: `Position récupérée (précision d'environ ${Math.round(position.coords.accuracy)} m).`,
          erreur: false,
        });
        setLocalisationEnCours(false);
      },
      (e) => {
        const messages: Record<number, string> = {
          1: "Localisation refusée. Autorisez-la pour ce site dans les paramètres du navigateur.",
          2: "Position indisponible. Vérifiez le GPS ou la connexion.",
          3: "Délai dépassé. Réessayez.",
        };
        setInfoPosition({ texte: messages[e.code] ?? "La position n'a pas pu être obtenue.", erreur: true });
        setLocalisationEnCours(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const latNombre = Number(latitude);
  const lonNombre = Number(longitude);
  const positionValide =
    latitude.trim() !== "" &&
    longitude.trim() !== "" &&
    Number.isFinite(latNombre) &&
    Number.isFinite(lonNombre) &&
    Math.abs(latNombre) <= 90 &&
    Math.abs(lonNombre) <= 180;

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur("");

    const lat = Number(latitude);
    const lon = Number(longitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      setErreur("La latitude doit être comprise entre -90 et 90.");
      return;
    }
    if (Number.isNaN(lon) || lon < -180 || lon > 180) {
      setErreur("La longitude doit être comprise entre -180 et 180.");
      return;
    }

    setEnvoi(true);
    try {
      await onEnvoyer({
        nom: nom.trim(),
        localisation: localisation.trim(),
        type_site: Number(typeId),
        partenaire: partenaireId ? Number(partenaireId) : null,
        latitude: lat.toFixed(6),
        longitude: lon.toFixed(6),
        est_actif: estActif,
      });
      // Succès : le panneau se ferme ou change de vue, le bouton reste bloqué d'ici là
    } catch (e) {
      setErreur(
        messagesErreur(
          e,
          site ? "Le site n'a pas pu être modifié." : "Le site n'a pas pu être créé."
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
          <label htmlFor="sit-nom">Nom du site</label>
          <input
            id="sit-nom"
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            maxLength={100}
            required
          />
        </div>

        <div className="champ">
          <label htmlFor="sit-type">Type de site</label>
          <select id="sit-type" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
            <option value="">— Choisir un type —</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.libelle}
              </option>
            ))}
          </select>
          {types.length === 0 && (
            <p className="sit-aide alerte">
              Aucun type de site. Créez-en un d'abord dans l'administration.
            </p>
          )}
        </div>

        <div className="champ">
          <label htmlFor="sit-partenaire">Partenaire (facultatif)</label>
          <select
            id="sit-partenaire"
            value={partenaireId}
            onChange={(e) => setPartenaireId(e.target.value)}
          >
            <option value="">— Aucun partenaire —</option>
            {partenaires.map((p) => (
              <option key={p.id} value={p.id}>
                {p.libelle}
              </option>
            ))}
          </select>
        </div>

        <div className="champ sit-champ-large">
          <label htmlFor="sit-localisation">Localisation</label>
          <input
            id="sit-localisation"
            type="text"
            value={localisation}
            onChange={(e) => setLocalisation(e.target.value)}
            maxLength={255}
            placeholder="Commune, lieu-dit ou adresse"
            required
          />
        </div>

        <div className="sit-gps-entete">
          <p className="sit-groupe">Position GPS</p>
          <button
            type="button"
            className="bouton secondaire sit-gps-bouton"
            onClick={utiliserMaPosition}
            disabled={localisationEnCours || envoi}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="12" r="8" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            {localisationEnCours ? "Localisation…" : "Utiliser ma position"}
          </button>
        </div>

        {infoPosition && (
          <p
            className={`sit-info-position${infoPosition.erreur ? " erreur" : ""}`}
            role={infoPosition.erreur ? "alert" : "status"}
          >
            {infoPosition.texte}
          </p>
        )}

        <div className="champ">
          <label htmlFor="sit-latitude">Latitude</label>
          <input
            id="sit-latitude"
            type="number"
            step="any"
            min={-90}
            max={90}
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="-18.879190"
            required
          />
        </div>

        <div className="champ">
          <label htmlFor="sit-longitude">Longitude</label>
          <input
            id="sit-longitude"
            type="number"
            step="any"
            min={-180}
            max={180}
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder="47.507905"
            required
          />
        </div>

        {positionValide && <CarteSite latitude={latNombre} longitude={lonNombre} />}

        <label className="sit-case sit-champ-large">
          <input type="checkbox" checked={estActif} onChange={(e) => setEstActif(e.target.checked)} />
          <span>
            Site suivi
            <small>Un site suivi peut recevoir de nouvelles missions.</small>
          </span>
        </label>
      </div>

      <div className="ile-actions">
        <button type="button" className="bouton secondaire" onClick={onAnnuler} disabled={envoi}>
          Annuler
        </button>
        <button type="submit" className="bouton" disabled={envoi || !modifie}>
          {envoi ? "Enregistrement…" : site ? "Enregistrer" : "Créer le site"}
        </button>
      </div>
    </form>
  );
}