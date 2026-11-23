import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Utilisateur } from "../../types";
import { formaterHeure, messagesErreur, nomComplet } from "./outils";
import type { DonneesMission, Mission, Modele, Site } from "./types";

interface Props {
  mission?: Mission; // présent = modification, absent = création
  sites: Site[];
  modeles: Modele[];
  controleurs: Utilisateur[];
  aujourdhui: string;
  onEnvoyer: (donnees: DonneesMission) => Promise<void>;
  onAnnuler: () => void;
}

export default function FormulaireMission({
  mission,
  sites,
  modeles,
  controleurs,
  aujourdhui,
  onEnvoyer,
  onAnnuler,
}: Props) {
  const heureInitiale = mission ? formaterHeure(mission.heure_prevue) : "";
  const dateFinInitiale = mission?.date_fin_prevue ?? "";
  const heureFinInitiale = mission ? formaterHeure(mission.heure_fin_prevue) : "";

  const [siteId, setSiteId] = useState(mission ? String(mission.site) : "");
  const [modeleId, setModeleId] = useState(mission ? String(mission.modele_grille) : "");
  const [controleurId, setControleurId] = useState(mission ? String(mission.controleur) : "");
  const [datePrevue, setDatePrevue] = useState(mission ? mission.date_prevue : "");
  const [heurePrevue, setHeurePrevue] = useState(heureInitiale);
  const [dateFin, setDateFin] = useState(dateFinInitiale);
  const [heureFin, setHeureFin] = useState(heureFinInitiale);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  // Les grilles proposées dépendent du type du site choisi
  const siteChoisi = sites.find((s) => String(s.id) === siteId);
  const modelesDuSite = useMemo(
    () => (siteChoisi ? modeles.filter((m) => m.type_site === siteChoisi.type_site) : []),
    [modeles, siteChoisi]
  );

  function choisirSite(valeur: string) {
    setSiteId(valeur);
    const site = sites.find((s) => String(s.id) === valeur);
    const possibles = site ? modeles.filter((m) => m.type_site === site.type_site) : [];
    setModeleId(possibles.length === 1 ? String(possibles[0].id) : "");
  }

  // La date de fin suit la date de début tant qu'elle n'est pas cohérente
  function choisirDateDebut(valeur: string) {
    setDatePrevue(valeur);
    if (!dateFin || dateFin < valeur) setDateFin(valeur);
  }

  // En modification : rien à enregistrer tant que rien n'a changé
  const modifie =
    !mission ||
    siteId !== String(mission.site) ||
    modeleId !== String(mission.modele_grille) ||
    controleurId !== String(mission.controleur) ||
    datePrevue !== mission.date_prevue ||
    heurePrevue !== heureInitiale ||
    dateFin !== dateFinInitiale ||
    heureFin !== heureFinInitiale;

  const debutModifie =
    !mission || datePrevue !== mission.date_prevue || heurePrevue !== heureInitiale;

  const dateMinimum = mission && mission.date_prevue < aujourdhui ? mission.date_prevue : aujourdhui;

  // Aujourd'hui : l'heure de début ne peut pas être déjà passée
  const heureMinimum =
    datePrevue === aujourdhui && debutModifie ? new Date().toTimeString().slice(0, 5) : undefined;

  const controleurChange = mission && controleurId !== String(mission.controleur);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur("");

    if (dateFin < datePrevue) {
      setErreur("La date de fin ne peut pas précéder la date de début.");
      return;
    }
    if (dateFin === datePrevue && heureFin <= heurePrevue) {
      setErreur("L'heure de fin doit être après l'heure de début.");
      return;
    }

    setEnvoi(true);
    try {
      await onEnvoyer({
        site: Number(siteId),
        modele_grille: Number(modeleId),
        controleur: Number(controleurId),
        date_prevue: datePrevue,
        heure_prevue: heurePrevue,
        date_fin_prevue: dateFin,
        heure_fin_prevue: heureFin,
      });
      // Succès : le panneau se ferme ou change de vue, le bouton reste bloqué d'ici là
    } catch (e) {
      setErreur(
        messagesErreur(
          e,
          mission ? "La mission n'a pas pu être modifiée." : "La mission n'a pas pu être créée."
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

      <div className="mis-grille">
        <div className="champ">
          <label htmlFor="mis-site">Site à contrôler</label>
          <select id="mis-site" value={siteId} onChange={(e) => choisirSite(e.target.value)} required>
            <option value="">— Choisir un site —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom} ({s.type_site_libelle})
              </option>
            ))}
          </select>
          {sites.length === 0 && (
            <p className="mis-aide alerte">Aucun site actif. Ajoutez-en d'abord dans l'administration.</p>
          )}
        </div>

        <div className="champ">
          <label htmlFor="mis-modele">Grille de contrôle</label>
          <select
            id="mis-modele"
            value={modeleId}
            onChange={(e) => setModeleId(e.target.value)}
            disabled={!siteChoisi}
            required
          >
            <option value="">
              {siteChoisi ? "— Choisir une grille —" : "Choisissez d'abord un site"}
            </option>
            {modelesDuSite.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
          {siteChoisi && modelesDuSite.length === 0 && (
            <p className="mis-aide alerte">
              Aucune grille pour ce type de site. Créez-en une dans l'administration.
            </p>
          )}
        </div>

        <div className="champ mis-champ-large">
          <label htmlFor="mis-controleur">Contrôleur affecté à cette mission</label>
          <select
            id="mis-controleur"
            value={controleurId}
            onChange={(e) => setControleurId(e.target.value)}
            required
          >
            <option value="">— Choisir un contrôleur —</option>
            {controleurs.map((c) => (
              <option key={c.id} value={c.id}>
                {nomComplet(c)}
              </option>
            ))}
          </select>
          {controleurs.length === 0 ? (
            <p className="mis-aide alerte">
              Aucun contrôleur actif. Acceptez d'abord une demande d'inscription.
            </p>
          ) : (
            <p className="mis-aide">
              {controleurChange
                ? "L'ancien et le nouveau contrôleur seront prévenus par une notification sur la plateforme."
                : "Le contrôleur reçoit une notification sur la plateforme dès l'enregistrement."}
            </p>
          )}
        </div>

        <p className="mis-groupe">Début prévu</p>

        <div className="champ">
          <label htmlFor="mis-date">Date</label>
          <input
            id="mis-date"
            type="date"
            min={dateMinimum}
            value={datePrevue}
            onChange={(e) => choisirDateDebut(e.target.value)}
            required
          />
        </div>

        <div className="champ">
          <label htmlFor="mis-heure">Heure</label>
          <input
            id="mis-heure"
            type="time"
            min={heureMinimum}
            value={heurePrevue}
            onChange={(e) => setHeurePrevue(e.target.value)}
            required
          />
        </div>

        <p className="mis-groupe fin">Fin prévue</p>

        <div className="champ">
          <label htmlFor="mis-date-fin">Date</label>
          <input
            id="mis-date-fin"
            type="date"
            min={datePrevue || dateMinimum}
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            required
          />
        </div>

        <div className="champ">
          <label htmlFor="mis-heure-fin">Heure</label>
          <input
            id="mis-heure-fin"
            type="time"
            min={dateFin === datePrevue && heurePrevue ? heurePrevue : undefined}
            value={heureFin}
            onChange={(e) => setHeureFin(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="ile-actions">
        <button type="button" className="bouton secondaire" onClick={onAnnuler} disabled={envoi}>
          Annuler
        </button>
        <button type="submit" className="bouton" disabled={envoi || !modifie}>
          {envoi ? "Enregistrement…" : mission ? "Enregistrer" : "Créer la mission"}
        </button>
      </div>
    </form>
  );
}