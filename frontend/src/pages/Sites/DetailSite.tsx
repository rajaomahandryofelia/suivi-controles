import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { lienCarte, messagesErreur } from "../Missions/outils";
import { formaterDate } from "../outilsListe";
import CarteSite from "./CarteSite";
import { URL_SITES } from "./types";
import type { MissionHistorique, NonConformite, Site } from "./types";

interface Props {
  site: Site;
  onModifier: () => void;
  onChangerStatut: (actif: boolean) => Promise<void>;
  onFermer: () => void;
}

type Ton = "neutre" | "vert" | "rouge" | "ambre";

const TON_MISSION: Record<string, Ton> = { PLANIFIEE: "neutre", EN_COURS: "ambre", CLOTUREE: "vert" };
const TON_RAPPORT: Record<string, Ton> = { GENERE: "neutre", VALIDE: "vert", REJETE: "rouge" };
const TON_GRAVITE: Record<string, Ton> = { MINEURE: "neutre", MAJEURE: "ambre", CRITIQUE: "rouge" };
const TON_NC: Record<string, Ton> = { OUVERTE: "rouge", CORRIGEE: "ambre", VERIFIEE: "vert" };

function Info({ label, large, children }: { label: string; large?: boolean; children: ReactNode }) {
  return (
    <div className={`sit-info${large ? " large" : ""}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Section({ titre, nombre, children }: { titre: string; nombre?: number; children: ReactNode }) {
  return (
    <section className="sit-section">
      <h3 className="sit-section-titre">
        {titre}
        {nombre !== undefined && <span className="sit-nombre">{nombre}</span>}
      </h3>
      {children}
    </section>
  );
}

function Badge({ ton, children }: { ton: Ton; children: string }) {
  return <span className={`sit-badge ${ton}`}>{children}</span>;
}

export default function DetailSite({ site, onModifier, onChangerStatut, onFermer }: Props) {
  const [missions, setMissions] = useState<MissionHistorique[]>([]);
  const [nonConformites, setNonConformites] = useState<NonConformite[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreurHistorique, setErreurHistorique] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  // Historique du site (missions et non-conformités)
  useEffect(() => {
    let actif = true;
    async function charger() {
      try {
        const reponse = await api.get(`${URL_SITES}${site.id}/historique/`);
        if (!actif) return;
        setMissions(reponse.data.missions ?? []);
        setNonConformites(reponse.data.non_conformites ?? []);
      } catch {
        if (actif) setErreurHistorique("Impossible de charger l'historique de ce site.");
      } finally {
        if (actif) setChargement(false);
      }
    }
    charger();
    return () => {
      actif = false;
    };
  }, [site.id]);

  async function changerStatut(actif: boolean) {
    setErreur("");
    setEnCours(true);
    try {
      await onChangerStatut(actif);
      setConfirmation(false);
    } catch (e) {
      setErreur(messagesErreur(e, "Le changement de statut a échoué."));
    } finally {
      setEnCours(false);
    }
  }

  const ouvertes = site.non_conformites_ouvertes ?? 0;

  return (
    <div>
      <div className="sit-badges">
        <span className={`lst-statut ${site.est_actif ? "actif" : "inactif"}`}>
          {site.est_actif ? "Suivi" : "Non suivi"}
        </span>
        {ouvertes > 0 && (
          <span className="lst-compteur alerte">
            {ouvertes} non-conformité{ouvertes > 1 ? "s" : ""} ouverte{ouvertes > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {erreur && (
        <div className="ile-erreur" role="alert">
          {erreur}
        </div>
      )}

      <dl className="sit-infos">
        <Info label="Type de site">{site.type_site_libelle}</Info>
        <Info label="Partenaire">
          {site.partenaire && site.partenaire_nom ? (
            <Link className="sit-lien" to={`/partenaires?ouvrir=${site.partenaire}`}>
              {site.partenaire_nom}
            </Link>
          ) : (
            <span className="lst-absent">Non renseigné</span>
          )}
        </Info>
        <Info label="Localisation" large>
          {site.localisation}
          <span className="sit-position">
            {site.latitude}, {site.longitude} ·{" "}
            <a href={lienCarte(site.latitude, site.longitude)} target="_blank" rel="noopener noreferrer">
              Voir sur la carte
            </a>
          </span>
          {Number.isFinite(Number(site.latitude)) && Number.isFinite(Number(site.longitude)) && (
            <CarteSite latitude={Number(site.latitude)} longitude={Number(site.longitude)} />
          )}
        </Info>
        <Info label="Dernier contrôle">
          {site.dernier_controle ? (
            formaterDate(site.dernier_controle)
          ) : (
            <span className="lst-absent">Jamais contrôlé</span>
          )}
        </Info>
        <Info label="Contrôles effectués">{site.nombre_controles ?? 0}</Info>
      </dl>

      <Section titre="Inventaire" nombre={site.elements.length}>
        {site.elements.length === 0 ? (
          <p className="sit-vide">L'inventaire est vide. Il se remplit lors des contrôles.</p>
        ) : (
          <div className="sit-mini-cadre">
            <table className="sit-mini">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Ajouté le</th>
                </tr>
              </thead>
              <tbody>
                {site.elements.map((e) => (
                  <tr key={e.id}>
                    <td>{e.type}</td>
                    <td>{e.description}</td>
                    <td>{formaterDate(e.date_ajout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {erreurHistorique ? (
        <div className="ile-erreur" role="alert">
          {erreurHistorique}
        </div>
      ) : chargement ? (
        <div className="lst-chargement">
          <span className="lst-spinner" aria-hidden="true" />
          Chargement de l'historique…
        </div>
      ) : (
        <>
          <Section titre="Missions" nombre={missions.length}>
            {missions.length === 0 ? (
              <p className="sit-vide">Aucune mission n'a encore été créée pour ce site.</p>
            ) : (
              <div className="sit-mini-cadre">
                <table className="sit-mini">
                  <thead>
                    <tr>
                      <th>Date prévue</th>
                      <th>Contrôleur</th>
                      <th>Statut</th>
                      <th>Rapport</th>
                      <th className="centre">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missions.map((m) => (
                      <tr key={m.id}>
                        <td>{formaterDate(m.date_prevue)}</td>
                        <td>{m.controleur_nom}</td>
                        <td>
                          <Badge ton={TON_MISSION[m.statut] ?? "neutre"}>{m.statut_libelle}</Badge>
                        </td>
                        <td>
                          {m.rapport_statut && m.rapport_statut_libelle ? (
                            <Badge ton={TON_RAPPORT[m.rapport_statut] ?? "neutre"}>
                              {m.rapport_statut_libelle}
                            </Badge>
                          ) : (
                            <span className="lst-absent">—</span>
                          )}
                        </td>
                        <td className="centre">
                          {m.score_conformite !== null ? (
                            `${Number(m.score_conformite)} %`
                          ) : (
                            <span className="lst-absent">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section titre="Non-conformités" nombre={nonConformites.length}>
            {nonConformites.length === 0 ? (
              <p className="sit-vide">Aucune non-conformité n'a été relevée sur ce site.</p>
            ) : (
              <div className="sit-mini-cadre">
                <table className="sit-mini">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Gravité</th>
                      <th>Statut</th>
                      <th>À corriger avant le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonConformites.map((n) => (
                      <tr key={n.id}>
                        <td className="sit-large">{n.description}</td>
                        <td>
                          <Badge ton={TON_GRAVITE[n.gravite] ?? "neutre"}>{n.gravite_libelle}</Badge>
                        </td>
                        <td>
                          <Badge ton={TON_NC[n.statut] ?? "neutre"}>{n.statut_libelle}</Badge>
                        </td>
                        <td>{formaterDate(n.date_limite_correction)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}

      {confirmation ? (
        <div className="ile-confirmation">
          <p>
            Désactiver ce site ? Il ne pourra plus recevoir de nouvelles missions, mais son
            historique est conservé.
          </p>
          <div className="ile-actions">
            <button
              type="button"
              className="bouton secondaire"
              onClick={() => setConfirmation(false)}
              disabled={enCours}
            >
              Annuler
            </button>
            <button
              type="button"
              className="bouton danger"
              onClick={() => changerStatut(false)}
              disabled={enCours}
            >
              {enCours ? "Désactivation…" : "Oui, désactiver"}
            </button>
          </div>
        </div>
      ) : (
        <div className="ile-actions">
          <button type="button" className="bouton secondaire" onClick={onFermer}>
            Fermer
          </button>
          {site.est_actif ? (
            <button
              type="button"
              className="bouton secondaire sit-bouton-suppression"
              onClick={() => setConfirmation(true)}
            >
              Désactiver
            </button>
          ) : (
            <button
              type="button"
              className="bouton secondaire"
              onClick={() => changerStatut(true)}
              disabled={enCours}
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