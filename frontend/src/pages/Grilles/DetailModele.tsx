import { useState } from "react";
import type { ReactNode } from "react";
import { messagesErreur } from "../Missions/outils";
import { LIBELLES_REPONSE } from "./types";
import type { Critere, Modele } from "./types";

interface Props {
  modele: Modele;
  onModifier: () => void;
  onChangerStatut: (actif: boolean) => Promise<void>;
  onSupprimer: () => Promise<void>;
  onAjouterCritere: () => void;
  onModifierCritere: (critere: Critere) => void;
  onReordonner: (ids: number[]) => Promise<void>;
  onFermer: () => void;
}

type Confirmation = "desactiver" | "supprimer" | null;

function Info({ label, large, children }: { label: string; large?: boolean; children: ReactNode }) {
  return (
    <div className={`sit-info${large ? " large" : ""}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export default function DetailModele({
  modele,
  onModifier,
  onChangerStatut,
  onSupprimer,
  onAjouterCritere,
  onModifierCritere,
  onReordonner,
  onFermer,
}: Props) {
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const criteres = [...modele.criteres].sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  const nombreMissions = modele.nombre_missions ?? 0;
  const totalPonderation =
    Math.round(criteres.reduce((somme, c) => somme + Number(c.ponderation), 0) * 100) / 100;

  async function executer(action: () => Promise<void>, defaut: string) {
    setErreur("");
    setEnCours(true);
    try {
      await action();
      setConfirmation(null);
    } catch (e) {
      setErreur(messagesErreur(e, defaut));
    } finally {
      setEnCours(false);
    }
  }

  // Échange deux critères voisins puis envoie le nouvel ordre au serveur
  function deplacer(index: number, sens: -1 | 1) {
    const ids = criteres.map((c) => c.id);
    const cible = index + sens;
    if (cible < 0 || cible >= ids.length) return;
    [ids[index], ids[cible]] = [ids[cible], ids[index]];
    executer(() => onReordonner(ids), "L'ordre des critères n'a pas pu être modifié.");
  }

  return (
    <div>
      <div className="sit-badges">
        <span className={`lst-statut ${modele.est_actif ? "actif" : "inactif"}`}>
          {modele.est_actif ? "Actif" : "Inactif"}
        </span>
        {nombreMissions > 0 && (
          <span className="lst-compteur ok">
            Utilisé par {nombreMissions} mission{nombreMissions > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {erreur && (
        <div className="ile-erreur" role="alert">
          {erreur}
        </div>
      )}

      <dl className="sit-infos">
        <Info label="Type de site">{modele.type_site_libelle}</Info>
        <Info label="Critères">{criteres.length}</Info>
        {modele.description && <Info label="Description" large>{modele.description}</Info>}
      </dl>

      {criteres.length === 0 && (
        <p className="gri-note alerte">
          Ce modèle ne contient aucun critère : il ne peut pas encore servir à créer une mission.
        </p>
      )}

      <section className="sit-section">
        <div className="gri-section-entete">
          <h3 className="sit-section-titre">
            Critères
            <span className="sit-nombre">{criteres.length}</span>
          </h3>
          <button type="button" className="bouton secondaire gri-petit" onClick={onAjouterCritere}>
            + Ajouter un critère
          </button>
        </div>

        {criteres.length === 0 ? (
          <p className="sit-vide">Aucun critère pour l'instant. Ajoutez le premier.</p>
        ) : (
          <>
            <ol className="gri-liste">
              {criteres.map((c, i) => (
                <li key={c.id} className="gri-critere">
                  <span className="gri-rang" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="gri-texte">
                    <strong>{c.libelle}</strong>
                    <span className="gri-meta">
                      <span className="sit-badge neutre">{LIBELLES_REPONSE[c.type_reponse]}</span>
                      <span>Pondération {Number(c.ponderation)}</span>
                      <span className={`sit-badge ${c.est_obligatoire ? "vert" : "neutre"}`}>
                        {c.est_obligatoire ? "Obligatoire" : "Facultatif"}
                      </span>
                    </span>
                  </div>
                  <div className="gri-actions">
                    <button
                      type="button"
                      className="gri-icone"
                      onClick={() => deplacer(i, -1)}
                      disabled={i === 0 || enCours}
                      aria-label={`Monter le critère ${i + 1}`}
                    >
                      <Icone>
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </Icone>
                    </button>
                    <button
                      type="button"
                      className="gri-icone"
                      onClick={() => deplacer(i, 1)}
                      disabled={i === criteres.length - 1 || enCours}
                      aria-label={`Descendre le critère ${i + 1}`}
                    >
                      <Icone>
                        <path d="M12 5v14M19 12l-7 7-7-7" />
                      </Icone>
                    </button>
                    <button
                      type="button"
                      className="gri-icone"
                      onClick={() => onModifierCritere(c)}
                      aria-label={`Modifier le critère ${i + 1}`}
                    >
                      <Icone>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                      </Icone>
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <p className="gri-total">Total des pondérations : {totalPonderation}</p>
          </>
        )}
      </section>

      {nombreMissions > 0 && (
        <p className="gri-note">
          Ce modèle est utilisé par des missions : il ne peut pas être supprimé, mais vous pouvez
          le désactiver pour ne plus le proposer.
        </p>
      )}

      {confirmation ? (
        <div className="ile-confirmation">
          <p>
            {confirmation === "desactiver"
              ? "Désactiver ce modèle ? Il ne sera plus proposé pour les nouvelles missions, mais les missions existantes le gardent."
              : "Supprimer définitivement ce modèle et tous ses critères ?"}
          </p>
          <div className="ile-actions">
            <button
              type="button"
              className="bouton secondaire"
              onClick={() => setConfirmation(null)}
              disabled={enCours}
            >
              Annuler
            </button>
            <button
              type="button"
              className="bouton danger"
              disabled={enCours}
              onClick={() =>
                confirmation === "desactiver"
                  ? executer(() => onChangerStatut(false), "Le changement de statut a échoué.")
                  : executer(onSupprimer, "Le modèle n'a pas pu être supprimé.")
              }
            >
              {confirmation === "desactiver"
                ? enCours
                  ? "Désactivation…"
                  : "Oui, désactiver"
                : enCours
                  ? "Suppression…"
                  : "Oui, supprimer"}
            </button>
          </div>
        </div>
      ) : (
        <div className="ile-actions">
          <button type="button" className="bouton secondaire" onClick={onFermer}>
            Fermer
          </button>
          {nombreMissions === 0 && (
            <button
              type="button"
              className="bouton secondaire sit-bouton-suppression"
              onClick={() => setConfirmation("supprimer")}
            >
              Supprimer
            </button>
          )}
          {modele.est_actif ? (
            <button
              type="button"
              className="bouton secondaire"
              onClick={() => setConfirmation("desactiver")}
            >
              Désactiver
            </button>
          ) : (
            <button
              type="button"
              className="bouton secondaire"
              disabled={enCours}
              onClick={() =>
                executer(() => onChangerStatut(true), "Le changement de statut a échoué.")
              }
            >
              {enCours ? "Réactivation…" : "Réactiver"}
            </button>
          )}
          <button type="button" className="bouton" onClick={onModifier}>
            Modifier
          </button>
        </div>
      )}
    </div>
  );
}