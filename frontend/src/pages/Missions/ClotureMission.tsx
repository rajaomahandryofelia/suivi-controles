import { useEffect, useState } from "react";
import api from "../../api/client";
import { messagesErreur, niveauScore, obtenirPosition } from "./outils";
import type { Mission, RapportGenere, Recapitulatif } from "./types";

interface Props {
  mission: Mission;
  onNotifier: (type: "succes" | "erreur", texte: string) => void;
  onRetour: () => void;
  onRemplir: () => void;
  onTerminee: () => void;
  onFermer: () => void;
}

function enNombre(valeur: number | string | null | undefined) {
  const n = Number(valeur ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function ClotureMission({
  mission,
  onNotifier,
  onRetour,
  onRemplir,
  onTerminee,
  onFermer,
}: Props) {
  const [recap, setRecap] = useState<Recapitulatif | null>(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [rapport, setRapport] = useState<RapportGenere | null>(null);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const reponse = await api.get<Recapitulatif>(
          `/controles/missions/${mission.id}/recapitulatif/`
        );
        if (actif) setRecap(reponse.data);
      } catch (e) {
        if (actif) setErreur(messagesErreur(e, "Impossible de charger le récapitulatif."));
      } finally {
        if (actif) setChargement(false);
      }
    })();
    return () => {
      actif = false;
    };
  }, [mission.id]);

  async function cloturer() {
    setErreur("");
    setEnvoi(true);
    try {
      const position = await obtenirPosition();
      const reponse = await api.post<{ mission: Mission; rapport: RapportGenere }>(
        `/controles/missions/${mission.id}/cloturer/`,
        position
      );
      setRapport(reponse.data.rapport);
      onNotifier("succes", "La mission est clôturée. Le rapport PDF a été généré.");
      onTerminee();
    } catch (e) {
      setErreur(messagesErreur(e, "La mission n'a pas pu être clôturée."));
    } finally {
      setEnvoi(false);
    }
  }

  // ---- Mission clôturée : le rapport est prêt ----
  if (rapport) {
    const score = enNombre(rapport.score_conformite);
    return (
      <div className="gri-succes">
        <span className="gri-succes-icone" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5 9-10" />
          </svg>
        </span>
        <h3>Mission clôturée</h3>
        <p>Le rapport est envoyé au Directeur pour validation.</p>

        <div className={`gri-score ${niveauScore(score)}`}>
          <span className="gri-score-etiquette">Score de conformité</span>
          <strong>{score.toFixed(0)} %</strong>
          <div className="gri-barre">
            <span style={{ width: `${Math.min(100, score)}%` }} />
          </div>
        </div>

        <div className="ile-actions">
          <button type="button" className="bouton secondaire" onClick={onFermer}>
            Fermer
          </button>
          <a className="bouton gri-lien-pdf" href={rapport.fichier_pdf} target="_blank" rel="noopener noreferrer">
            Télécharger le rapport PDF
          </a>
        </div>
      </div>
    );
  }

  if (chargement) {
    return (
      <div className="mis-chargement">
        <span className="mis-spinner" aria-hidden="true" />
        Calcul du récapitulatif…
      </div>
    );
  }

  const manquants = recap?.criteres_manquants ?? [];
  const sansPhoto = recap?.criteres_sans_photo ?? [];
  const score = enNombre(recap?.score_provisoire);
  const pourcentage =
    recap && recap.nb_criteres > 0 ? Math.round((recap.nb_reponses / recap.nb_criteres) * 100) : 0;

  return (
    <div>
      {erreur && (
        <div className="ile-erreur" role="alert">
          {erreur}
        </div>
      )}

      {recap && (
        <>
          <div className="gri-progression">
            <div className="gri-progression-texte">
              <span>
                Critères renseignés : {recap.nb_reponses} sur {recap.nb_criteres}
              </span>
              <span>{pourcentage} %</span>
            </div>
            <div className="gri-barre">
              <span style={{ width: `${pourcentage}%` }} />
            </div>
          </div>

          <div className={`gri-score ${niveauScore(score)}`}>
            <span className="gri-score-etiquette">Score de conformité provisoire</span>
            <strong>{score.toFixed(0)} %</strong>
            <div className="gri-barre">
              <span style={{ width: `${Math.min(100, score)}%` }} />
            </div>
          </div>

          {manquants.length > 0 ? (
            <div className="gri-alerte">
              <p>Ces critères obligatoires n'ont pas encore de réponse :</p>
              <ul>
                {manquants.map((c) => (
                  <li key={c.id}>{c.libelle}</li>
                ))}
              </ul>
            </div>
          ) : sansPhoto.length > 0 ? (
            <div className="gri-alerte">
              <p>
                Ces critères sont non conformes mais n'ont pas de photo. Ajoutez-en au moins une pour
                chacun : elle prouve le constat devant le partenaire.
              </p>
              <ul>
                {sansPhoto.map((c) => (
                  <li key={c.id}>{c.libelle}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mis-note">
              Tout est prêt. En clôturant, votre position GPS de fin est enregistrée et le rapport PDF
              est généré.
            </p>
          )}
        </>
      )}

      <div className="ile-actions">
        <button type="button" className="bouton secondaire" onClick={onRetour} disabled={envoi}>
          Retour
        </button>
        {manquants.length > 0 ? (
          <button type="button" className="bouton" onClick={onRemplir}>
            Compléter la grille
          </button>
        ) : sansPhoto.length > 0 ? (
          <button type="button" className="bouton" onClick={onRemplir}>
            Ajouter les photos
          </button>
        ) : (
          <>
            <button type="button" className="bouton secondaire" onClick={onRemplir} disabled={envoi}>
              Modifier la grille
            </button>
            <button
              type="button"
              className="bouton"
              onClick={cloturer}
              disabled={envoi || !recap?.peut_etre_cloturee}
            >
              {envoi ? "Clôture en cours…" : "Clôturer la mission"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}