import { useState } from "react";
import { formaterDateHeure, formaterDuree, localVersIso, maintenantLocal } from "./outils";
import type { DonneesRetablissement, Incident } from "./types";

interface Props {
  incident: Incident;
  estDirecteur: boolean;
  onRetablir: (donnees: DonneesRetablissement) => Promise<void>;
  onAjouterPreuves: (fichiers: File[]) => Promise<void>;
  onSupprimer: () => Promise<void>;
}

const estPdf = (url: string) => /\.pdf(\?|$)/i.test(url);

// La fiche d'un incident. Le Directeur peut le rétablir ou le supprimer ;
// tout le monde peut ajouter des preuves.
export default function DetailIncident({
  incident,
  estDirecteur,
  onRetablir,
  onAjouterPreuves,
  onSupprimer,
}: Props) {
  const [retablissementOuvert, setRetablissementOuvert] = useState(false);
  const [dateRetablissement, setDateRetablissement] = useState(maintenantLocal());
  const [observations, setObservations] = useState(incident.observations);
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [occupe, setOccupe] = useState(false);

  const enCours = incident.statut === "EN_COURS";

  async function executer(action: () => Promise<void>) {
    setOccupe(true);
    try {
      await action();
    } finally {
      setOccupe(false);
    }
  }

  async function validerRetablissement() {
    await executer(async () => {
      await onRetablir({
        date_retablissement: dateRetablissement ? localVersIso(dateRetablissement) : undefined,
        observations: observations.trim(),
      });
      setRetablissementOuvert(false);
    });
  }

  async function envoyerPreuves() {
    await executer(async () => {
      await onAjouterPreuves(fichiers);
      setFichiers([]);
    });
  }

  return (
    <div className="inc-detail">
      <div className="inc-badges">
        <span className={`inc-statut ${incident.statut}`}>{incident.statut_libelle}</span>
        <span className={`inc-gravite ${incident.gravite}`}>{incident.gravite_libelle}</span>
        {incident.est_recurrent && <span className="inc-recurrent">Récurrent</span>}
      </div>

      <dl className="inc-infos">
        <div>
          <dt>Site</dt>
          <dd>{incident.site_nom}</dd>
        </div>
        {incident.element_description && (
          <div>
            <dt>Équipement</dt>
            <dd>{incident.element_description}</dd>
          </div>
        )}
        <div>
          <dt>Service affecté</dt>
          <dd>{incident.service_libelle}</dd>
        </div>
        <div>
          <dt>Type d'incident</dt>
          <dd>{incident.type_libelle}</dd>
        </div>
        <div>
          <dt>Début</dt>
          <dd>{formaterDateHeure(incident.date_debut)}</dd>
        </div>
        <div>
          <dt>Rétablissement</dt>
          <dd>
            {incident.date_retablissement
              ? formaterDateHeure(incident.date_retablissement)
              : "Pas encore rétabli"}
          </dd>
        </div>
        <div>
          <dt>{enCours ? "Durée jusqu'à maintenant" : "Durée de l'interruption"}</dt>
          <dd>{formaterDuree(incident.duree_minutes)}</dd>
        </div>
        {incident.cause_supposee && (
          <div>
            <dt>Cause supposée</dt>
            <dd>{incident.cause_supposee}</dd>
          </div>
        )}
        <div>
          <dt>Déclaré par</dt>
          <dd>{incident.declare_par_nom ?? "—"}</dd>
        </div>
        {incident.retabli_par_nom && (
          <div>
            <dt>Rétabli par</dt>
            <dd>{incident.retabli_par_nom}</dd>
          </div>
        )}
      </dl>

      {incident.observations && (
        <section className="inc-bloc">
          <h3>Observations</h3>
          <p className="inc-texte">{incident.observations}</p>
        </section>
      )}

      <section className="inc-bloc">
        <h3>Preuves ({incident.pieces_jointes.length})</h3>
        {incident.pieces_jointes.length === 0 ? (
          <p className="inc-aide">Aucune preuve jointe pour l'instant.</p>
        ) : (
          <ul className="inc-preuves">
            {incident.pieces_jointes.map((p) => (
              <li key={p.id}>
                <a href={p.fichier} target="_blank" rel="noreferrer" title={p.legende || undefined}>
                  {estPdf(p.fichier) ? (
                    <span className="inc-preuve-pdf">PDF</span>
                  ) : (
                    <img src={p.fichier} alt={p.legende || "Preuve de l'incident"} loading="lazy" />
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="inc-ajout-preuves">
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFichiers(Array.from(e.target.files ?? []))}
            key={incident.pieces_jointes.length}
          />
          {fichiers.length > 0 && (
            <button type="button" className="inc-secondaire" onClick={envoyerPreuves} disabled={occupe}>
              {occupe ? "Envoi…" : `Ajouter ${fichiers.length} fichier${fichiers.length > 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </section>

      {estDirecteur && enCours && (
        <section className="inc-bloc">
          {!retablissementOuvert ? (
            <button type="button" className="bouton" onClick={() => setRetablissementOuvert(true)}>
              Marquer comme rétabli
            </button>
          ) : (
            <div className="inc-retablissement">
              <h3>Rétablissement du service</h3>
              <label className="inc-champ">
                <span>Date et heure du rétablissement</span>
                <input
                  type="datetime-local"
                  value={dateRetablissement}
                  min={incident.date_debut.slice(0, 16)}
                  max={maintenantLocal()}
                  onChange={(e) => setDateRetablissement(e.target.value)}
                />
              </label>
              <label className="inc-champ">
                <span>Observations</span>
                <textarea
                  rows={3}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                />
              </label>
              <div className="inc-actions">
                <button
                  type="button"
                  className="inc-secondaire"
                  onClick={() => setRetablissementOuvert(false)}
                  disabled={occupe}
                >
                  Annuler
                </button>
                <button type="button" className="bouton" onClick={validerRetablissement} disabled={occupe}>
                  {occupe ? "Enregistrement…" : "Confirmer le rétablissement"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {estDirecteur && (
        <section className="inc-bloc inc-zone-danger">
          {!confirmerSuppression ? (
            <button type="button" className="inc-lien-danger" onClick={() => setConfirmerSuppression(true)}>
              Supprimer cet incident
            </button>
          ) : (
            <div className="inc-actions">
              <span className="inc-aide">Supprimer définitivement cet incident et ses preuves ?</span>
              <button
                type="button"
                className="inc-secondaire"
                onClick={() => setConfirmerSuppression(false)}
                disabled={occupe}
              >
                Non
              </button>
              <button
                type="button"
                className="inc-danger"
                onClick={() => executer(onSupprimer)}
                disabled={occupe}
              >
                Oui, supprimer
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}