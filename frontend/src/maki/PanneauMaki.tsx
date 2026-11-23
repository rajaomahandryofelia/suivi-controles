import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import CarteActionMaki from "./CarteActionMaki";
import CarteBriefMaki from "./CarteBriefMaki";
import CarteBrouillonMaki from "./CarteBrouillonMaki";
import MakiMascotte from "./MakiMascotte";
import { useBriefMaki } from "./useBriefMaki";
import { useConversationMaki } from "./useConversationMaki";
import { useVoixMaki } from "./useVoixMaki";
import type { EtatMaki } from "./types";
import "./Maki.css";
import "./PanneauMaki.css";

const SUGGESTIONS_DIRECTEUR = [
  "Résumé des missions",
  "Quelles missions sont en retard ?",
  "Missions prévues cette semaine",
  "Écris au partenaire de la non-conformité la plus urgente",
];

const SUGGESTIONS_CONTROLEUR = [
  "Mes missions d'aujourd'hui",
  "Mes prochaines missions",
  "Ai-je des missions en retard ?",
  "Résumé de mes missions",
];

function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Maki, l'assistant virtuel : bouton flottant + panneau de discussion, sur toutes les pages. */
export default function PanneauMaki() {
  const { utilisateur, estDirecteur } = useAuth();

  const [ouvert, setOuvert] = useState(false);
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [saisie, setSaisie] = useState("");

  const voix = useVoixMaki();
  const { parler, arreter } = voix;
  const surReponse = useCallback((texte: string) => parler(texte), [parler]);
  const { messages, enCours, envoyer, confirmer, annuler, effacer } =
    useConversationMaki(surReponse);

  const { brief, chargement: briefEnCours, erreur: briefEnErreur, charger: chargerBrief, masquer: masquerBrief } =
    useBriefMaki(ouvert, surReponse);

  const listeRef = useRef<HTMLDivElement>(null);
  const champRef = useRef<HTMLTextAreaElement>(null);

  // Maki est-il relié à son moteur d'IA ? (vérifié à la première ouverture)
  useEffect(() => {
    if (!ouvert || disponible !== null) return;
    api
      .get<{ disponible: boolean }>("/suivi/assistant/statut/")
      .then((r) => setDisponible(r.data.disponible))
      .catch(() => setDisponible(true));
  }, [ouvert, disponible]);

  const fermer = useCallback(() => {
    arreter();
    setOuvert(false);
  }, [arreter]);

  // Échap ferme le panneau
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [ouvert, fermer]);

  // Le curseur est dans le champ à l'ouverture ; la liste descend à chaque message
  useEffect(() => {
    if (ouvert) champRef.current?.focus();
  }, [ouvert]);

  useEffect(() => {
    const liste = listeRef.current;
    if (liste) liste.scrollTop = liste.scrollHeight;
  }, [messages, enCours, ouvert, brief]);

  function soumettre(e?: FormEvent) {
    e?.preventDefault();
    if (!saisie.trim() || enCours || disponible === false) return;
    envoyer(saisie);
    setSaisie("");
  }

  function surTouche(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Entrée envoie, Maj+Entrée passe à la ligne
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      soumettre();
    }
  }

  function nouvelleConversation() {
    arreter();
    effacer();
    champRef.current?.focus();
  }

  const prenom = utilisateur?.first_name || "";
  const suggestions = estDirecteur ? SUGGESTIONS_DIRECTEUR : SUGGESTIONS_CONTROLEUR;
  const etat: EtatMaki = enCours ? "attentif" : messages.length === 0 ? "accueil" : "neutre";

  if (!ouvert) {
    return (
      <button
        type="button"
        className="mk-lanceur"
        onClick={() => setOuvert(true)}
        aria-label="Ouvrir Maki, l'assistant virtuel"
      >
        <span className="mk-lanceur-image">
          <MakiMascotte etat="neutre" parle={false} />
        </span>
        <span className="mk-lanceur-texte">Maki</span>
      </button>
    );
  }

  return (
    <section className="mk-panneau" role="dialog" aria-label="Maki, assistant virtuel">
      <header className="mk-entete">
        <span className="mk-mascotte">
          <MakiMascotte etat={etat} parle={voix.parle} />
        </span>
        <div className="mk-titre">
          <strong>Maki</strong>
          <span>Assistant virtuel</span>
        </div>

        <div className="mk-outils">
          {voix.supporte && (
            <button
              type="button"
              className={`mk-icone${voix.active ? " actif" : ""}`}
              onClick={voix.active ? voix.desactiver : voix.activer}
              aria-pressed={voix.active}
              aria-label={voix.active ? "Couper la voix de Maki" : "Activer la voix de Maki"}
              title={voix.active ? "Voix activée" : "Voix coupée"}
            >
              <Icone>
                <path d="M11 5 6 9H3v6h3l5 4z" />
                {voix.active ? (
                  <>
                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                  </>
                ) : (
                  <>
                    <path d="m16 9 5 6" />
                    <path d="m21 9-5 6" />
                  </>
                )}
              </Icone>
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              className="mk-icone"
              onClick={nouvelleConversation}
              aria-label="Nouvelle conversation"
              title="Nouvelle conversation"
            >
              <Icone>
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </Icone>
            </button>
          )}
          <button type="button" className="mk-fermer" onClick={fermer}>
            Fermer
          </button>
        </div>
      </header>

      <div className="mk-liste" ref={listeRef} role="log" aria-live="polite" aria-label="Discussion avec Maki">
        {brief && <CarteBriefMaki brief={brief} onMasquer={masquerBrief} onNaviguer={fermer} />}

        {messages.length === 0 && (
          <div className="mk-accueil">
            <p>
              Bonjour{prenom ? ` ${prenom}` : ""}, je suis Maki. Posez-moi une question sur{" "}
              {estDirecteur ? "les missions de contrôle" : "vos missions"}.
            </p>
            <div className="mk-suggestions">
              {!brief && (
                <button
                  type="button"
                  className="mk-suggestion mk-suggestion-brief"
                  disabled={briefEnCours}
                  onClick={() => chargerBrief(false)}
                >
                  {briefEnCours ? "Préparation du brief…" : "Mon brief du jour"}
                </button>
              )}
              {briefEnErreur && !brief && (
                <p className="mk-note-brief" role="alert">
                  Le brief n'a pas pu être chargé. Vérifiez que le serveur est démarré.
                </p>
              )}
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="mk-suggestion"
                  disabled={disponible === false}
                  onClick={() => envoyer(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <Fragment key={m.id}>
            <div className={`mk-message ${m.role}${m.erreur ? " erreur" : ""}`}>{m.texte}</div>
            {m.actions?.map((a) =>
              a.type === "message_partenaire" ? (
                <CarteBrouillonMaki key={a.cle} action={a} onIgnorer={() => annuler(m.id, a.cle)} />
              ) : (
                <CarteActionMaki
                  key={a.cle}
                  action={a}
                  onConfirmer={() => confirmer(m.id, a.cle)}
                  onAnnuler={() => annuler(m.id, a.cle)}
                />
              )
            )}
          </Fragment>
        ))}

        {enCours && (
          <div className="mk-message assistant mk-reflexion" aria-label="Maki réfléchit">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      {disponible === false && (
        <p className="mk-note">
          Maki n'est pas encore relié à son moteur d'IA : la clé GEMINI_API_KEY manque dans le
          fichier .env du serveur.
        </p>
      )}

      <form className="mk-saisie" onSubmit={soumettre}>
        <textarea
          ref={champRef}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={surTouche}
          rows={1}
          maxLength={1000}
          placeholder="Écrivez votre question…"
          aria-label="Votre question pour Maki"
          disabled={disponible === false}
        />
        <button
          type="submit"
          className="bouton"
          disabled={!saisie.trim() || enCours || disponible === false}
        >
          Envoyer
        </button>
      </form>
    </section>
  );
}