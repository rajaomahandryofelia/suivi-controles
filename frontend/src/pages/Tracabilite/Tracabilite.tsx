import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { isCancel } from "axios";
import api from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import BoutonRetour from "../../components/BoutonRetour";
import { formaterDate, lienCarte, messagesErreur } from "../Missions/outils";
import "./PageTracabilite.css";

interface Visite {
  mission: number;
  controleur_id: number;
  controleur: string;
  site: string;
  localisation: string;
  statut: string;
  statut_libelle: string;
  date_prevue: string;
  creneau: string;
  debut: string | null;
  fin: string | null;
  duree_min: number | null;
  latitude_debut: string | null;
  longitude_debut: string | null;
  latitude_fin: string | null;
  longitude_fin: string | null;
  debut_auto: boolean;
  fin_auto: boolean;
  ecart_debut_m: number | null;
  ecart_fin_m: number | null;
  debut_loin: boolean;
  fin_loin: boolean;
  nb_criteres: number;
  nb_reponses: number;
  nb_photos: number;
  nb_non_conformites: number;
  rapport: { statut: string; statut_libelle: string; score: string | number } | null;
}

interface Synthese {
  visites: number;
  cloturees: number;
  en_cours: number;
  duree_totale_min: number;
  sans_position: number;
  eloignees: number;
}

interface Reponse {
  visites: Visite[];
  synthese: Synthese;
  seuil_ecart_m: number;
  controleurs?: { id: number; nom: string }[];
}

const jourISO = (decalage = 0) =>
  new Date(Date.now() + decalage * 86400000).toLocaleDateString("sv-SE");

const PERIODES = [
  { jours: 7, texte: "7 jours" },
  { jours: 30, texte: "30 jours" },
  { jours: 90, texte: "3 mois" },
  { jours: 365, texte: "1 an" },
];

function dureeTexte(minutes: number | null) {
  if (minutes === null) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

function distanceTexte(metres: number) {
  return metres < 1000
    ? `${metres} m`
    : `${(metres / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

function heure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function jourCourt(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function libelleJour(iso: string) {
  if (iso === jourISO()) return "Aujourd'hui";
  if (iso === jourISO(-1)) return "Hier";
  return formaterDate(iso);
}

function initiales(nom: string) {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0].toUpperCase())
    .join("");
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

// Une visite à regarder de près : position éloignée ou démarrée sans GPS
function enAlerte(v: Visite) {
  const sansGps = Boolean(v.debut) && (v.debut_auto || v.latitude_debut === null || v.longitude_debut === null);
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

interface MomentProps {
  instant: string | null;
  latitude: string | null;
  longitude: string | null;
  auto: boolean;
  ecart: number | null;
  loin: boolean;
  absent: string;
  jourRef: string;
}

// Quand et où un contrôle a commencé ou fini
function Moment({ instant, latitude, longitude, auto, ecart, loin, absent, jourRef }: MomentProps) {
  if (!instant) {
    return (
      <div className="trp-moment">
        <span className="trp-vide">{absent}</span>
      </div>
    );
  }

  // L'heure suffit : on ajoute la date seulement si ce n'est pas le jour prévu
  const autreJour = new Date(instant).toLocaleDateString("sv-SE") !== jourRef;

  return (
    <div className="trp-moment">
      <strong>
        {heure(instant)}
        {autreJour && <small>{jourCourt(instant)}</small>}
      </strong>
      {auto || latitude === null || longitude === null ? (
        <span className="trp-gps auto" title="Automatique, sans position GPS">
          Auto · sans GPS
        </span>
      ) : (
        <a
          className={`trp-gps ${ecart === null ? "neutre" : loin ? "loin" : "pres"}`}
          href={lienCarte(latitude, longitude)}
          target="_blank"
          rel="noopener noreferrer"
          title="Voir sur la carte"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          {ecart === null
            ? "Voir sur la carte"
            : loin
              ? `Éloigné · ${distanceTexte(ecart)}`
              : `à ${distanceTexte(ecart)} du site`}
        </a>
      )}
    </div>
  );
}

export default function Tracabilite() {
  const { estDirecteur } = useAuth();

  const [controleur, setControleur] = useState("");
  const [du, setDu] = useState(jourISO(-30));
  const [au, setAu] = useState(jourISO());
  const [donnees, setDonnees] = useState<Reponse | null>(null);
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
      .get<Reponse>("/controles/tracabilite/", {
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
        setErreur(messagesErreur(e, "Impossible de charger le journal. Réessayez."));
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
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <header className="trp-entete">
        <h1>{estDirecteur ? "Traçabilité des contrôles" : "Mon journal de contrôles"}</h1>
        <p className="trp-intro">
          {estDirecteur
            ? "Qui a contrôlé quel site, où, à quelle heure et jusqu'à quand. Chaque carte est une visite de site démarrée."
            : "Vos visites de sites : l'heure de début et de fin, et l'endroit où vous étiez."}
        </p>
      </header>

      {erreur && (
        <p className="trp-message erreur" role="alert">
          {erreur}
        </p>
      )}

      {/* Alerte unique, en verre, centrée */}
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
            <Link to="/tracabilite/carte" className="trp-ajout">
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
              <label htmlFor="trp-controleur">Contrôleur</label>
              <select
                id="trp-controleur"
                value={controleur}
                onChange={(e) => setControleur(e.target.value)}
              >
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
            <label htmlFor="trp-du">Du</label>
            <input id="trp-du" type="date" value={du} max={au || undefined} onChange={(e) => setDu(e.target.value)} />
          </div>
          <div className="trp-champ">
            <label htmlFor="trp-au">Au</label>
            <input id="trp-au" type="date" value={au} min={du || undefined} onChange={(e) => setAu(e.target.value)} />
          </div>
        </form>
      </details>

      {/* Synthèse : un grand chiffre, trois petits */}
      {synthese && (
        <section className="trp-bande" aria-label="Synthèse de la période">
          <div className="trp-bande-principal">
            <strong>{visitesAnimees}</strong>
            <span>visite{synthese.visites > 1 ? "s" : ""} de site</span>
          </div>
          <ul className="trp-bande-liste">
            <li>
              <strong>{synthese.cloturees}</strong> clôturée{synthese.cloturees > 1 ? "s" : ""}
            </li>
            <li>
              <strong>{dureeTexte(synthese.duree_totale_min)}</strong> sur le terrain
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
        // Premier chargement impossible : le message est affiché plus haut, on propose de réessayer
        <div className="trp-vide-page">
          <button type="button" className="trp-btn trp-btn-secondaire" onClick={() => setTentative((n) => n + 1)}>
            Réessayer
          </button>
        </div>
      ) : chargement && donnees === null ? (
        <div className="trp-chargement" role="status">
          <span className="trp-spinner-vert" aria-hidden="true" />
          Chargement du journal…
        </div>
      ) : (
        <div className="trp-contenu" aria-busy={chargement}>
          {visites.length === 0 ? (
            <p className="trp-vide-page">
              Aucun contrôle démarré sur cette période. Les visites apparaissent ici dès qu'un site est démarré.
            </p>
          ) : (
            jours.map(([jour, liste]) => (
              <section key={jour} className="trp-groupe">
                <h2 className="trp-jour">
                  {libelleJour(jour)}
                  <span>{pluriel(liste.length, "visite")}</span>
                </h2>

                <div className="trp-grille">
                  {liste.map((v, i) => {
                    const infos = [
                      `${v.nb_reponses}/${v.nb_criteres} critères`,
                      `${v.nb_non_conformites} non-conf.`,
                      pluriel(v.nb_photos, "photo"),
                      v.rapport
                        ? `Rapport ${v.rapport.statut_libelle.toLowerCase()} : ${Math.round(Number(v.rapport.score))} %`
                        : "",
                    ].filter(Boolean);
                    const avancement = v.nb_criteres > 0 ? Math.min(100, (v.nb_reponses / v.nb_criteres) * 100) : 0;

                    return (
                      <article
                        key={v.mission}
                        className={enAlerte(v) ? "trp-carte alerte" : "trp-carte"}
                        style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}
                      >
                        <header className="trp-carte-tete">
                          <div className="trp-carte-site">
                            <h3>{v.site}</h3>
                            <p>{v.localisation}</p>
                          </div>
                          <span className={`trp-statut trp-statut-${v.statut}`}>
                            <span className="trp-statut-point" aria-hidden="true" />
                            {v.statut_libelle}
                          </span>
                        </header>

                        {(estDirecteur || v.creneau) && (
                          <p className="trp-qui">
                            {estDirecteur ? (
                              <span className="trp-qui-nom">
                                <span className="trp-avatar" aria-hidden="true">
                                  {initiales(v.controleur)}
                                </span>
                                {v.controleur}
                              </span>
                            ) : (
                              <span />
                            )}
                            {v.creneau && <span className="trp-creneau">Prévu {v.creneau}</span>}
                          </p>
                        )}

                        <div className="trp-chrono">
                          <Moment
                            instant={v.debut}
                            latitude={v.latitude_debut}
                            longitude={v.longitude_debut}
                            auto={v.debut_auto}
                            ecart={v.ecart_debut_m}
                            loin={v.debut_loin}
                            absent="-"
                            jourRef={v.date_prevue}
                          />
                          <div className={v.duree_min === null ? "trp-fil sans" : "trp-fil"} aria-hidden="true">
                            <span className="trp-fil-trait" />
                            {v.duree_min !== null && <span className="trp-duree">{dureeTexte(v.duree_min)}</span>}
                            <span className="trp-fil-trait" />
                          </div>
                          <Moment
                            instant={v.fin}
                            latitude={v.latitude_fin}
                            longitude={v.longitude_fin}
                            auto={v.fin_auto}
                            ecart={v.ecart_fin_m}
                            loin={v.fin_loin}
                            absent="En cours"
                            jourRef={v.date_prevue}
                          />
                        </div>

                        <p className="trp-controle">
                          {infos.map((texte, k) => (
                            <span key={k}>{texte}</span>
                          ))}
                        </p>

                        {v.nb_criteres > 0 && (
                          <span className="trp-avance" aria-hidden="true">
                            <span style={{ width: `${avancement}%` }} />
                          </span>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}