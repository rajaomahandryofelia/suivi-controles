import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/client";
import BoutonRetour from "../../components/BoutonRetour";
import type { Utilisateur } from "../../types";
import { extraireListe, formaterDate } from "../outilsListe";
import { nomAffiche } from "../tableau-de-bord/outils";
import "../Liste.css";
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

function IconeFermer() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function initialesDe(u: Utilisateur): string {
  const prenom = (u.first_name || u.username || "?").charAt(0);
  const nom = (u.last_name || "").charAt(0);
  return `${prenom}${nom}`.toUpperCase();
}

// ---------- Formulaire d'ajout / de renouvellement ----------

interface FormulaireProps {
  controleur: Controleur;
  onFermer: () => void;
  onEnregistre: () => void;
}

function FormulaireCarte({ controleur, onFermer, onEnregistre }: FormulaireProps) {
  const existante = controleur.carte_professionnelle;
  const [numero, setNumero] = useState(existante?.numero ?? "");
  const [delivrance, setDelivrance] = useState(existante?.date_delivrance ?? "");
  const [expiration, setExpiration] = useState(existante?.date_expiration ?? "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const valide = numero.trim() !== "" && delivrance !== "" && expiration !== "" && expiration > delivrance;

  async function enregistrer() {
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
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="ctl-fond" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="ctl-fenetre" role="dialog" aria-modal="true" aria-labelledby="ctl-titre">
        <h2 id="ctl-titre">Carte professionnelle</h2>
        <p className="ctl-fenetre-sous">{nomAffiche(controleur)}</p>

        <label className="ctl-champ">
          <span>Numéro de la carte</span>
          <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex. CP-2026-001" />
        </label>
        <div className="ctl-champs-2">
          <label className="ctl-champ">
            <span>Date de délivrance</span>
            <input type="date" value={delivrance} onChange={(e) => setDelivrance(e.target.value)} />
          </label>
          <label className="ctl-champ">
            <span>Date d'expiration</span>
            <input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} />
          </label>
        </div>

        {delivrance && expiration && expiration <= delivrance && (
          <p className="ctl-erreur">L'expiration doit être après la délivrance.</p>
        )}
        {erreur && <p className="ctl-erreur" role="alert">{erreur}</p>}

        <div className="ctl-actions">
          <button type="button" className="bouton secondaire" onClick={onFermer} disabled={enCours}>
            Annuler
          </button>
          <button type="button" className="bouton" onClick={enregistrer} disabled={!valide || enCours}>
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Détails (carré transparent) ----------

interface DetailProps {
  controleur: Controleur;
  onFermer: () => void;
  onCarte: () => void;
}

function Absent() {
  return <span className="lst-absent">—</span>;
}

function DetailControleur({ controleur: c, onFermer, onCarte }: DetailProps) {
  const carte = c.carte_professionnelle;
  const { etat, jours } = etatDeLaCarte(carte);

  useEffect(() => {
    const touche = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [onFermer]);

  return (
    <div className="ctl-fond ctl-fond-clair" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="ctl-detail" role="dialog" aria-modal="true" aria-labelledby="ctl-detail-titre">
        <button type="button" className="ctl-fermer" onClick={onFermer} aria-label="Fermer">
          <IconeFermer />
        </button>

        <div className="ctl-detail-tete">
          <span className="ctl-avatar ctl-avatar-grand" aria-hidden="true">
            {initialesDe(c)}
          </span>
          <div>
            <h2 id="ctl-detail-titre">{nomAffiche(c)}</h2>
            <p>@{c.username}</p>
          </div>
        </div>

        <dl className="ctl-infos">
          <div>
            <dt>E-mail</dt>
            <dd>
              {c.email ? (
                <a className="ctl-lien" href={`mailto:${c.email}`}>
                  {c.email}
                </a>
              ) : (
                <Absent />
              )}
            </dd>
          </div>
          <div>
            <dt>Téléphone</dt>
            <dd>
              {c.telephone ? (
                <a className="ctl-lien" href={`tel:${c.telephone}`}>
                  {c.telephone}
                </a>
              ) : (
                <Absent />
              )}
            </dd>
          </div>
          <div>
            <dt>Date d'entrée</dt>
            <dd>
              {c.date_joined ? <time dateTime={c.date_joined}>{formaterDate(c.date_joined)}</time> : <Absent />}
            </dd>
          </div>
          <div>
            <dt>Missions effectuées</dt>
            <dd>{c.nombre_missions ?? 0}</dd>
          </div>
        </dl>

        <section className="ctl-detail-carte">
          <div className="ctl-detail-carte-tete">
            <h3>Carte professionnelle</h3>
            <span className={`ctl-badge ctl-badge-${etat}`}>{LIBELLES[etat]}</span>
          </div>
          {carte ? (
            <dl className="ctl-infos ctl-infos-carte">
              <div>
                <dt>Numéro</dt>
                <dd>{carte.numero}</dd>
              </div>
              <div>
                <dt>Délivrée le</dt>
                <dd>{formaterDate(carte.date_delivrance)}</dd>
              </div>
              <div>
                <dt>Expire le</dt>
                <dd>
                  {formaterDate(carte.date_expiration)}
                  {jours !== null && etat !== "valide" && (
                    <small>{jours < 0 ? ` (depuis ${Math.abs(jours)} j)` : ` (dans ${jours} j)`}</small>
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="ctl-detail-vide">Aucune carte enregistrée pour ce contrôleur.</p>
          )}
          <button type="button" className="bouton" onClick={onCarte}>
            {carte ? "Renouveler la carte" : "Ajouter la carte"}
          </button>
        </section>
      </div>
    </div>
  );
}

// ---------- La page ----------

export default function ListeControleurs() {
  const [controleurs, setControleurs] = useState<Controleur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");
  const [detailId, setDetailId] = useState<Controleur["id"] | null>(null);
  const [edition, setEdition] = useState<Controleur | null>(null);
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

  const fermerDetail = useCallback(() => setDetailId(null), []);
  // Le détail suit la liste : après un renouvellement, il affiche la carte à jour
  const detail = useMemo(() => controleurs.find((c) => c.id === detailId) ?? null, [controleurs, detailId]);

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
    const nom = edition ? nomAffiche(edition) : "";
    setEdition(null);
    await charger();
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
        <div className="lst-message erreur" role="alert">
          {erreur}
        </div>
      )}
      {message && (
        <div className="lst-message succes" role="status">
          {message}
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
                  <th aria-label="Voir les détails" />
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
                      onClick={() => setDetailId(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetailId(c.id);
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

      {detail && <DetailControleur controleur={detail} onFermer={fermerDetail} onCarte={() => setEdition(detail)} />}

      {edition && (
        <FormulaireCarte
          key={edition.id}
          controleur={edition}
          onFermer={() => setEdition(null)}
          onEnregistre={apresEnregistrement}
        />
      )}
    </div>
  );
}