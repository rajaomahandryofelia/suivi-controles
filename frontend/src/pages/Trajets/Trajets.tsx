import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { isCancel } from "axios";
import api from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import BoutonRetour from "../../components/BoutonRetour";
import { formaterDate, messagesErreur } from "../Missions/outils";
import "../Tracabilite/PageTracabilite.css";
import "./Trajets.css";
import { distanceTexte, dureeMinTexte, heureCourte, jourISO, libelleJour, pluriel } from "./format";
import type { ReponseJournal, Visite } from "./types";

const PERIODES = [
  { jours: 7, texte: "7 jours" },
  { jours: 30, texte: "30 jours" },
  { jours: 90, texte: "3 mois" },
  { jours: 365, texte: "1 an" },
];

// Une visite à regarder de près : position éloignée ou démarrée sans GPS
function enAlerte(v: Visite) {
  const sansGps =
    Boolean(v.debut) && (v.debut_auto || v.latitude_debut === null || v.longitude_debut === null);
  return v.debut_loin || v.fin_loin || sansGps;
}

/** Un nombre qui monte jusqu'à sa valeur (sans animation si l'utilisateur la désactive). */
function useCompteur(cible: number, duree = 800) {
  const [valeur, setValeur] = useState(0);
  const depart = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      depart.current = cible;
      setValeur(cible);
      return;
    }
    const de = depart.current;
    let debut = 0;
    let id = 0;
    const pas = (t: number) => {
      if (!debut) debut = t;
      const p = Math.min((t - debut) / duree, 1);
      const v = Math.round(de + (cible - de) * (1 - Math.pow(1 - p, 3)));
      depart.current = v;
      setValeur(v);
      if (p < 1) id = requestAnimationFrame(pas);
    };
    id = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(id);
  }, [cible, duree]);

  return valeur;
}

export default function Trajets() {
  const { estDirecteur } = useAuth();

  const [controleur, setControleur] = useState("");
  const [du, setDu] = useState(jourISO(-30));
  const [au, setAu] = useState(jourISO());
  const [donnees, setDonnees] = useState<ReponseJournal | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [tentative, setTentative] = useState(0);
  const [exportEnCours, setExportEnCours] = useState(false);

  const parametres = useCallback(
    () => ({
      controleur: controleur || undefined,
      du: du || undefined,
      au: au || undefined,
    }),
    [controleur, du, au]
  );

  useEffect(() => {
    const annulation = new AbortController();
    setChargement(true);
    setErreur("");
    api
      .get<ReponseJournal>("/controles/tracabilite/", {
        params: parametres(),
        signal: annulation.signal,
      })
      .then((r) => {
        setDonnees(r.data);
        setChargement(false);
      })
      .catch((e) => {
        if (isCancel(e)) return;
        setChargement(false);
        setErreur(messagesErreur(e, "Impossible de charger les trajets. Réessayez."));
      });
    return () => annulation.abort();
  }, [parametres, tentative]);

  // Ouvre le PDF avec les mêmes filtres que la liste
  async function exporter() {
    setExportEnCours(true);
    setErreur("");
    try {
      const r = await api.get("/controles/tracabilite/pdf/", {
        params: parametres(),
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setErreur("Le PDF n'a pas pu être généré. Réessayez.");
    } finally {
      setExportEnCours(false);
    }
  }

  const visites = useMemo(() => donnees?.visites ?? [], [donnees]);
  const synthese = donnees?.synthese;

  // Les visites regroupées par jour, le plus récent en premier
  const jours = useMemo(() => {
    const parJour = new Map<string, Visite[]>();
    for (const v of visites) {
      parJour.set(v.date_prevue, [...(parJour.get(v.date_prevue) ?? []), v]);
    }
    return [...parJour.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visites]);

  const visitesAnimees = useCompteur(synthese?.visites ?? 0);

  // Position du curseur du contrôle segmenté (-1 : dates personnalisées)
  const indexActif = PERIODES.findIndex((p) => au === jourISO() && du === jourISO(-p.jours));

  const alertes = synthese ? synthese.sans_position + synthese.eloignees : 0;
  const texteIle = synthese
    ? [
        synthese.sans_position > 0 ? `${synthese.sans_position} sans position GPS` : "",
        synthese.eloignees > 0 ? `${pluriel(synthese.eloignees, "éloignée")} du site` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  // Résumé affiché sur la ligne « Filtres » quand elle est repliée
  const nomControleur = (donnees?.controleurs ?? []).find((c) => String(c.id) === controleur)?.nom;
  const resumeFiltres = [
    nomControleur ?? "",
    du && au ? `${formaterDate(du)} → ${formaterDate(au)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="trp-page">
      <BoutonRetour vers="/" texte={estDirecteur ? "Retour au tableau de bord" : "Retour à ma journée"} />

      <header className="trp-entete">
        <h1>{estDirecteur ? "Trajets des contrôleurs" : "Mes trajets"}</h1>
        <p className="trp-intro">
          {estDirecteur
            ? "Le chemin parcouru pendant chaque mission, avec les heures de début et de fin."
            : "Le chemin que vous avez parcouru pendant vos missions."}
        </p>
      </header>

      {erreur && (
        <p className="trp-message erreur" role="alert">
          {erreur}
        </p>
      )}

      {alertes > 0 && (
        <div className="trp-ile-zone">
          <p
            className="trp-ile"
            role="status"
            title={`Sans position GPS : démarrées automatiquement à l'heure prévue. Éloignées : position à plus de ${donnees?.seuil_ecart_m ?? 500} m du site.`}
          >
            <span className="trp-ile-point" aria-hidden="true" />
            <span className="trp-ile-texte">{texteIle}</span>
          </p>
        </div>
      )}

      {/* Période (contrôle segmenté) + export */}
      <div className="trp-barre">
        <div
          className="trp-segments"
          role="group"
          aria-label="Période"
          style={{ "--i": Math.max(indexActif, 0) } as CSSProperties}
        >
          {indexActif >= 0 && <span className="trp-curseur" aria-hidden="true" />}
          {PERIODES.map((p, i) => (
            <button
              key={p.jours}
              type="button"
              className={`trp-segment${i === indexActif ? " actif" : ""}`}
              aria-pressed={i === indexActif}
              onClick={() => {
                setDu(jourISO(-p.jours));
                setAu(jourISO());
              }}
            >
              {p.texte}
            </button>
          ))}
        </div>

        <div className="trp-actions">
          <button
            type="button"
            className="trp-ajout"
            onClick={exporter}
            disabled={exportEnCours || chargement || visites.length === 0}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v12" />
              <path d="m7 11 5 5 5-5" />
              <path d="M5 20h14" />
            </svg>
            {exportEnCours ? "Génération…" : "Exporter en PDF"}
          </button>
          {estDirecteur && (
            <Link to="/trajets/direct" className="trp-ajout">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              Carte en direct
            </Link>
          )}
        </div>
      </div>

      {/* Filtres : repliés, façon feuille iOS */}
      <details className="trp-filtres">
        <summary>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="8" cy="17" r="2" />
          </svg>
          <span className="trp-filtres-titre">Filtres</span>
          {controleur && <span className="trp-filtres-actif" aria-hidden="true" />}
          <span className="trp-filtres-resume">{resumeFiltres}</span>
          <span className="trp-chevron" aria-hidden="true" />
        </summary>

        <form className="trp-filtres-corps" onSubmit={(e) => e.preventDefault()}>
          {estDirecteur && (
            <div className="trp-champ">
              <label htmlFor="tj-controleur">Contrôleur</label>
              <select id="tj-controleur" value={controleur} onChange={(e) => setControleur(e.target.value)}>
                <option value="">Tous les contrôleurs</option>
                {(donnees?.controleurs ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="trp-champ">
            <label htmlFor="tj-du">Du</label>
            <input id="tj-du" type="date" value={du} max={au || undefined} onChange={(e) => setDu(e.target.value)} />
          </div>
          <div className="trp-champ">
            <label htmlFor="tj-au">Au</label>
            <input id="tj-au" type="date" value={au} min={du || undefined} onChange={(e) => setAu(e.target.value)} />
          </div>
        </form>
      </details>

      {/* Synthèse : un grand chiffre, quelques petits */}
      {synthese && (
        <section className="trp-bande" aria-label="Synthèse de la période">
          <div className="trp-bande-principal">
            <strong>{visitesAnimees}</strong>
            <span>mission{synthese.visites > 1 ? "s" : ""}</span>
          </div>
          <ul className="trp-bande-liste">
            {synthese.distance_totale_m !== undefined && (
              <li>
                <strong>{distanceTexte(synthese.distance_totale_m)}</strong> parcourus
              </li>
            )}
            {synthese.avec_trajet !== undefined && (
              <li>
                <strong>{synthese.avec_trajet}</strong> avec trajet enregistré
              </li>
            )}
            <li>
              <strong>{dureeMinTexte(synthese.duree_totale_min)}</strong> sur le terrain
            </li>
            {synthese.en_cours > 0 && (
              <li>
                <strong>{synthese.en_cours}</strong> en cours
              </li>
            )}
          </ul>
        </section>
      )}

      {erreur && donnees === null ? (
        <div className="trp-vide-page">
          <button type="button" className="trp-btn trp-btn-secondaire" onClick={() => setTentative((n) => n + 1)}>
            Réessayer
          </button>
        </div>
      ) : chargement && donnees === null ? (
        <div className="trp-chargement" role="status">
          <span className="trp-spinner-vert" aria-hidden="true" />
          Chargement des trajets…
        </div>
      ) : (
        <div className="trp-contenu" aria-busy={chargement}>
          {visites.length === 0 ? (
            <p className="trp-vide-page">
              Aucune mission démarrée sur cette période. Les trajets apparaissent ici dès qu'une mission commence.
            </p>
          ) : (
            jours.map(([jour, liste]) => (
              <section key={jour} className="trp-groupe">
                <h2 className="trp-jour">
                  {libelleJour(jour)}
                  <span>{pluriel(liste.length, "mission")}</span>
                </h2>

                <ul className="tj-liste">
                  {liste.map((v, i) => {
                    const nbPoints = v.nb_points ?? 0;
                    const puce = v.statut === "EN_COURS" ? "encours" : nbPoints > 0 ? "ok" : "vide";
                    const horaire = v.debut
                      ? `${heureCourte(v.debut)} → ${v.fin ? heureCourte(v.fin) : "en cours"}`
                      : "Pas démarrée";
                    return (
                      <li key={v.mission}>
                        <Link
                          to={`/trajets/${v.mission}`}
                          state={{ visite: v }}
                          className={enAlerte(v) ? "tj-ligne alerte" : "tj-ligne"}
                          style={{ animationDelay: `${Math.min(i, 9) * 35}ms` }}
                        >
                          <span className={`tj-puce ${puce}`} aria-hidden="true" />
                          <span className="tj-ligne-texte">
                            <strong>{v.site}</strong>
                            <span>
                              {estDirecteur ? `${v.controleur} · ` : ""}
                              {horaire}
                            </span>
                          </span>
                          <span className="tj-ligne-trajet">
                            <strong>
                              {v.distance_trajet_m !== undefined && v.distance_trajet_m !== null
                                ? distanceTexte(v.distance_trajet_m)
                                : "-"}
                            </strong>
                            <small>{nbPoints > 0 ? pluriel(nbPoints, "point") : "Pas de trajet"}</small>
                          </span>
                          <span className="tj-chevron" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}