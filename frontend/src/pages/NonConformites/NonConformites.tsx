import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import BoutonRetour from "../../components/BoutonRetour";
import Notification from "../../components/Notification";
import PanneauVerre from "../../components/PanneauVerre";
import type { Origine } from "../../components/PanneauIle";
import DetailNonConformite from "./DetailNonConformite";
import TableauNonConformites from "./TableauNonConformites";
import { GRAVITES, correspond, segmentsPour, trierParUrgence } from "./outils";
import type { EtatNotification, EtatPanneau, NonConformite } from "./types";
import { useNonConformites } from "./useNonConformites";
import "./NonConformites.css";
import "./PageNonConformites.css";
import "./Relance.css";

export default function NonConformites() {
  const { estDirecteur } = useAuth();

  // Lien venant de la fiche d'une mission : /non-conformites?mission=ID
  const [parametres, setParametres] = useSearchParams();
  const missionFiltre = Number(parametres.get("mission")) || null;

  const [segment, setSegment] = useState("");
  const [panneau, setPanneau] = useState<EtatPanneau | null>(null);
  const [notification, setNotification] = useState<EtatNotification | null>(null);

  const notifier = useCallback((type: "succes" | "erreur", texte: string) => {
    setNotification({ cle: Date.now(), type, texte });
  }, []);
  const fermerNotification = useCallback(() => setNotification(null), []);
  const fermerPanneau = useCallback(() => setPanneau(null), []);

  const { liste, chargement, erreur, enCoursId, corriger, relancer } = useNonConformites(notifier);

  // Les non-conformités constatées lors de la mission demandée, ou toutes
  const base = missionFiltre ? liste.filter((nc) => nc.mission === missionFiltre) : liste;

  function ouvrir(nc: NonConformite, origine: Origine) {
    setPanneau({ id: nc.id, origine });
  }

  // La non-conformité affichée dans le panneau suit toujours la dernière version reçue
  const ouverte = panneau ? liste.find((nc) => nc.id === panneau.id) : undefined;

  const segments = segmentsPour(estDirecteur);
  const nombrePour = (valeur: string) => base.filter((nc) => correspond(nc, valeur)).length;
  const lignes = trierParUrgence(
    base.filter((nc) => correspond(nc, segment)),
    estDirecteur
  );
  const ilYADesRetards = nombrePour("RETARD") > 0;

  return (
    <div className="ncp-page">
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <div className="entete-page">
        <h1>Non-conformités</h1>
      </div>

      {missionFiltre && (
        <p className="nc-filtre-mission">
          Non-conformités constatées lors de la mission n° {missionFiltre}.
          <button type="button" onClick={() => setParametres({}, { replace: true })}>
            Tout afficher
          </button>
        </p>
      )}

      {erreur && (
        <div className="ncp-ile-zone">
          <div className="ncp-ile" role="alert">
            <span className="ncp-ile-point" aria-hidden="true" />
            <span className="ncp-ile-texte">{erreur}</span>
          </div>
        </div>
      )}

      {/* Pilule : filtres */}
      <div className="nc-ilot-zone">
        <div className="nc-ilot" role="group" aria-label="Filtrer les non-conformités">
          {segments.map((s) => {
            const nombre = nombrePour(s.valeur);
            return (
              <button
                key={s.valeur}
                type="button"
                aria-pressed={segment === s.valeur}
                className={`nc-segment${segment === s.valeur ? " actif" : ""}${
                  s.valeur === "RETARD" ? " retard" : ""
                }`}
                onClick={() => setSegment(s.valeur)}
                title={`${nombre} non-conformité${nombre > 1 ? "s" : ""}`}
              >
                {s.libelle}
                {s.valeur === "RETARD" && ilYADesRetards && (
                  <span className="nc-point" aria-label="Des non-conformités dépassent leur délai" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {chargement ? (
        <div className="nc-chargement">
          <span className="nc-spinner" aria-hidden="true" />
          Chargement des non-conformités…
        </div>
      ) : (
        <div className="nc-tableau-cadre">
          {lignes.length === 0 ? (
            <p className="nc-vide">
              {base.length === 0
                ? missionFiltre
                  ? "Aucune non-conformité n'a été constatée lors de cette mission."
                  : "Aucune non-conformité pour l'instant. Elles apparaissent à la clôture d'une mission, pour chaque critère non conforme."
                : "Aucune non-conformité dans cette catégorie."}
            </p>
          ) : (
            <TableauNonConformites
              lignes={lignes}
              estDirecteur={estDirecteur}
              enCoursId={enCoursId}
              onOuvrir={ouvrir}
              onCorriger={corriger}
            />
          )}
        </div>
      )}

      {panneau && ouverte && (
        <PanneauVerre
          titre={ouverte.site_nom}
          sousTitre={`Non-conformité ${GRAVITES[ouverte.gravite].toLowerCase()}`}
          origine={panneau.origine}
          onFermer={fermerPanneau}
        >
          {(fermer) => (
            <div className="ile-vue">
              <DetailNonConformite
                nc={ouverte}
                estDirecteur={estDirecteur}
                enCours={enCoursId === ouverte.id}
                onCorriger={() => corriger(ouverte)}
                onRelancer={(moyen, commentaire) => relancer(ouverte, moyen, commentaire)}
                onFermer={fermer}
              />
            </div>
          )}
        </PanneauVerre>
      )}

      {notification && (
        <Notification
          key={notification.cle}
          type={notification.type}
          texte={notification.texte}
          onFermer={fermerNotification}
        />
      )}
    </div>
  );
}