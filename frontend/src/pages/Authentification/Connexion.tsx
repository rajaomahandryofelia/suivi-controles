import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { isAxiosError } from "axios";
import { Link, useNavigate } from "react-router-dom";
import { CLE_DECONNEXION, useAuth } from "../../auth/AuthContext";
import { useVerrMaj } from "../../auth/useVerrMaj";
import AvertissementMajuscules from "../../components/AvertissementMajuscules";
import LogoSecondaire from "../../components/LogoSecondaire";
import PanneauInstitutionnel from "../../components/PanneauInstitutionnel";
import {
  IconeUtilisateur,
  IconeCadenas,
  IconeOeil,
  IconeBouclier,
  IconeFleche,
} from "../../components/IconesAuth";
import { NOM_INSTITUTION } from "../../components/identite";
import MakiAssistant from "../../maki/MakiAssistant";
import type { EtatMaki, MessageMaki } from "../../maki/types";
import "./Auth.css";
import "./Connexion.css";
import "./Decor.css";

const MSG_ACCUEIL =
  "Bonjour et bienvenue ! Je suis Maki, votre assistant virtuel. Comment allez-vous aujourd'hui ?";
const MSG_IDENTIFIANT = "Vous pouvez saisir votre identifiant ici.";
const MSG_MOT_DE_PASSE = "Saisissez votre mot de passe pour accéder à votre espace sécurisé.";
const MSG_ATTENTE = "Un instant, je vérifie votre demande.";
const MSG_SUCCES = "Connexion réussie ! Bienvenue dans votre espace de travail.";
const MSG_ECHEC = "La connexion n'a pas abouti. Vérifiez vos informations et réessayez.";
const MSG_DECONNEXION = "Vous avez bien été déconnecté. À bientôt !";

// Durée de l'écran de confirmation avant la redirection (le bouton « Accéder maintenant » la raccourcit)
const DELAI_REDIRECTION_MS = 1800;

// Durée de l'écran « Déconnexion réussie » avant d'afficher de nouveau le formulaire
const DELAI_DECONNEXION_MS = 3000;

// Vrai si l'utilisateur vient de se déconnecter (indicateur posé par seDeconnecter, valable 10 s)
function deconnexionRecente(): boolean {
  try {
    const brut = sessionStorage.getItem(CLE_DECONNEXION);
    return brut !== null && Date.now() - Number(brut) < 10_000;
  } catch {
    return false;
  }
}

export default function Connexion() {
  const { seConnecter } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [reussi, setReussi] = useState(false);
  const [deconnecte, setDeconnecte] = useState(deconnexionRecente);
  const boutonReconnexion = useRef<HTMLButtonElement>(null);
  const boutonAcces = useRef<HTMLButtonElement>(null);

  // État purement visuel (aucun impact sur l'authentification)
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);

  // Avertissement Verr. Maj. (purement visuel)
  const { verrMaj, surClavier, masquer: masquerVerrMaj } = useVerrMaj();

  // ---- Maki (purement visuel / audio : aucun impact sur l'authentification) ----
  const [messageMaki, setMessageMaki] = useState<MessageMaki>({
    cle: 1,
    texte: deconnecte ? MSG_DECONNEXION : MSG_ACCUEIL,
    parler: true,
    annoncer: deconnecte ? false : undefined, // l'écran de déconnexion (role="status") est déjà annoncé
  });
  const [etatMaki, setEtatMaki] = useState<EtatMaki>(deconnecte ? "content" : "accueil");
  const compteurMaki = useRef(1);
  const champsAnnonces = useRef({ username: false, password: false });

  function direMaki(
    texte: string,
    etat: EtatMaki,
    options: { parler?: boolean; final?: boolean; annoncer?: boolean } = {}
  ) {
    compteurMaki.current += 1;
    setEtatMaki(etat);
    setMessageMaki({
      cle: compteurMaki.current,
      texte,
      parler: options.parler ?? true,
      final: options.final,
      annoncer: options.annoncer,
    });
  }

  // Le texte s'affiche à chaque fois, mais n'est prononcé qu'à la première prise de focus
  function annoncerChamp(champ: "username" | "password", texte: string) {
    const dejaAnnonce = champsAnnonces.current[champ];
    champsAnnonces.current[champ] = true;
    direMaki(texte, "accueil", { parler: !dejaAnnonce });
  }

  // Après une connexion réussie : confirmation visible, puis redirection vers la même route qu'avant
  useEffect(() => {
    if (!reussi) return;
    boutonAcces.current?.focus();
    const minuteur = window.setTimeout(() => navigate("/"), DELAI_REDIRECTION_MS);
    return () => window.clearTimeout(minuteur);
  }, [reussi, navigate]);

  // L'indicateur de déconnexion ne sert qu'une fois : on l'efface dès l'arrivée sur la page
  useEffect(() => {
    try {
      sessionStorage.removeItem(CLE_DECONNEXION);
    } catch {
      /* ignoré */
    }
  }, []);

  // Écran « Déconnexion réussie » : disparaît seul, ou avec le bouton « Se reconnecter »
  useEffect(() => {
    if (!deconnecte) return;
    boutonReconnexion.current?.focus();
    const minuteur = window.setTimeout(() => setDeconnecte(false), DELAI_DECONNEXION_MS);
    return () => window.clearTimeout(minuteur);
  }, [deconnecte]);

  // Ton `saisirIdentifiants(login, motDePasse)`
  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur("");
    setEnCours(true);
    direMaki(MSG_ATTENTE, "attentif");
    try {
      await seConnecter(username, password);
      // Annonce déjà faite par l'écran de confirmation (role="status") : pas de double annonce
      direMaki(MSG_SUCCES, "content", { final: true, annoncer: false });
      setReussi(true); // afficherTableauDeBord() : navigate("/") est appelé par l'effet ci-dessus
    } catch (e) {
      // afficherErreurConnexion()
      // Message générique : aucun détail du serveur n'est prononcé. Non annoncé aux lecteurs
      // d'écran car l'encadré d'erreur (role="alert") ci-dessous l'est déjà.
      direMaki(MSG_ECHEC, "neutre", { annoncer: false });
      if (isAxiosError(e) && e.response?.status === 401) {
        setErreur("Identifiant ou mot de passe incorrect.");
      } else if (isAxiosError(e) && e.response?.status === 403) {
        setErreur(
          e.response.data?.detail ??
            "Votre compte est en attente de validation par le Directeur."
        );
      } else {
        setErreur("Impossible de joindre le serveur. Réessayez plus tard.");
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="cnx-page">
      <PanneauInstitutionnel />
      <LogoSecondaire />

      <section className="cnx-cote-formulaire">
        <main className="cnx-principal">
          <div className="maki-colonne">
          <MakiAssistant message={messageMaki} etat={etatMaki} />
          {reussi ? (
            <div className="cnx-carte cnx-succes" role="status">
              <div className="cnx-validation" aria-hidden="true">
                <svg viewBox="0 0 52 52">
                  <circle className="cnx-validation-cercle" cx="26" cy="26" r="24" />
                  <path className="cnx-validation-coche" d="M15 27l8 8 14-16" />
                </svg>
              </div>
              <h1 className="cnx-titre">Connexion réussie</h1>
              <p className="cnx-sous-titre">
                Bienvenue dans votre espace de travail. Redirection en cours…
              </p>
              <div className="cnx-progression" aria-hidden="true">
                <span style={{ animationDuration: `${DELAI_REDIRECTION_MS}ms` }} />
              </div>
              <button
                ref={boutonAcces}
                type="button"
                className="cnx-bouton"
                onClick={() => navigate("/")}
              >
                Accéder maintenant
                <IconeFleche className="cnx-fleche" />
              </button>
            </div>
          ) : deconnecte ? (
            <div className="cnx-carte cnx-succes" role="status">
              <div className="cnx-validation" aria-hidden="true">
                <svg viewBox="0 0 52 52">
                  <circle className="cnx-validation-cercle" cx="26" cy="26" r="24" />
                  <path className="cnx-validation-coche" d="M15 27l8 8 14-16" />
                </svg>
              </div>
              <h1 className="cnx-titre">Déconnexion réussie</h1>
              <p className="cnx-sous-titre">
                À bientôt ! Vous pouvez vous reconnecter à tout moment.
              </p>
              <div className="cnx-progression" aria-hidden="true">
                <span style={{ animationDuration: `${DELAI_DECONNEXION_MS}ms` }} />
              </div>
              <button
                ref={boutonReconnexion}
                type="button"
                className="cnx-bouton"
                onClick={() => setDeconnecte(false)}
              >
                Se reconnecter
                <IconeFleche className="cnx-fleche" />
              </button>
            </div>
          ) : (
          <form className="cnx-carte" onSubmit={soumettre}>
            <div className="cnx-badge">
              <IconeBouclier taille={24} />
            </div>
            <h1 className="cnx-titre">Connexion à votre espace</h1>
            <p className="cnx-sous-titre">
              Accédez à votre espace sécurisé en saisissant vos identifiants.
            </p>

            {erreur && (
              <div className="cnx-erreur" role="alert">
                {erreur}
              </div>
            )}

            <div className="cnx-champ">
              <label htmlFor="username">Identifiant</label>
              <div className="cnx-saisie">
                <IconeUtilisateur className="cnx-icone" />
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onFocus={() => annoncerChamp("username", MSG_IDENTIFIANT)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="cnx-champ">
              <label htmlFor="password">Mot de passe</label>
              <div className="cnx-saisie cnx-avec-oeil">
                <IconeCadenas className="cnx-icone" />
                <input
                  id="password"
                  type={motDePasseVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => annoncerChamp("password", MSG_MOT_DE_PASSE)}
                  onKeyDown={surClavier}
                  onKeyUp={surClavier}
                  onBlur={masquerVerrMaj}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="cnx-oeil"
                  onClick={() => setMotDePasseVisible((v) => !v)}
                  aria-label={
                    motDePasseVisible
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                  aria-pressed={motDePasseVisible}
                >
                  <IconeOeil barre={motDePasseVisible} taille={20} />
                </button>
              </div>
              <AvertissementMajuscules visible={verrMaj} />
            </div>

            <button className="cnx-bouton" type="submit" disabled={enCours}>
              {enCours ? (
                <>
                  <span className="cnx-spinner" aria-hidden="true" />
                  Connexion...
                </>
              ) : (
                <>
                  Se connecter
                  <IconeFleche className="cnx-fleche" />
                </>
              )}
            </button>

            <p className="cnx-lien-bas">
              Pas encore de compte? <Link to="/inscription">Demander un compte</Link>
            </p>
          </form>
          )}
          </div>
        </main>

        <footer className="cnx-pied">
          <IconeBouclier taille={14} />
          <span>Accès réservé aux utilisateurs autorisés · {NOM_INSTITUTION}</span>
        </footer>
      </section>
    </div>
  );
}