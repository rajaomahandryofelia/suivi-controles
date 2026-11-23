import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import client from "../../api/client";
import { messageErreur } from "./apiOutils";
import EcheancesConvention from "./EcheancesConvention";
import { PERIODICITES, formaterAr, formaterDate } from "./typesConventions";
import type {
  Convention,
  OptionPartenaire,
  OptionSite,
  StatutConvention,
} from "./typesConventions";

interface Props {
  // null = création d'une nouvelle convention
  convention: Convention | null;
  partenaires: OptionPartenaire[];
  sites: OptionSite[];
  optionsIndisponibles: boolean;
  // Onglet affiché à l'ouverture : « echeances » ouvre directement les paiements
  ongletInitial?: "details" | "echeances";
  onFermer: () => void;
  onActualiser: () => Promise<void>;
  onCree: (id: number) => void;
}

interface Formulaire {
  partenaire: string;
  site: string;
  montant_periodique: string;
  periodicite: string;
  date_debut: string;
  date_fin: string;
  date_signature: string;
}

const VIDE: Formulaire = {
  partenaire: "",
  site: "",
  montant_periodique: "",
  periodicite: "MENSUELLE",
  date_debut: "",
  date_fin: "",
  date_signature: "",
};

function depuis(c: Convention): Formulaire {
  return {
    partenaire: String(c.partenaire),
    site: String(c.site),
    montant_periodique: String(Math.round(Number(c.montant_periodique))),
    periodicite: c.periodicite,
    date_debut: c.date_debut,
    date_fin: c.date_fin ?? "",
    date_signature: c.date_signature ?? "",
  };
}

// Ce que le Directeur peut faire selon l'état de la convention
const ACTIONS_STATUT: Record<
  StatutConvention,
  { statut: StatutConvention; texte: string; danger?: boolean }[]
> = {
  BROUILLON: [{ statut: "ENVOYEE", texte: "Marquer comme envoyée" }],
  ENVOYEE: [{ statut: "ACTIVE", texte: "Activer la convention" }],
  ACTIVE: [
    { statut: "SUSPENDUE", texte: "Suspendre" },
    { statut: "EXPIREE", texte: "Marquer comme expirée", danger: true },
  ],
  SUSPENDUE: [
    { statut: "ACTIVE", texte: "Réactiver" },
    { statut: "EXPIREE", texte: "Marquer comme expirée", danger: true },
  ],
  EXPIREE: [],
};

// Vérifications simples avant d'envoyer (le serveur vérifie aussi)
function verifier(f: Formulaire): string {
  if (!f.partenaire) return "Choisissez un partenaire.";
  if (!f.site) return "Choisissez un site.";
  if (!(Number(f.montant_periodique) > 0)) return "Indiquez un montant supérieur à 0.";
  if (!f.date_debut) return "Indiquez la date de début.";
  if (f.date_fin && f.date_fin < f.date_debut) {
    return "La date de fin doit être après la date de début.";
  }
  return "";
}

export default function PanneauConvention({
  convention,
  partenaires,
  sites,
  optionsIndisponibles,
  ongletInitial = "details",
  onFermer,
  onActualiser,
  onCree,
}: Props) {
  const [edition, setEdition] = useState(convention === null);
  const [form, setForm] = useState<Formulaire>(convention ? depuis(convention) : VIDE);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [onglet, setOnglet] = useState<"details" | "echeances">(ongletInitial);

  // Échap ferme le panneau
  useEffect(() => {
    function touche(evenement: KeyboardEvent) {
      if (evenement.key === "Escape") onFermer();
    }
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [onFermer]);

  // Seuls les sites du partenaire choisi sont proposés
  const sitesProposes = useMemo(() => {
    if (!form.partenaire) return [];
    const sansLien = sites.every((s) => s.partenaire === undefined);
    return sansLien ? sites : sites.filter((s) => s.partenaire === Number(form.partenaire));
  }, [sites, form.partenaire]);

  function changer(champ: keyof Formulaire, valeur: string) {
    setForm((precedent) => {
      const suivant = { ...precedent, [champ]: valeur };
      // Changer de partenaire vide le site, qui ne lui appartient plus
      if (champ === "partenaire") suivant.site = "";
      return suivant;
    });
  }

  async function enregistrer(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur("");
    setMessage("");
    const faute = verifier(form);
    if (faute) {
      setErreur(faute);
      return;
    }

    const corps = {
      partenaire: Number(form.partenaire),
      site: Number(form.site),
      montant_periodique: form.montant_periodique,
      periodicite: form.periodicite,
      date_debut: form.date_debut,
      date_fin: form.date_fin || null,
      date_signature: form.date_signature || null,
    };

    setEnCours(true);
    try {
      if (convention) {
        await client.patch(`/conventions/conventions/${convention.id}/`, corps);
        await onActualiser();
        setEdition(false);
        setMessage("Convention modifiée.");
      } else {
        const reponse = await client.post<Convention>("/conventions/conventions/", corps);
        await onActualiser();
        onCree(reponse.data.id);
      }
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  async function changerStatut(statut: StatutConvention) {
    if (!convention) return;
    setErreur("");
    setMessage("");
    setEnCours(true);
    try {
      await client.post(`/conventions/conventions/${convention.id}/changer-statut/`, { statut });
      await onActualiser();
      setMessage("Statut mis à jour.");
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  async function genererEcheances() {
    if (!convention) return;
    setErreur("");
    setMessage("");
    setEnCours(true);
    try {
      const reponse = await client.post<{ creees: number }>(
        `/conventions/conventions/${convention.id}/generer-echeances/`
      );
      await onActualiser();
      if (reponse.data.creees > 0) {
        setMessage(`${reponse.data.creees} échéance(s) créée(s).`);
        setOnglet("echeances");
      } else {
        setMessage("Toutes les échéances existent déjà.");
      }
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(false);
    }
  }

  async function supprimer() {
    if (!convention) return;
    setErreur("");
    setEnCours(true);
    try {
      await client.delete(`/conventions/conventions/${convention.id}/`);
      await onActualiser();
      onFermer();
    } catch (e) {
      setErreur(messageErreur(e));
      setConfirmerSuppression(false);
    } finally {
      setEnCours(false);
    }
  }

  const titre = !convention
    ? "Nouvelle convention"
    : edition
      ? `Modifier ${convention.reference}`
      : convention.reference;

  return (
    <div
      className="conv-voile"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        className={`conv-ilot${convention && !edition && onglet === "echeances" ? " large" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
      >
        {/* Croix de fermeture, comme sur les autres fiches */}
        <button type="button" className="conv-fermer" onClick={onFermer} aria-label="Fermer">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="conv-ilot-tete">
          <h2>{titre}</h2>
          {convention && !edition && (
            <span className={`conv-badge ${convention.statut.toLowerCase()}`}>
              {convention.statut_libelle}
            </span>
          )}
        </div>

        {convention && edition && (
          <button type="button" className="conv-retour" onClick={() => setEdition(false)}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Retour à la convention
          </button>
        )}

        {convention && !edition && (
          <div className="conv-onglets" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={onglet === "details"}
              className={onglet === "details" ? "actif" : ""}
              onClick={() => setOnglet("details")}
            >
              Détails
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={onglet === "echeances"}
              className={onglet === "echeances" ? "actif" : ""}
              onClick={() => setOnglet("echeances")}
            >
              Échéances et paiements
            </button>
          </div>
        )}

        {erreur && (
          <p className="conv-erreur" role="alert">
            {erreur}
          </p>
        )}
        {message && <p className="conv-succes">{message}</p>}

        {edition ? (
          <form className="conv-formulaire" onSubmit={enregistrer}>
            {optionsIndisponibles && (
              <p className="conv-erreur">
                Les partenaires et les sites n'ont pas pu être chargés. Rechargez la page.
              </p>
            )}

            <label>
              Partenaire
              <select
                value={form.partenaire}
                onChange={(e) => changer("partenaire", e.target.value)}
              >
                <option value="">Choisir…</option>
                {partenaires.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Site
              <select
                value={form.site}
                onChange={(e) => changer("site", e.target.value)}
                disabled={!form.partenaire}
              >
                <option value="">
                  {form.partenaire ? "Choisir…" : "Choisissez d'abord un partenaire"}
                </option>
                {sitesProposes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
              {form.partenaire && sitesProposes.length === 0 && (
                <small>
                  Ce partenaire n'a aucun site : rattachez-en un depuis la page Sites.
                </small>
              )}
            </label>

            <label>
              Montant à payer (Ar)
              <input
                type="number"
                min="0"
                step="1000"
                value={form.montant_periodique}
                onChange={(e) => changer("montant_periodique", e.target.value)}
                placeholder="1000000"
              />
            </label>

            <label>
              Périodicité
              <select
                value={form.periodicite}
                onChange={(e) => changer("periodicite", e.target.value)}
              >
                {PERIODICITES.map((p) => (
                  <option key={p.valeur} value={p.valeur}>
                    {p.texte}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Date de début
              <input
                type="date"
                value={form.date_debut}
                onChange={(e) => changer("date_debut", e.target.value)}
              />
            </label>

            <label>
              Date de fin
              <input
                type="date"
                value={form.date_fin}
                onChange={(e) => changer("date_fin", e.target.value)}
              />
              <small>Nécessaire pour générer les échéances.</small>
            </label>

            <label>
              Date de signature
              <input
                type="date"
                value={form.date_signature}
                onChange={(e) => changer("date_signature", e.target.value)}
              />
              <small>Nécessaire pour activer la convention.</small>
            </label>

            <div className="conv-boutons plein">
              <button type="submit" className="conv-bouton" disabled={enCours}>
                {enCours ? "Enregistrement…" : convention ? "Enregistrer" : "Créer la convention"}
              </button>
              <button
                type="button"
                className="conv-bouton secondaire"
                onClick={() => (convention ? setEdition(false) : onFermer())}
                disabled={enCours}
              >
                Annuler
              </button>
            </div>
          </form>
        ) : (
          convention &&
          (onglet === "echeances" ? (
            <EcheancesConvention convention={convention} onActualiser={onActualiser} />
          ) : (
            <>
              <dl className="conv-details">
                <div>
                  <dt>Partenaire</dt>
                  <dd>{convention.partenaire_nom}</dd>
                </div>
                <div>
                  <dt>Site</dt>
                  <dd>{convention.site_nom}</dd>
                </div>
                <div>
                  <dt>Montant</dt>
                  <dd>
                    {formaterAr(convention.montant_periodique)}{" "}
                    <small>{convention.periodicite_libelle.toLowerCase()}</small>
                  </dd>
                </div>
                <div>
                  <dt>Période</dt>
                  <dd>
                    {formaterDate(convention.date_debut)} → {formaterDate(convention.date_fin)}
                  </dd>
                </div>
                <div>
                  <dt>Signée le</dt>
                  <dd>{formaterDate(convention.date_signature)}</dd>
                </div>
                <div>
                  <dt>Total dû</dt>
                  <dd>{formaterAr(convention.total_du)}</dd>
                </div>
                <div>
                  <dt>Total payé</dt>
                  <dd>{formaterAr(convention.total_paye)}</dd>
                </div>
                <div>
                  <dt>Arriérés</dt>
                  <dd className={Number(convention.arrieres) > 0 ? "du" : ""}>
                    {Number(convention.arrieres) > 0 ? formaterAr(convention.arrieres) : "—"}
                  </dd>
                </div>
              </dl>

              <div className="conv-boutons">
                {ACTIONS_STATUT[convention.statut].map((a) => (
                  <button
                    key={a.statut}
                    type="button"
                    className={`conv-bouton${a.danger ? " danger" : ""}`}
                    onClick={() => changerStatut(a.statut)}
                    disabled={enCours}
                  >
                    {a.texte}
                  </button>
                ))}
                {convention.statut !== "EXPIREE" && (
                  <button
                    type="button"
                    className="conv-bouton secondaire"
                    onClick={genererEcheances}
                    disabled={enCours}
                  >
                    Générer les échéances
                  </button>
                )}
              </div>

              <div className="conv-boutons bas">
                <button
                  type="button"
                  className="conv-bouton secondaire"
                  onClick={() => {
                    setForm(depuis(convention));
                    setErreur("");
                    setMessage("");
                    setEdition(true);
                  }}
                  disabled={enCours}
                >
                  Modifier
                </button>

                {convention.statut === "BROUILLON" &&
                  (confirmerSuppression ? (
                    <>
                      <span className="conv-confirmation">
                        Supprimer définitivement {convention.reference} ?
                      </span>
                      <button
                        type="button"
                        className="conv-bouton danger"
                        onClick={supprimer}
                        disabled={enCours}
                      >
                        Oui, supprimer
                      </button>
                      <button
                        type="button"
                        className="conv-bouton secondaire"
                        onClick={() => setConfirmerSuppression(false)}
                        disabled={enCours}
                      >
                        Non
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="conv-bouton danger-leger"
                      onClick={() => setConfirmerSuppression(true)}
                      disabled={enCours}
                    >
                      Supprimer
                    </button>
                  ))}
              </div>
            </>
          ))
        )}
      </div>
    </div>
  );
}