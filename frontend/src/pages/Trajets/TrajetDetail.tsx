import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { isCancel } from "axios";
import api from "../../api/client";
import BoutonRetour from "../../components/BoutonRetour";
import { messagesErreur } from "../Missions/outils";
import CarteTrajet from "./CarteTrajet";
import { distanceTexte, dureeMinTexte, heureCourte, pluriel } from "./format";
import type { ReponseTrajet, Visite } from "./types";
import "../Tracabilite/PageTracabilite.css";
import "./Trajets.css";

const STATUTS: Record<string, string> = {
  PLANIFIEE: "Planifiée",
  EN_COURS: "En cours",
  CLOTUREE: "Clôturée",
};

export default function TrajetDetail() {
  const { mission } = useParams<{ mission: string }>();
  const location = useLocation();
  // La ligne cliquée dans la liste : début, fin et écart d'arrivée du journal
  const visite = (location.state as { visite?: Visite } | null)?.visite;

  const [donnees, setDonnees] = useState<ReponseTrajet | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    if (!mission) return;
    const annulation = new AbortController();
    setChargement(true);
    setErreur("");
    api
      .get<ReponseTrajet>(`/controles/missions/${mission}/trajet/`, { signal: annulation.signal })
      .then((r) => {
        setDonnees(r.data);
        setChargement(false);
      })
      .catch((e) => {
        if (isCancel(e)) return;
        setChargement(false);
        setErreur(messagesErreur(e, "Impossible de charger le trajet. Réessayez."));
      });
    return () => annulation.abort();
  }, [mission, tentative]);

  const resume = donnees?.resume;
  const ecartLoin =
    resume !== undefined && resume.ecart_min_site_m !== null && resume.ecart_min_site_m > resume.seuil_ecart_m;

  const debut = visite?.debut ?? resume?.debut ?? null;
  const fin = visite?.fin ?? resume?.fin ?? null;
  const enCours = donnees?.statut === "EN_COURS";

  return (
    <div className="trp-page">
      <BoutonRetour vers="/trajets" texte="Retour aux trajets" />

      {erreur && (
        <div className="tj-erreur">
          <p className="trp-message erreur" role="alert">
            {erreur}
          </p>
          <button type="button" className="trp-btn trp-btn-secondaire" onClick={() => setTentative((n) => n + 1)}>
            Réessayer
          </button>
        </div>
      )}

      {chargement && !donnees && !erreur && (
        <div className="trp-chargement" role="status">
          <span className="trp-spinner-vert" aria-hidden="true" />
          Chargement du trajet…
        </div>
      )}

      {donnees && resume && (
        <>
          <header className="trp-entete">
            <h1>{donnees.site.nom}</h1>
            <p className="tj-meta">
              <span>{donnees.controleur}</span>
              <span className={`tj-etat${enCours ? " encours" : ""}`}>
                {STATUTS[donnees.statut] ?? donnees.statut}
              </span>
            </p>
          </header>

          <section className="tj-chiffres" aria-label="Résumé du trajet">
            <div className="tj-chiffre">
              <strong>{distanceTexte(resume.distance_m)}</strong>
              <span>Distance parcourue</span>
            </div>
            <div className="tj-chiffre">
              <strong>{dureeMinTexte(resume.duree_min)}</strong>
              <span>Durée du trajet</span>
            </div>
            <div className={ecartLoin ? "tj-chiffre alerte" : "tj-chiffre"}>
              <strong>
                {resume.ecart_min_site_m !== null ? distanceTexte(resume.ecart_min_site_m) : "-"}
              </strong>
              <span>Plus près du site (seuil {distanceTexte(resume.seuil_ecart_m)})</span>
            </div>
            <div className="tj-chiffre">
              <strong>{debut ? heureCourte(debut) : "-"}</strong>
              <span>
                Début
                {visite?.ecart_debut_m != null ? ` · à ${distanceTexte(visite.ecart_debut_m)} du site` : ""}
              </span>
            </div>
            <div className="tj-chiffre">
              <strong>{fin ? heureCourte(fin) : enCours ? "En cours" : "-"}</strong>
              <span>
                Fin
                {visite?.ecart_fin_m != null ? ` · à ${distanceTexte(visite.ecart_fin_m)} du site` : ""}
              </span>
            </div>
          </section>

          <div className="tj-carte-cadre">
            <CarteTrajet
              points={donnees.points}
              site={donnees.site}
              seuilM={resume.seuil_ecart_m}
              trous={resume.trous}
            />
            {resume.nb_points === 0 && (
              <div className="tj-carte-voile">Aucun point enregistré pour cette mission.</div>
            )}
          </div>

          <ul className="tj-legende" aria-label="Légende de la carte">
            <li>
              <span className="tj-trait" aria-hidden="true" />
              Trajet
            </li>
            <li>
              <span className="tj-trait gris" aria-hidden="true" />
              Silence du suivi
            </li>
            <li>
              <span className="tj-zone" aria-hidden="true" />
              Site, tolérance {distanceTexte(resume.seuil_ecart_m)}
            </li>
          </ul>

          <p className="tj-note">
            Tracé approximatif : la position n'est relevée que lorsque la page reste ouverte et l'écran allumé.
            {donnees.allege ? " Le tracé affiché est allégé ; la distance est calculée sur tous les points." : ""}
          </p>

          {resume.trous.length > 0 && (
            <section className="tj-trous">
              <h2>Silences de plus de 5 min</h2>
              <ul>
                {resume.trous.slice(0, 6).map((t) => (
                  <li key={`${t.du}-${t.au}`}>
                    <span>
                      {heureCourte(t.du)} → {heureCourte(t.au)}
                    </span>
                    <strong>{t.minutes} min</strong>
                  </li>
                ))}
              </ul>
              {resume.trous.length > 6 && (
                <p className="tj-note">et {pluriel(resume.trous.length - 6, "autre")}</p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}