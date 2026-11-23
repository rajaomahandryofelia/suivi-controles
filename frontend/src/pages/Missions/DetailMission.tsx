import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import {
  dureeTexte,
  echeanceDe,
  formaterDate,
  formaterDateHeure,
  formaterHeure,
  joursDeRetard,
  lienCarte,
  messagesErreur,
  obtenirPosition,
} from "./outils";
import { libelleOuverture, missionOuverte } from "./horaire";
import type { Mission } from "./types";
import "./Ordre.css";

interface Props {
  mission: Mission;
  estDirecteur: boolean;
  aujourdhui: string;
  onRemplir: () => void;
  onCloturer: () => void;
  onModifier: () => void;
  onSupprimer: () => Promise<void>;
  onFermer: () => void;
  onNotifier: (type: "succes" | "erreur", texte: string) => void;
  onActualiser: () => Promise<void> | void;
}

function Info({ label, large, children }: { label: string; large?: boolean; children: ReactNode }) {
  return (
    <div className={`mis-info${large ? " large" : ""}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Position({ lat, lng }: { lat: string | null; lng: string | null }) {
  if (!lat || !lng) return null;
  return (
    <span className="mis-position">
      {lat}, {lng} ·{" "}
      <a href={lienCarte(lat, lng)} target="_blank" rel="noopener noreferrer">
        Voir sur la carte
      </a>
    </span>
  );
}

export default function DetailMission({
  mission,
  estDirecteur,
  aujourdhui,
  onRemplir,
  onCloturer,
  onModifier,
  onSupprimer,
  onFermer,
  onNotifier,
  onActualiser,
}: Props) {
  const [confirmation, setConfirmation] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const [erreur, setErreur] = useState("");

  // Ordre de mission d'une mission isolée
  const [confirmerOrdre, setConfirmerOrdre] = useState(false);
  const [delivrance, setDelivrance] = useState(false);
  const [ouverturePdf, setOuverturePdf] = useState(false);
  const [arrivee, setArrivee] = useState(false);

  const ech = echeanceDe(mission, aujourdhui);
  const jours = ech === "retard" ? joursDeRetard(mission.date_prevue, aujourdhui) : 0;
  const planifiee = mission.statut === "PLANIFIEE";
  const enCours = mission.statut === "EN_COURS";

  const carte = mission.carte_professionnelle ?? null;
  const ordre = mission.ordre_mission ?? null;
  const ordrePropre = ordre?.propre === true;
  const dansTournee = Boolean(mission.tournee);
  const peutRecevoir = mission.peut_recevoir_ordre === true;
  const carteValide = carte?.valide === true;

  async function supprimer() {
    setErreur("");
    setSuppression(true);
    try {
      await onSupprimer();
      // Succès : le panneau se ferme
    } catch (e) {
      setErreur(messagesErreur(e, "La mission n'a pas pu être supprimée."));
      setSuppression(false);
      setConfirmation(false);
    }
  }

  async function delivrerOrdre() {
    setErreur("");
    setDelivrance(true);
    try {
      const reponse = await api.post(`/controles/missions/${mission.id}/delivrer-ordre/`);
      const numero: string | undefined = reponse.data?.ordre_mission?.numero;
      onNotifier(
        "succes",
        `L'ordre de mission${numero ? ` ${numero}` : ""} a été délivré. Le contrôleur a été notifié.`
      );
      await onActualiser();
    } catch (e) {
      setErreur(messagesErreur(e, "L'ordre de mission n'a pas pu être délivré."));
    } finally {
      setConfirmerOrdre(false);
      setDelivrance(false);
    }
  }

  // « Je suis arrivé » : heure réelle + position GPS du contrôleur sur le site
  async function signalerArrivee() {
    setErreur("");
    setArrivee(true);
    try {
      const position = await obtenirPosition();
      await api.post(`/controles/missions/${mission.id}/arrivee/`, position);
      onNotifier("succes", "Votre arrivée sur le site est enregistrée.");
      await onActualiser();
    } catch (e) {
      setErreur(messagesErreur(e, "L'arrivée n'a pas pu être enregistrée."));
    } finally {
      setArrivee(false);
    }
  }

  // Même logique que TelechargerOrdres : appel API en blob puis ouverture du PDF
  async function ouvrirPdf() {
    setErreur("");
    setOuverturePdf(true);
    try {
      const reponse = await api.get(`/controles/missions/${mission.id}/ordre-mission/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([reponse.data], { type: "application/pdf" }));
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setErreur("Le document n'a pas pu être ouvert.");
    } finally {
      setOuverturePdf(false);
    }
  }

  return (
    <div>
      <div className="mis-badges">
        <span className={`mis-statut ${mission.statut}`}>{mission.statut_libelle}</span>
        {ech === "retard" && (
          <span className="mis-echeance retard">
            En retard de {jours} jour{jours > 1 ? "s" : ""}
          </span>
        )}
        {ech === "aujourdhui" && <span className="mis-echeance aujourdhui">Aujourd'hui</span>}
      </div>

      {erreur && (
        <div className="ile-erreur" role="alert">
          {erreur}
        </div>
      )}

      <dl className="mis-infos">
        <Info label="Site" large>
          <strong>{mission.site_nom}</strong>
          <span>{mission.site_localisation}</span>
        </Info>

        <Info label="Début prévu">
          {formaterDate(mission.date_prevue)}
          {mission.heure_prevue && <span>à {formaterHeure(mission.heure_prevue)}</span>}
        </Info>
        {mission.date_fin_prevue && (
          <Info label="Fin prévue">
            {formaterDate(mission.date_fin_prevue)}
            {mission.heure_fin_prevue && <span>à {formaterHeure(mission.heure_fin_prevue)}</span>}
          </Info>
        )}

        <Info label="Contrôleur affecté">{mission.controleur_nom}</Info>
        <Info label="Grille de contrôle" large={!mission.date_fin_prevue}>
          {mission.modele_grille_nom}
        </Info>

        {mission.date_debut_reelle && (
          <Info label="Début réel">
            {formaterDateHeure(mission.date_debut_reelle)}
            <Position lat={mission.latitude_debut} lng={mission.longitude_debut} />
          </Info>
        )}
        {mission.date_fin_reelle && (
          <Info label="Fin réelle">
            {formaterDateHeure(mission.date_fin_reelle)}
            <Position lat={mission.latitude_fin} lng={mission.longitude_fin} />
          </Info>
        )}
        {mission.date_debut_reelle && mission.date_fin_reelle && (
          <Info label="Durée réelle">
            {dureeTexte(mission.date_debut_reelle, mission.date_fin_reelle)}
          </Info>
        )}
      </dl>

      {/* ---- Pièces officielles : carte professionnelle et ordre de mission ---- */}
      <section className="mis-pieces" aria-labelledby={`pieces-${mission.id}`}>
        <h3 id={`pieces-${mission.id}`}>Pièces officielles</h3>
        <ul className="mis-pieces-liste">
          <li className={`mis-piece ${carte === null ? "manquant" : carteValide ? "ok" : "manquant"}`}>
            <span className="mis-piece-label">Carte professionnelle</span>
            <span className="mis-piece-valeur">
              {carte === null ? (
                <strong>✖ Non enregistrée</strong>
              ) : carteValide ? (
                <>
                  <strong>✔ Valide</strong>
                  <small>N° {carte.numero}</small>
                </>
              ) : (
                <>
                  <strong>✖ Expirée ou non valable à cette date</strong>
                  <small>N° {carte.numero}</small>
                </>
              )}
            </span>
          </li>

          <li className={`mis-piece ${ordre ? "ok" : dansTournee ? "attente" : "manquant"}`}>
            <span className="mis-piece-label">Ordre de mission</span>
            <span className="mis-piece-valeur">
              {ordre ? (
                <>
                  <strong>✔ {ordre.numero}</strong>
                  <small>
                    Délivré le {formaterDate(ordre.date_emission)}
                    {ordrePropre ? " · propre à cette mission" : " · avec la tournée"}
                  </small>
                </>
              ) : dansTournee ? (
                <strong>En attente de la validation de la tournée</strong>
              ) : (
                <strong>✖ Non délivré</strong>
              )}
            </span>
          </li>
        </ul>

        {/* Explications selon la situation */}
        {ordre && !ordrePropre && (
          <p className="mis-pieces-note">
            Cet ordre est celui de la tournée : il se télécharge depuis la page{" "}
            <Link to="/tournees">Tournées</Link>.
          </p>
        )}
        {estDirecteur && ordrePropre && planifiee && (
          <p className="mis-pieces-note">
            Le contrôleur, le site et la date ne peuvent plus être modifiés, et la mission ne peut
            plus être supprimée : l'ordre de mission est déjà délivré.
          </p>
        )}
        {!estDirecteur && planifiee && !ordre && !dansTournee && (
          <p className="mis-pieces-note">
            Vous ne pourrez pas démarrer cette mission tant que le Directeur n'a pas délivré
            l'ordre de mission.
          </p>
        )}
        {estDirecteur && peutRecevoir && !carteValide && (
          <p className="mis-pieces-note">
            L'ordre de mission ne peut pas être délivré : la carte professionnelle du contrôleur
            est absente, ou n'est pas valable à la date de la mission.
          </p>
        )}

        {/* Délivrer l'ordre (Directeur) */}
        {estDirecteur && peutRecevoir && !confirmerOrdre && (
          <div className="mis-pieces-actions">
            <button
              type="button"
              className="bouton"
              onClick={() => setConfirmerOrdre(true)}
              disabled={!carteValide}
            >
              Délivrer l'ordre de mission
            </button>
          </div>
        )}
        {estDirecteur && peutRecevoir && confirmerOrdre && (
          <div className="ile-confirmation">
            <p>
              Délivrer l'ordre de mission ? Le contrôleur sera prévenu. Ensuite, le contrôleur, le
              site et la date ne pourront plus être modifiés, et la mission ne pourra plus être
              supprimée.
            </p>
            <div className="ile-actions">
              <button
                type="button"
                className="bouton secondaire"
                onClick={() => setConfirmerOrdre(false)}
                disabled={delivrance}
              >
                Annuler
              </button>
              <button type="button" className="bouton" onClick={delivrerOrdre} disabled={delivrance}>
                {delivrance ? "Délivrance…" : "Oui, délivrer"}
              </button>
            </div>
          </div>
        )}

        {/* PDF de l'ordre propre à la mission (Directeur et contrôleur concerné) */}
        {ordrePropre && (
          <div className="mis-pieces-actions">
            <button
              type="button"
              className="bouton secondaire"
              onClick={ouvrirPdf}
              disabled={ouverturePdf}
            >
              {ouverturePdf ? "Ouverture…" : "Ordre de mission (PDF)"}
            </button>
          </div>
        )}
      </section>

      {estDirecteur && !planifiee && (
        <p className="mis-note">
          Cette mission est démarrée ou clôturée : elle ne peut plus être modifiée ni supprimée
          (l'historique est conservé).
        </p>
      )}

      {confirmation ? (
        <div className="ile-confirmation">
          <p>Supprimer définitivement cette mission ? Le contrôleur sera prévenu.</p>
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
          <button type="button" className="bouton secondaire" onClick={onFermer}>
            Fermer
          </button>
          {estDirecteur && planifiee && (
            <>
              {/* Une mission avec ordre délivré ne se supprime plus (refusé aussi par le backend) */}
              {!ordrePropre && (
                <button
                  type="button"
                  className="bouton secondaire mis-bouton-suppression"
                  onClick={() => setConfirmation(true)}
                >
                  Supprimer
                </button>
              )}
              <button type="button" className="bouton" onClick={onModifier}>
                Modifier
              </button>
            </>
          )}
          {!estDirecteur && (planifiee || (enCours && !missionOuverte(mission))) && (
            <span className="mis-ouverture">{libelleOuverture(mission)}</span>
          )}
          {!estDirecteur && enCours && !mission.latitude_debut && (
            <button type="button" className="bouton" onClick={signalerArrivee} disabled={arrivee}>
              {arrivee ? "Localisation…" : "Je suis arrivé"}
            </button>
          )}
          {!estDirecteur && enCours && missionOuverte(mission) && (
            <>
              <button type="button" className="bouton secondaire" onClick={onCloturer}>
                Clôturer
              </button>
              <button type="button" className="bouton" onClick={onRemplir}>
                Remplir la grille
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}