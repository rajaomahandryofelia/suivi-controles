import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { API_URL } from "../../api/client";
import { NOM_INSTITUTION } from "../../components/identite";
import "./Verifier.css";

// Heures de la mission, présentes seulement après la clôture. Jamais de position GPS.
type Execution = {
  depart: string | null;
  arrivee: string | null;
};

type Resultat = {
  authentique: true;
  numero: string;
  type: string;
  controleur: string;
  date_tournee: string;
  // « tournée » ou « mission » (ordre de mission d'une mission isolée)
  portee?: "tournée" | "mission";
  delivre_le: string;
  execution?: Execution | null;
};

type Etat =
  | { statut: "chargement" }
  | { statut: "authentique"; document: Resultat }
  | { statut: "inconnu" }
  | { statut: "limite" }
  | { statut: "erreur" }
  | { statut: "vide" };

// Les heures s'affichent toujours en heure de Madagascar, d'où que la page soit ouverte
const FUSEAU = "Indian/Antananarivo";

function formaterDate(valeur: string): string {
  const jour = valeur.slice(0, 10);
  const date = new Date(`${jour}T00:00:00`);
  if (Number.isNaN(date.getTime())) return valeur;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function dateMada(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: FUSEAU,
  });
}

function heureMada(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSEAU,
  });
}

const IconeValide = () => (
  <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M7 12.5l3.2 3.2L17 8.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconeInvalide = () => (
  <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const IconeAttention = () => (
  <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" focusable="false">
    <path d="M12 3l10 18H2L12 3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M12 10v5M12 18v.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export default function Verifier() {
  const [params] = useSearchParams();
  const numero = (params.get("numero") ?? "").trim();
  const [etat, setEtat] = useState<Etat>(
    numero ? { statut: "chargement" } : { statut: "vide" }
  );

  useEffect(() => {
    if (!numero) {
      setEtat({ statut: "vide" });
      return;
    }
    const annulation = new AbortController();
    setEtat({ statut: "chargement" });

    // fetch (et non le client axios) : page publique, sans jeton ni redirection vers /connexion
    fetch(
      `${API_URL}/controles/tournees/verifier/?numero=${encodeURIComponent(numero)}`,
      { signal: annulation.signal, headers: { Accept: "application/json" } }
    )
      .then(async (reponse) => {
        if (reponse.status === 404) return setEtat({ statut: "inconnu" });
        if (reponse.status === 429) return setEtat({ statut: "limite" });
        if (!reponse.ok) return setEtat({ statut: "erreur" });
        const donnees = await reponse.json();
        if (donnees?.authentique) {
          setEtat({ statut: "authentique", document: donnees });
        } else {
          setEtat({ statut: "inconnu" });
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setEtat({ statut: "erreur" });
      });

    return () => annulation.abort();
  }, [numero]);

  return (
    <div className="ver-page">
      <header className="ver-entete">
        <p className="ver-republique">République de Madagascar</p>
        <p className="ver-devise">Fitiavana - Tanindrazana - Fandrosoana</p>
        <h1 className="ver-institution">{NOM_INSTITUTION}</h1>
        <p className="ver-sous-titre">Vérification d'un document officiel</p>
      </header>

      <main className="ver-contenu">
        {etat.statut === "chargement" && (
          <div className="ver-carte" role="status" aria-live="polite">
            <div className="ver-spinner" aria-hidden="true" />
            <p>Vérification en cours…</p>
          </div>
        )}

        {etat.statut === "vide" && (
          <div className="ver-carte" role="status">
            <p>
              Aucun numéro de document à vérifier. Scannez le QR code figurant
              sur l'ordre de mission ou l'ordre de route.
            </p>
          </div>
        )}

        {etat.statut === "authentique" && (
          <section className="ver-carte ver-carte--ok" role="status" aria-live="polite">
            <div className="ver-bandeau ver-bandeau--ok">
              <IconeValide />
              <h2>Document authentique</h2>
            </div>
            <dl className="ver-details">
              <div>
                <dt>Type de document</dt>
                <dd>{etat.document.type}</dd>
              </div>
              <div>
                <dt>Numéro</dt>
                <dd>{etat.document.numero}</dd>
              </div>
              <div>
                <dt>Contrôleur</dt>
                <dd>{etat.document.controleur}</dd>
              </div>
              <div>
                <dt>
                  {etat.document.portee === "mission"
                    ? "Date de la mission"
                    : "Date de la tournée"}
                </dt>
                <dd>{formaterDate(etat.document.date_tournee)}</dd>
              </div>
              <div>
                <dt>Délivré le</dt>
                <dd>{formaterDate(etat.document.delivre_le)}</dd>
              </div>

              {/* Seulement après la clôture : la date d'exécution et deux heures, rien d'autre */}
              {etat.document.execution && (
                <>
                  <div>
                    <dt>
                      {etat.document.portee === "mission"
                        ? "Mission exécutée le"
                        : "Tournée exécutée le"}
                    </dt>
                    <dd>
                      {etat.document.execution.depart
                        ? dateMada(etat.document.execution.depart)
                        : etat.document.execution.arrivee
                          ? dateMada(etat.document.execution.arrivee)
                          : formaterDate(etat.document.date_tournee)}
                    </dd>
                  </div>
                  {etat.document.execution.depart && (
                    <div>
                      <dt>Heure de départ</dt>
                      <dd>{heureMada(etat.document.execution.depart)}</dd>
                    </div>
                  )}
                  {etat.document.execution.arrivee && (
                    <div>
                      <dt>Heure d'arrivée sur site</dt>
                      <dd>{heureMada(etat.document.execution.arrivee)}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </section>
        )}

        {etat.statut === "inconnu" && (
          <section className="ver-carte ver-carte--ko" role="alert">
            <div className="ver-bandeau ver-bandeau--ko">
              <IconeInvalide />
              <h2>Document non reconnu</h2>
            </div>
            <p className="ver-explication">
              Aucun document officiel ne correspond au numéro{" "}
              <strong>{numero}</strong>. Le numéro est peut-être erroné, ou le
              document a été falsifié. Contactez l'ORTM pour confirmer.
            </p>
          </section>
        )}

        {etat.statut === "limite" && (
          <section className="ver-carte ver-carte--alerte" role="alert">
            <div className="ver-bandeau ver-bandeau--alerte">
              <IconeAttention />
              <h2>Trop de vérifications</h2>
            </div>
            <p className="ver-explication">
              Veuillez patienter une minute avant de réessayer.
            </p>
          </section>
        )}

        {etat.statut === "erreur" && (
          <section className="ver-carte ver-carte--alerte" role="alert">
            <div className="ver-bandeau ver-bandeau--alerte">
              <IconeAttention />
              <h2>Vérification impossible</h2>
            </div>
            <p className="ver-explication">
              Le service est injoignable pour le moment. Vérifiez votre connexion
              puis réessayez.
            </p>
            <button
              type="button"
              className="ver-bouton"
              onClick={() => window.location.reload()}
            >
              Réessayer
            </button>
          </section>
        )}
      </main>

      <footer className="ver-pied">
        Cette page confirme l'existence du document dans le registre de l'ORTM et, une
        fois la mission clôturée, ses heures de départ et d'arrivée (heure de Madagascar).
      </footer>
    </div>
  );
}