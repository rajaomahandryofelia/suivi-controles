import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { isAxiosError, isCancel } from "axios";
import api from "../../api/client";
import BoutonRetour from "../../components/BoutonRetour";
import Notification from "../../components/Notification";
import PanneauIle from "../../components/PanneauIle";
import type { Origine } from "../../components/PanneauIle";
import "./Ordres.css";

type TypeOrdre = "MISSION" | "ROUTE";

interface Ordre {
  type: TypeOrdre;
  numero: string;
  date_emission: string;
  controleur_id: number;
  controleur: string;
  // TOURNEE : rattaché à une tournée ; MISSION : ordre d'une mission isolée
  portee: "TOURNEE" | "MISSION";
  tournee_id: number | null;
  mission_id: number | null;
  date_tournee: string;
  statut: string;
  statut_libelle: string;
}

interface OptionControleur {
  id: number;
  nom: string;
}

interface Reponse {
  count: number;
  page: number;
  taille: number;
  pages: number;
  resultats: Ordre[];
  controleurs: OptionControleur[];
}

interface EtatPanneau {
  ordre: Ordre;
  origine: Origine;
}

interface EtatNotification {
  cle: number;
  type: "succes" | "erreur";
  texte: string;
}

const TAILLE_PAGE = 15;
const LIBELLE_TYPE: Record<TypeOrdre, string> = {
  MISSION: "Ordre de mission",
  ROUTE: "Ordre de route",
};

const SEGMENTS: { valeur: string; libelle: string }[] = [
  { valeur: "", libelle: "Tous" },
  { valeur: "MISSION", libelle: "Ordres de mission" },
  { valeur: "ROUTE", libelle: "Ordres de route" },
];

function formaterDate(valeur: string): string {
  const [annee, mois, jour] = valeur.slice(0, 10).split("-");
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : valeur;
}

// Centre d'un élément : point de départ de l'animation du panneau
function origineDe(el: Element): Origine {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Chemin de l'API du PDF : un ordre isolé passe par la mission, les autres par la tournée
function cheminPdf(ordre: Ordre): string {
  if (ordre.portee === "MISSION") {
    return `/controles/missions/${ordre.mission_id}/ordre-mission/`;
  }
  const chemin = ordre.type === "MISSION" ? "ordre-mission" : "ordre-route";
  return `/controles/tournees/${ordre.tournee_id}/${chemin}/`;
}

// Page du trajet : une mission isolée a son trajet, une tournée enchaîne ceux de ses missions
function cheminTrajet(ordre: Ordre): string {
  return ordre.portee === "MISSION"
    ? `/trajets/${ordre.mission_id}`
    : `/trajets/tournee/${ordre.tournee_id}`;
}

export default function Ordres() {
  // Filtres (la recherche est retardée de 300 ms pour ne pas interroger le serveur à chaque touche)
  const [saisie, setSaisie] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [controleur, setControleur] = useState("");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [page, setPage] = useState(1);

  const [reponse, setReponse] = useState<Reponse | null>(null);
  const [controleurs, setControleurs] = useState<OptionControleur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [tentative, setTentative] = useState(0);

  const [ouverture, setOuverture] = useState<string | null>(null);
  const [panneau, setPanneau] = useState<EtatPanneau | null>(null);
  const [notification, setNotification] = useState<EtatNotification | null>(null);

  const notifier = useCallback((typeNotif: "succes" | "erreur", texte: string) => {
    setNotification({ cle: Date.now(), type: typeNotif, texte });
  }, []);
  const fermerNotification = useCallback(() => setNotification(null), []);
  const fermerPanneau = useCallback(() => setPanneau(null), []);

  useEffect(() => {
    const minuteur = window.setTimeout(() => {
      setQ(saisie.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(minuteur);
  }, [saisie]);

  useEffect(() => {
    const annulation = new AbortController();
    setChargement(true);
    setErreur("");

    api
      .get<Reponse>("/controles/ordres/", {
        params: {
          q: q || undefined,
          type: type || undefined,
          controleur: controleur || undefined,
          du: du || undefined,
          au: au || undefined,
          page,
          taille: TAILLE_PAGE,
        },
        signal: annulation.signal,
      })
      .then((r) => {
        setReponse(r.data);
        setControleurs(r.data.controleurs);
        setChargement(false);
      })
      .catch((e) => {
        if (isCancel(e)) return;
        setReponse(null);
        setChargement(false);
        if (isAxiosError(e) && e.response?.status === 400 && e.response.data?.detail) {
          setErreur(String(e.response.data.detail));
        } else if (isAxiosError(e) && e.response?.status === 403) {
          setErreur("Cette page est réservée au Directeur.");
        } else {
          setErreur("Impossible de charger les ordres délivrés. Réessayez.");
        }
      });

    return () => annulation.abort();
  }, [q, type, controleur, du, au, page, tentative]);

  const filtresActifs = Boolean(q || type || controleur || du || au);

  function reinitialiser() {
    setSaisie("");
    setQ("");
    setType("");
    setControleur("");
    setDu("");
    setAu("");
    setPage(1);
  }

  function changer(modifier: (valeur: string) => void) {
    return (e: { target: { value: string } }) => {
      modifier(e.target.value);
      setPage(1);
    };
  }

  function choisirType(valeur: string) {
    setType(valeur);
    setPage(1);
  }

  // Même logique que TelechargerOrdres : appel API en blob puis ouverture du PDF
  async function ouvrirPdf(ordre: Ordre) {
    const cle = `${ordre.type}-${ordre.numero}`;
    setOuverture(cle);
    try {
      const r = await api.get(cheminPdf(ordre), { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      notifier("erreur", `Le document ${ordre.numero} n'a pas pu être ouvert.`);
    } finally {
      setOuverture(null);
    }
  }

  function surTouche(e: KeyboardEvent<HTMLTableRowElement>, ordre: Ordre) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPanneau({ ordre, origine: origineDe(e.currentTarget) });
    }
  }

  const premiereCharge = chargement && reponse === null;
  const total = reponse?.count ?? 0;

  return (
    <div className="ord-page">
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <div className="entete-page">
        <h1>Ordres délivrés</h1>
      </div>
      <p className="ord-intro">
        Registre des ordres de mission et des ordres de route délivrés, avec leur numéro officiel,
        le contrôleur concerné et la mission associée.
        {reponse && (
          <strong className="ord-compte">
            {total} {total > 1 ? "ordres" : "ordre"}
            {filtresActifs ? " trouvés" : ""}
          </strong>
        )}
      </p>

      {/* Pilule : type d'ordre */}
      <div className="ord-ilot-zone">
        <div className="ord-ilot" role="group" aria-label="Filtrer par type d'ordre">
          {SEGMENTS.map((s) => (
            <button
              key={s.valeur || "tous"}
              type="button"
              aria-pressed={type === s.valeur}
              className={`ord-segment${type === s.valeur ? " actif" : ""}`}
              onClick={() => choisirType(s.valeur)}
            >
              {s.libelle}
            </button>
          ))}
        </div>
      </div>

      {/* Recherche et filtres */}
      <form className="ord-filtres" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="ord-champ ord-champ-large">
          <label htmlFor="ord-q">Recherche</label>
          <input
            id="ord-q"
            type="search"
            placeholder="Numéro ou contrôleur…"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="ord-champ">
          <label htmlFor="ord-controleur">Contrôleur</label>
          <select id="ord-controleur" value={controleur} onChange={changer(setControleur)}>
            <option value="">Tous les contrôleurs</option>
            {controleurs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="ord-champ">
          <label htmlFor="ord-du">Délivré du</label>
          <input id="ord-du" type="date" value={du} max={au || undefined} onChange={changer(setDu)} />
        </div>

        <div className="ord-champ">
          <label htmlFor="ord-au">au</label>
          <input id="ord-au" type="date" value={au} min={du || undefined} onChange={changer(setAu)} />
        </div>

        {filtresActifs && (
          <button type="button" className="ord-reinit" onClick={reinitialiser}>
            Réinitialiser
          </button>
        )}
      </form>

      <p className="ord-sr" role="status" aria-live="polite">
        {reponse && !chargement ? `${total} résultat${total > 1 ? "s" : ""}` : ""}
      </p>

      {erreur ? (
        <div className="ord-message erreur" role="alert">
          <span>{erreur}</span>
          <button type="button" className="ord-reinit" onClick={() => setTentative((n) => n + 1)}>
            Réessayer
          </button>
        </div>
      ) : premiereCharge ? (
        <div className="ord-chargement" role="status" aria-live="polite">
          <span className="ord-spinner" aria-hidden="true" />
          Chargement des ordres…
        </div>
      ) : reponse && total === 0 ? (
        <div className="ord-tableau-cadre">
          <p className="ord-vide">
            {filtresActifs ? (
              <>
                Aucun ordre ne correspond. Modifiez la recherche ou les filtres.{" "}
                <button type="button" className="ord-lien" onClick={reinitialiser}>
                  Réinitialiser les filtres
                </button>
              </>
            ) : (
              <>
                Aucun ordre délivré pour le moment. Les ordres sont délivrés lorsque vous
                attribuez une mission, depuis la page Missions.{" "}
                <Link to="/missions" className="ord-lien">
                  Aller aux missions
                </Link>
              </>
            )}
          </p>
        </div>
      ) : reponse ? (
        <div className="ord-tableau-cadre" aria-busy={chargement}>
          <div className={chargement ? "ord-en-cours" : undefined}>
            <table className="ord-tableau">
              <caption className="ord-sr">Ordres de mission et ordres de route délivrés</caption>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Numéro</th>
                  <th>Délivré le</th>
                  <th>Contrôleur</th>
                  <th>Date du contrôle</th>
                  <th>Statut</th>
                  <th>Document</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {reponse.resultats.map((o) => {
                  const cle = `${o.type}-${o.numero}`;
                  const isole = o.portee === "MISSION";
                  return (
                    <tr
                      key={cle}
                      tabIndex={0}
                      onClick={(e) => setPanneau({ ordre: o, origine: { x: e.clientX, y: e.clientY } })}
                      onKeyDown={(e) => surTouche(e, o)}
                    >
                      <td>
                        <span className={`ord-type ${o.type}`}>{LIBELLE_TYPE[o.type]}</span>
                      </td>
                      <td className="ord-numero">{o.numero}</td>
                      <td className="ord-date">{formaterDate(o.date_emission)}</td>
                      <td>{o.controleur}</td>
                      <td className="ord-date">
                        {formaterDate(o.date_tournee)}
                        {isole && <span className="ord-isole">Mission isolée</span>}
                      </td>
                      <td>
                        <span className={`ord-statut ${o.statut}`}>{o.statut_libelle}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          <button
                            type="button"
                            className="bouton"
                            onClick={(e) => {
                              e.stopPropagation();
                              ouvrirPdf(o);
                            }}
                            disabled={ouverture !== null}
                            aria-label={`Ouvrir le PDF de ${LIBELLE_TYPE[o.type].toLowerCase()} ${o.numero}`}
                          >
                            {ouverture === cle ? "Ouverture…" : "Ouvrir le PDF"}
                          </button>
                          <Link
                            to={cheminTrajet(o)}
                            className="ord-bouton-lien"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Voir le trajet de ${LIBELLE_TYPE[o.type].toLowerCase()} ${o.numero}`}
                          >
                            Voir le trajet
                          </Link>
                        </div>
                      </td>
                      <td className="ord-chevron" aria-hidden="true">
                        ›
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {reponse.pages > 1 && (
            <nav className="ord-pagination" aria-label="Pagination des ordres">
              <button
                type="button"
                className="ord-page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={reponse.page <= 1 || chargement}
              >
                Précédent
              </button>
              <span aria-current="page">
                Page {reponse.page} sur {reponse.pages}
              </span>
              <button
                type="button"
                className="ord-page-btn"
                onClick={() => setPage((p) => Math.min(reponse.pages, p + 1))}
                disabled={reponse.page >= reponse.pages || chargement}
              >
                Suivant
              </button>
            </nav>
          )}
        </div>
      ) : null}

      {panneau && (
        <PanneauIle
          titre={panneau.ordre.numero}
          sousTitre={LIBELLE_TYPE[panneau.ordre.type]}
          origine={panneau.origine}
          onFermer={fermerPanneau}
        >
          {(fermer) => {
            const o = panneau.ordre;
            const cle = `${o.type}-${o.numero}`;
            const isole = o.portee === "MISSION";
            return (
              <div className="ile-vue">
                <div className="ord-badges">
                  <span className={`ord-type ${o.type}`}>{LIBELLE_TYPE[o.type]}</span>
                  <span className={`ord-statut ${o.statut}`}>{o.statut_libelle}</span>
                  {isole && <span className="ord-isole-badge">Mission isolée</span>}
                </div>

                <dl className="ord-infos">
                  <div className="ord-info">
                    <dt>Numéro officiel</dt>
                    <dd>
                      <strong>{o.numero}</strong>
                    </dd>
                  </div>
                  <div className="ord-info">
                    <dt>Délivré le</dt>
                    <dd>
                      <strong>{formaterDate(o.date_emission)}</strong>
                    </dd>
                  </div>
                  <div className="ord-info">
                    <dt>Contrôleur</dt>
                    <dd>
                      <strong>{o.controleur}</strong>
                    </dd>
                  </div>
                  <div className="ord-info">
                    <dt>Date du contrôle</dt>
                    <dd>
                      <strong>{formaterDate(o.date_tournee)}</strong>
                      <span>{isole ? "Mission isolée" : "Mission"}</span>
                    </dd>
                  </div>
                </dl>

                <div className="ord-panneau-actions">
                  <button
                    type="button"
                    className="bouton"
                    onClick={() => ouvrirPdf(o)}
                    disabled={ouverture !== null}
                  >
                    {ouverture === cle ? "Ouverture…" : "Ouvrir le PDF"}
                  </button>
                  <Link to={cheminTrajet(o)} className="ord-bouton-lien">
                    Voir le trajet
                  </Link>
                  <Link
                    to={isole ? `/missions?mission=${o.mission_id}` : `/missions?tournee=${o.tournee_id}`}
                    className="ord-bouton-lien"
                  >
                    Voir la mission
                  </Link>
                  <button type="button" className="ord-bouton-lien" onClick={fermer}>
                    Fermer
                  </button>
                </div>
              </div>
            );
          }}
        </PanneauIle>
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