import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import api from "../../api/client";
import BoutonRetour from "../../components/BoutonRetour";
import PanneauVerre from "../../components/PanneauVerre";
import type { Utilisateur } from "../../types";
import { extraireListe, formaterDate } from "../outilsListe";
import { nomAffiche } from "../tableau-de-bord/outils";
import "../Liste.css";
import "../Sites/Sites.css";
import "./ListeControleurs.css";

interface Carte {
  numero: string;
  date_delivrance: string;
  date_expiration: string;
}

// Champs ajoutés par le serveur : `date_joined` (date de création du compte),
// `nombre_missions` (missions clôturées) et `carte_professionnelle`
type Controleur = Utilisateur & {
  date_joined?: string;
  nombre_missions?: number;
  carte_professionnelle?: Carte | null;
};

type EtatCarte = "valide" | "bientot" | "expiree" | "aucune";
type Mode = "voir" | "carte";

const JOURS_ALERTE = 30;

function etatDeLaCarte(carte?: Carte | null): { etat: EtatCarte; jours: number | null } {
  if (!carte) return { etat: "aucune", jours: null };
  const aujourdhui = new Date(new Date().toLocaleDateString("sv-SE"));
  const expiration = new Date(carte.date_expiration);
  const jours = Math.round((expiration.getTime() - aujourdhui.getTime()) / 86400000);
  if (jours < 0) return { etat: "expiree", jours };
  if (jours <= JOURS_ALERTE) return { etat: "bientot", jours };
  return { etat: "valide", jours };
}

const LIBELLES: Record<EtatCarte, string> = {
  valide: "Valide",
  bientot: "Expire bientôt",
  expiree: "Expirée",
  aucune: "Aucune carte",
};

function initialesDe(u: Utilisateur): string {
  const prenom = (u.first_name || u.username || "?").charAt(0);
  const nom = (u.last_name || "").charAt(0);
  return `${prenom}${nom}`.toUpperCase();
}

function Info({ label, deux, children }: { label: string; deux?: boolean; children: ReactNode }) {
  return (
    <div className="sit-info" style={deux ? { gridColumn: "span 2" } : undefined}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// ---------- Fiche d'un contrôleur (vue du panneau) ----------

interface DetailProps {
  controleur: Controleur;
  onFermer: () => void;
  onCarte: () => void;
}

function DetailControleur({ controleur: c, onFermer, onCarte }: DetailProps) {
  const carte = c.carte_professionnelle;
  const { etat, jours } = etatDeLaCarte(carte);

  return (
    <div>
      <dl className="sit-infos">
        <Info label="Matricule">{c.matricule || <span className="lst-absent">Non renseigné</span>}</Info>
        <Info label="Date d'entrée">
          {c.date_joined ? (
            <time dateTime={c.date_joined}>{formaterDate(c.date_joined)}</time>
          ) : (
            <span className="lst-absent">Non renseignée</span>
          )}
        </Info>
        <Info label="Missions effectuées">{c.nombre_missions ?? 0}</Info>
        <Info label="Téléphone">
          {c.telephone ? (
            <a className="ctl-lien" href={`tel:${c.telephone}`}>
              {c.telephone}
            </a>
          ) : (
            <span className="lst-absent">Non renseigné</span>
          )}
        </Info>
        <Info label="E-mail" deux>
          {c.email ? (
            <a className="ctl-lien" href={`mailto:${c.email}`}>
              {c.email}
            </a>
          ) : (
            <span className="lst-absent">Non renseigné</span>
          )}
        </Info>
      </dl>

      <section className="sit-section">
        <h3 className="sit-section-titre">
          Carte professionnelle
          <span className={`ctl-badge ctl-badge-${etat}`} style={{ marginLeft: 10 }}>
            {LIBELLES[etat]}
          </span>
        </h3>

        {carte ? (
          <dl className="sit-infos">
            <Info label="Numéro">{carte.numero}</Info>
            <Info label="Délivrée le">{formaterDate(carte.date_delivrance)}</Info>
            <Info label="Expire le">
              {formaterDate(carte.date_expiration)}
              {jours !== null && etat !== "valide" && (
                <small>{jours < 0 ? ` (depuis ${Math.abs(jours)} j)` : ` (dans ${jours} j)`}</small>
              )}
            </Info>
          </dl>
        ) : (
          <p className="sit-vide">Aucune carte enregistrée pour ce contrôleur.</p>
        )}
      </section>

      <div className="ile-actions">
        <button type="button" className="bouton secondaire" onClick={onFermer}>
          Fermer
        </button>
        <button type="button" className="bouton" onClick={onCarte}>
          {carte ? "Renouveler la carte" : "Ajouter la carte"}
        </button>
      </div>
    </div>
  );
}

// ---------- Formulaire d'ajout / de renouvellement (vue du panneau) ----------

interface FormulaireProps {
  controleur: Controleur;
  onAnnuler: () => void;
  onEnregistre: () => void;
}

function FormulaireCarte({ controleur, onAnnuler, onEnregistre }: FormulaireProps) {
  const existante = controleur.carte_professionnelle;
  const [numero, setNumero] = useState(existante?.numero ?? "");
  const [delivrance, setDelivrance] = useState(existante?.date_delivrance ?? "");
  const [expiration, setExpiration] = useState(existante?.date_expiration ?? "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const ordreInvalide = delivrance !== "" && expiration !== "" && expiration <= delivrance;
  const valide = numero.trim() !== "" && delivrance !== "" && expiration !== "" && !ordreInvalide;

  async function enregistrer(evenement: FormEvent) {
    evenement.preventDefault();
    if (!valide) return;
    setEnCours(true);
    setErreur("");
    try {
      await api.post(`/auth/controleurs/${controleur.id}/carte/`, {
        numero: numero.trim(),
        date_delivrance: delivrance,
        date_expiration: expiration,
      });
      onEnregistre();
    } catch (e) {
      const donnees = (e as { response?: { data?: Record<string, unknown> } }).response?.data;
      const premier = donnees ? Object.values(donnees)[0] : null;
      setErreur(
        Array.isArray(premier) ? String(premier[0]) : typeof premier === "string" ? premier : "L'enregistrement a échoué."
      );
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={enregistrer}>
      {erreur && (
        <div className="ile-erreur" role="alert">
          {erreur}
        </div>
      )}

      <div className="sit-grille">
        <div className="champ sit-champ-large">
          <label htmlFor="ctl-numero">Numéro de la carte</label>
          <input
            id="ctl-numero"
            type="text"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Ex. CP-2026-001"
            required
          />
        </div>

        <div className="champ">
          <label htmlFor="ctl-delivrance">Date de délivrance</label>
          <input
            id="ctl-delivrance"
            type="date"
            value={delivrance}
            onChange={(e) => setDelivrance(e.target.value)}
            required
          />
        </div>

        <div className="champ">
          <label htmlFor="ctl-expiration">Date d'expiration</label>
          <input
            id="ctl-expiration"
            type="date"
            value={expiration}
            onChange={(e) => setExpiration(e.target.value)}
            required
          />
        </div>
      </div>

      {ordreInvalide && <p className="sit-aide alerte">L'expiration doit être après la délivrance.</p>}

      <div className="ile-actions">
        <button type="button" className="bouton secondaire" onClick={onAnnuler} disabled={enCours}>
          Annuler
        </button>
        <button type="submit" className="bouton" disabled={!valide || enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

// ---------- La page ----------

export default function ListeControleurs() {
  const [controleurs, setControleurs] = useState<Controleur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");
  const [detailId, setDetailId] = useState<Controleur["id"] | null>(null);
  const [mode, setMode] = useState<Mode>("voir");
  const [message, setMessage] = useState("");

  const charger = useCallback(async () => {
    try {
      const reponse = await api.get("/auth/controleurs/");
      setControleurs(extraireListe<Controleur>(reponse.data));
      setErreur("");
    } catch {
      setErreur("Impossible de charger la liste des contrôleurs.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const ouvrirDetail = useCallback((id: Controleur["id"]) => {
    setMode("voir");
    setDetailId(id);
  }, []);
  const fermerDetail = useCallback(() => setDetailId(null), []);

  // Le contrôleur affiché suit la liste : après un renouvellement, la carte est à jour
  const ouvert = useMemo(() => controleurs.find((c) => c.id === detailId) ?? null, [controleurs, detailId]);

  const affiches = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return controleurs;
    return controleurs.filter((c) =>
      [
        nomAffiche(c),
        c.username,
        c.email,
        c.telephone,
        c.matricule ?? "",
        c.carte_professionnelle?.numero ?? "",
        formaterDate(c.date_joined),
      ]
        .join(" ")
        .toLowerCase()
        .includes(terme)
    );
  }, [controleurs, recherche]);

  const aSurveiller = controleurs.filter((c) => {
    const { etat } = etatDeLaCarte(c.carte_professionnelle);
    return etat === "bientot" || etat === "expiree";
  }).length;

  async function apresEnregistrement() {
    const nom = ouvert ? nomAffiche(ouvert) : "";
    await charger();
    setMode("voir");
    setMessage(`La carte professionnelle de ${nom} a été enregistrée.`);
    window.setTimeout(() => setMessage(""), 5000);
  }

  return (
    <div className="ctl-page">
      <BoutonRetour vers="/" texte="Retour au tableau de bord" />

      <div className="entete-page">
        <h1>Contrôleurs</h1>
      </div>

      {erreur && (
        <div className="ctl-ile-zone">
          <div className="ctl-ile" role="alert">
            <span className="ctl-ile-point" aria-hidden="true" />
            <span className="ctl-ile-texte">{erreur}</span>
          </div>
        </div>
      )}
      {message && (
        <div className="ctl-ile-zone">
          <div className="ctl-ile ctl-ile-succes" role="status">
            <span className="ctl-ile-point" aria-hidden="true" />
            <span className="ctl-ile-texte">{message}</span>
          </div>
        </div>
      )}
      {!chargement && aSurveiller > 0 && (
        <div className="ctl-ile-zone">
          <div className="ctl-ile" role="status">
            <span className="ctl-ile-point" aria-hidden="true" />
            <span className="ctl-ile-texte">
              <b>{aSurveiller}</b> carte{aSurveiller > 1 ? "s" : ""} professionnelle{aSurveiller > 1 ? "s" : ""} expirée
              {aSurveiller > 1 ? "s" : ""} ou proche de l'expiration (moins de {JOURS_ALERTE} jours)
            </span>
          </div>
        </div>
      )}

      {/* Pilule : recherche */}
      <div className="lst-ilot-zone">
        <div className="lst-ilot lst-ilot-recherche">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher par nom, matricule, carte, e-mail…"
            aria-label="Rechercher un contrôleur"
          />
          {!chargement && (
            <span className="lst-compte">
              {controleurs.length} contrôleur{controleurs.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {chargement ? (
        <div className="lst-chargement">
          <span className="lst-spinner" aria-hidden="true" />
          Chargement des contrôleurs…
        </div>
      ) : (
        <div className="lst-tableau-cadre">
          {affiches.length === 0 ? (
            <p className="lst-vide">
              {controleurs.length === 0
                ? "Aucun contrôleur pour l'instant. Les comptes apparaissent ici après l'acceptation d'une demande d'inscription."
                : `Aucun contrôleur ne correspond à « ${recherche} ».`}
            </p>
          ) : (
            <table className="lst-tableau">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Contrôleur</th>
                  <th className="centre">Missions effectuées</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {affiches.map((c) => {
                  const { etat } = etatDeLaCarte(c.carte_professionnelle);
                  const alerte = etat === "bientot" || etat === "expiree";
                  return (
                    <tr
                      key={c.id}
                      className="ctl-ligne"
                      tabIndex={0}
                      onClick={() => ouvrirDetail(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          ouvrirDetail(c.id);
                        }
                      }}
                      aria-label={`Voir les détails de ${nomAffiche(c)}`}
                    >
                      <td className="ctl-matricule">{c.matricule || <span className="lst-absent">—</span>}</td>
                      <td>
                        <div className="ctl-identite">
                          <span className="ctl-avatar" aria-hidden="true">
                            {initialesDe(c)}
                          </span>
                          <span className="lst-nom">
                            <strong>{nomAffiche(c)}</strong>
                            <span>@{c.username}</span>
                          </span>
                          {alerte && (
                            <span
                              className={`ctl-alerte ctl-alerte-${etat}`}
                              title={etat === "expiree" ? "Carte expirée" : "Carte bientôt expirée"}
                            />
                          )}
                        </div>
                      </td>
                      <td className="centre">
                        <span className={`lst-compteur ${c.nombre_missions ? "ok" : "zero"}`}>
                          {c.nombre_missions ?? 0}
                        </span>
                      </td>
                      <td className="ctl-fleche" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {ouvert && (
        <PanneauVerre
          titre={mode === "carte" ? "Carte professionnelle" : nomAffiche(ouvert)}
          sousTitre={mode === "carte" ? nomAffiche(ouvert) : `@${ouvert.username}`}
          onFermer={fermerDetail}
        >
          {(fermer) => (
            <div className="ile-vue" key={mode}>
              {mode === "voir" ? (
                <DetailControleur controleur={ouvert} onFermer={fermer} onCarte={() => setMode("carte")} />
              ) : (
                <FormulaireCarte
                  controleur={ouvert}
                  onAnnuler={() => setMode("voir")}
                  onEnregistre={apresEnregistrement}
                />
              )}
            </div>
          )}
        </PanneauVerre>
      )}
    </div>
  );
}