import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { isAxiosError } from "axios";
import { Link } from "react-router-dom";
import client from "../../api/client";
import { useVerrMaj } from "../../auth/useVerrMaj";
import AvertissementMajuscules from "../../components/AvertissementMajuscules";
import IndicateurForce from "../../components/IndicateurForce";
import BoutonRetour from "../../components/BoutonRetour";
import LogoSecondaire from "../../components/LogoSecondaire";
import PanneauInstitutionnel from "../../components/PanneauInstitutionnel";
import {
  IconeUtilisateur,
  IconeBadge,
  IconeTelephone,
  IconeCourrier,
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
import "./Inscription.css";
import "./Decor.css";

const FORMULAIRE_VIDE = {
  first_name: "",
  last_name: "",
  username: "",
  email: "",
  telephone: "",
  matricule: "",
  password: "",
  confirmation: "",
};

// Ordre d'affichage des champs (sert aussi à placer le focus sur la première erreur)
const ORDRE_CHAMPS = [
  "first_name",
  "last_name",
  "matricule",
  "telephone",
  "email",
  "username",
  "password",
  "confirmation",
];

// Sépare les erreurs renvoyées par le backend : celles qui concernent un champ
// (affichées sous le champ) et les erreurs générales (affichées en haut du formulaire)
function separerErreurs(donnees: unknown): {
  generales: string[];
  parChamp: Record<string, string[]>;
} {
  const generales: string[] = [];
  const parChamp: Record<string, string[]> = {};
  if (!donnees || typeof donnees !== "object") {
    return { generales: ["Une erreur est survenue."], parChamp };
  }
  for (const [champ, valeur] of Object.entries(donnees as Record<string, unknown>)) {
    const liste = (Array.isArray(valeur) ? valeur : [valeur]).map(String);
    if (ORDRE_CHAMPS.includes(champ)) {
      parChamp[champ] = liste;
    } else if (champ === "detail" || champ === "non_field_errors") {
      generales.push(...liste);
    } else {
      generales.push(...liste.map((message) => `${champ} : ${message}`));
    }
  }
  return { generales, parChamp };
}

function ErreurChamp({ nom, messages }: { nom: string; messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p className="ins-erreur-champ" id={`erreur-${nom}`} role="alert">
      {messages.join(" ")}
    </p>
  );
}

const MSG_ACCUEIL =
  "Bonjour ! Je suis Maki. Je vais vous accompagner pour remplir votre demande de compte.";
const MSG_MATRICULE = "Saisissez votre matricule tel qu'il vous a été attribué.";
const MSG_IDENTIFIANT = "Choisissez l'identifiant que vous utiliserez pour vous connecter.";
const MSG_MOT_DE_PASSE =
  "Choisissez un mot de passe d'au moins 8 caractères, pas uniquement des chiffres.";
const MSG_CONFIRMATION = "Saisissez à nouveau le même mot de passe.";
const MSG_ATTENTE = "Un instant, j'envoie votre demande.";
const MSG_SUCCES =
  "Votre demande est enregistrée. Le Directeur doit maintenant activer votre compte.";
const MSG_ECHEC =
  "La demande n'a pas abouti. Vérifiez les informations signalées et réessayez.";
const MSG_VERIFIER =
  "Quelques champs demandent votre attention. Vérifiez-les avant d'envoyer.";
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_TELEPHONE = /^\+?[\d\s().-]{6,20}$/;
const MSG_MOTS_DE_PASSE_DIFFERENTS =
  "Les deux mots de passe ne sont pas identiques. Vérifiez-les et réessayez.";

export default function Inscription() {
  const [champs, setChamps] = useState(FORMULAIRE_VIDE);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [erreursChamps, setErreursChamps] = useState<Record<string, string[]>>({});
  const [touches, setTouches] = useState<Record<string, boolean>>({});
  const { verrMaj, surClavier, masquer: masquerVerrMaj } = useVerrMaj();
  const [envoye, setEnvoye] = useState(false);
  const [enCours, setEnCours] = useState(false);

  // État purement visuel : affiche ou masque les deux mots de passe
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);

  // ---- Maki (purement visuel / audio : aucun impact sur l'inscription) ----
  const [messageMaki, setMessageMaki] = useState<MessageMaki>({
    cle: 1,
    texte: MSG_ACCUEIL,
    parler: true,
  });
  const [etatMaki, setEtatMaki] = useState<EtatMaki>("accueil");
  const compteurMaki = useRef(1);
  const champsAnnonces = useRef<Record<string, boolean>>({});
  const focusAutomatique = useRef(false);

  function direMaki(texte: string, etat: EtatMaki, parler = true, annoncer = true) {
    compteurMaki.current += 1;
    setEtatMaki(etat);
    setMessageMaki({ cle: compteurMaki.current, texte, parler, annoncer });
  }

  // Le texte s'affiche à chaque fois, mais n'est prononcé qu'à la première prise de focus
  function annoncerChamp(champ: string, texte: string) {
    if (focusAutomatique.current) {
      focusAutomatique.current = false;
      return;
    }
    const dejaAnnonce = champsAnnonces.current[champ] === true;
    champsAnnonces.current[champ] = true;
    direMaki(texte, "accueil", !dejaAnnonce);
  }

  function marquer(nom: string) {
    setTouches((anciens) => (anciens[nom] ? anciens : { ...anciens, [nom]: true }));
  }

  // Validation en direct (indicative : le backend reste seul juge)
  const erreursLocales: Record<string, string> = {};
  if (champs.email && !REGEX_EMAIL.test(champs.email)) {
    erreursLocales.email = "Adresse e-mail invalide (exemple : nom@domaine.mg).";
  }
  if (champs.telephone && !REGEX_TELEPHONE.test(champs.telephone)) {
    erreursLocales.telephone = "Numéro de téléphone invalide.";
  }
  if (champs.password && champs.password.length < 8) {
    erreursLocales.password = "Le mot de passe doit contenir au moins 8 caractères.";
  } else if (champs.password && /^\d+$/.test(champs.password)) {
    erreursLocales.password = "Le mot de passe ne peut pas contenir uniquement des chiffres.";
  }
  if (champs.confirmation && champs.confirmation !== champs.password) {
    erreursLocales.confirmation = "Les deux mots de passe ne sont pas identiques.";
  }

  // Erreur du serveur en priorité ; sinon erreur locale une fois le champ quitté
  function messagesChamp(nom: string): string[] | undefined {
    if (erreursChamps[nom]) return erreursChamps[nom];
    const afficher =
      touches[nom] ||
      (nom === "confirmation" && champs.confirmation.length >= champs.password.length);
    return afficher && erreursLocales[nom] ? [erreursLocales[nom]] : undefined;
  }

  function modifier(nom: keyof typeof FORMULAIRE_VIDE, valeur: string) {
    setChamps((anciens) => ({ ...anciens, [nom]: valeur }));
    // L'erreur d'un champ disparaît dès que l'utilisateur le corrige
    setErreursChamps((anciennes) => {
      if (!anciennes[nom]) return anciennes;
      const reste = { ...anciennes };
      delete reste[nom];
      return reste;
    });
  }

  // Après un envoi refusé, le focus va sur le premier champ en erreur
  useEffect(() => {
    const premier = ORDRE_CHAMPS.find((nom) => erreursChamps[nom]);
    if (premier) {
      focusAutomatique.current = true; // évite que Maki remplace son message d'erreur
      document.getElementById(premier)?.focus();
      focusAutomatique.current = false;
    }
  }, [erreursChamps]);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreurs([]);
    setErreursChamps({});

    if (champs.password !== champs.confirmation) {
      setErreursChamps({ confirmation: ["Les deux mots de passe ne sont pas identiques."] });
      direMaki(MSG_MOTS_DE_PASSE_DIFFERENTS, "neutre", true, false);
      return;
    }

    const nomsEnErreur = ORDRE_CHAMPS.filter((nom) => erreursLocales[nom]);
    if (nomsEnErreur.length > 0) {
      setTouches(Object.fromEntries(ORDRE_CHAMPS.map((nom) => [nom, true])));
      direMaki(MSG_VERIFIER, "neutre", true, false);
      focusAutomatique.current = true;
      document.getElementById(nomsEnErreur[0])?.focus();
      focusAutomatique.current = false;
      return;
    }

    setEnCours(true);
    direMaki(MSG_ATTENTE, "attentif");
    try {
      const { confirmation, ...donnees } = champs;
      void confirmation;
      await client.post("/auth/inscription/", donnees);
      direMaki(MSG_SUCCES, "content", true, false); // la page « Demande envoyée » (role="status") est déjà annoncée
      setEnvoye(true);
    } catch (e) {
      direMaki(MSG_ECHEC, "neutre", true, false); // les détails sont annoncés par les alertes d'erreur
      if (isAxiosError(e) && e.response) {
        const { generales, parChamp } = separerErreurs(e.response.data);
        setErreurs(generales);
        setErreursChamps(parChamp);
      } else {
        setErreurs(["Impossible de joindre le serveur. Réessayez plus tard."]);
      }
    } finally {
      setEnCours(false);
    }
  }

  const pied = (
    <footer className="cnx-pied">
      <IconeBouclier taille={14} />
      <span>Accès réservé aux utilisateurs autorisés · {NOM_INSTITUTION}</span>
    </footer>
  );

  if (envoye) {
    return (
      <div className="cnx-page">
        <PanneauInstitutionnel />
        <LogoSecondaire />

        <section className="cnx-cote-formulaire">
          <main className="cnx-principal">
            <div className="maki-colonne maki-colonne--large">
            <MakiAssistant message={messageMaki} etat={etatMaki} />
            <div className="cnx-carte">
              <BoutonRetour vers="/connexion" texte="Retour à la connexion" />
              <div className="ins-validation" aria-hidden="true">
                <svg viewBox="0 0 52 52">
                  <circle className="ins-validation-cercle" cx="26" cy="26" r="24" />
                  <path className="ins-validation-coche" d="M15 27l8 8 14-16" />
                </svg>
              </div>
              <h1 className="cnx-titre">Demande envoyée</h1>
              <div className="ins-succes" role="status">
                <p>
                  Votre demande de compte a bien été enregistrée. Vous pourrez vous
                  connecter dès que le Directeur aura activé votre compte.
                </p>
              </div>

              <dl className="cnx-recap">
                <div>
                  <dt>Nom</dt>
                  <dd>
                    {champs.first_name} {champs.last_name}
                  </dd>
                </div>
                <div>
                  <dt>Matricule</dt>
                  <dd>{champs.matricule}</dd>
                </div>
                <div>
                  <dt>Identifiant</dt>
                  <dd>{champs.username}</dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>{champs.email}</dd>
                </div>
              </dl>

              <ol className="cnx-etapes" aria-label="Suite de votre demande">
                <li className="fait">
                  <span className="cnx-etape-pastille" aria-hidden="true">✓</span>
                  <div>
                    <strong>Demande envoyée</strong>
                    <span>Enregistrée avec succès.</span>
                  </div>
                </li>
                <li className="en-cours">
                  <span className="cnx-etape-pastille" aria-hidden="true">2</span>
                  <div>
                    <strong>Validation par le Directeur</strong>
                    <span>Votre compte sera activé après vérification.</span>
                  </div>
                </li>
                <li>
                  <span className="cnx-etape-pastille" aria-hidden="true">3</span>
                  <div>
                    <strong>Connexion possible</strong>
                    <span>Vous pourrez vous connecter avec votre identifiant.</span>
                  </div>
                </li>
              </ol>

              <Link className="cnx-bouton cnx-bouton-lien" to="/connexion">
                Aller à la connexion
                <IconeFleche className="cnx-fleche" />
              </Link>
            </div>
            </div>
          </main>
          {pied}
        </section>
      </div>
    );
  }

  return (
    <div className="cnx-page">
      <PanneauInstitutionnel />
      <LogoSecondaire />

      <section className="cnx-cote-formulaire">
        <main className="cnx-principal">
          <div className="maki-colonne maki-colonne--large">
          <MakiAssistant message={messageMaki} etat={etatMaki} />
          <form className="cnx-carte ins-large" onSubmit={soumettre}>
            <BoutonRetour vers="/connexion" texte="Retour à la connexion" />

            <h1 className="cnx-titre">Demande de compte</h1>
            <p className="cnx-sous-titre">Réservé aux contrôleurs de la Direction</p>

            {erreurs.length > 0 && (
              <div className="cnx-erreur" role="alert">
                {erreurs.map((message) => (
                  <div key={message}>{message}</div>
                ))}
              </div>
            )}

            <div className="ins-grille">
              <div className="cnx-champ">
                <label htmlFor="first_name">Prénom</label>
                <div className="cnx-saisie">
                  <IconeUtilisateur className="cnx-icone" />
                  <input
                    id="first_name"
                    aria-invalid={messagesChamp("first_name") ? true : undefined}
                    aria-describedby={messagesChamp("first_name") ? "erreur-first_name" : undefined}
                    value={champs.first_name}
                    onChange={(e) => modifier("first_name", e.target.value)}
                    onBlur={() => marquer("first_name")}
                    required
                  />
                </div>
                <ErreurChamp nom="first_name" messages={messagesChamp("first_name")} />
              </div>
              <div className="cnx-champ">
                <label htmlFor="last_name">Nom</label>
                <div className="cnx-saisie">
                  <IconeUtilisateur className="cnx-icone" />
                  <input
                    id="last_name"
                    aria-invalid={messagesChamp("last_name") ? true : undefined}
                    aria-describedby={messagesChamp("last_name") ? "erreur-last_name" : undefined}
                    value={champs.last_name}
                    onChange={(e) => modifier("last_name", e.target.value)}
                    onBlur={() => marquer("last_name")}
                    required
                  />
                </div>
                <ErreurChamp nom="last_name" messages={messagesChamp("last_name")} />
              </div>
              <div className="cnx-champ">
                <label htmlFor="matricule">Matricule</label>
                <div className="cnx-saisie">
                  <IconeBadge className="cnx-icone" />
                  <input
                    id="matricule"
                    aria-invalid={messagesChamp("matricule") ? true : undefined}
                    aria-describedby={messagesChamp("matricule") ? "erreur-matricule" : undefined}
                    value={champs.matricule}
                    onChange={(e) => modifier("matricule", e.target.value)}
                    onBlur={() => marquer("matricule")}
                    onFocus={() => annoncerChamp("matricule", MSG_MATRICULE)}
                    required
                  />
                </div>
                <ErreurChamp nom="matricule" messages={messagesChamp("matricule")} />
              </div>
              <div className="cnx-champ">
                <label htmlFor="telephone">Téléphone (facultatif)</label>
                <div className="cnx-saisie">
                  <IconeTelephone className="cnx-icone" />
                  <input
                    id="telephone"
                    aria-invalid={messagesChamp("telephone") ? true : undefined}
                    aria-describedby={messagesChamp("telephone") ? "erreur-telephone" : undefined}
                    value={champs.telephone}
                    onChange={(e) => modifier("telephone", e.target.value)}
                    onBlur={() => marquer("telephone")}
                  />
                </div>
                <ErreurChamp nom="telephone" messages={messagesChamp("telephone")} />
              </div>
            </div>

            <div className="cnx-champ">
              <label htmlFor="email">Adresse e-mail</label>
              <div className="cnx-saisie">
                <IconeCourrier className="cnx-icone" />
                <input
                  id="email"
                  aria-invalid={messagesChamp("email") ? true : undefined}
                  aria-describedby={messagesChamp("email") ? "erreur-email" : undefined}
                  type="email"
                  value={champs.email}
                  onChange={(e) => modifier("email", e.target.value)}
                  onBlur={() => marquer("email")}
                  required
                />
              </div>
              <ErreurChamp nom="email" messages={messagesChamp("email")} />
            </div>

            <div className="cnx-champ">
              <label htmlFor="username">Identifiant de connexion</label>
              <div className="cnx-saisie">
                <IconeUtilisateur className="cnx-icone" />
                <input
                  id="username"
                  aria-invalid={messagesChamp("username") ? true : undefined}
                  aria-describedby={messagesChamp("username") ? "erreur-username" : undefined}
                  value={champs.username}
                  onChange={(e) => modifier("username", e.target.value)}
                  onBlur={() => marquer("username")}
                  onFocus={() => annoncerChamp("username", MSG_IDENTIFIANT)}
                  autoComplete="username"
                  required
                />
              </div>
              <ErreurChamp nom="username" messages={messagesChamp("username")} />
            </div>

            <div className="ins-grille">
              <div className="cnx-champ">
                <label htmlFor="password">Mot de passe</label>
                <div className="cnx-saisie cnx-avec-oeil">
                  <IconeCadenas className="cnx-icone" />
                  <input
                    id="password"
                    aria-invalid={messagesChamp("password") ? true : undefined}
                    aria-describedby={messagesChamp("password") ? "erreur-password" : undefined}
                    type={motDePasseVisible ? "text" : "password"}
                    value={champs.password}
                    onChange={(e) => modifier("password", e.target.value)}
                    onKeyDown={surClavier}
                    onKeyUp={surClavier}
                    onBlur={() => {
                      marquer("password");
                      masquerVerrMaj();
                    }}
                    onFocus={() => annoncerChamp("password", MSG_MOT_DE_PASSE)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="cnx-oeil"
                    onClick={() => setMotDePasseVisible((v) => !v)}
                    aria-label={
                      motDePasseVisible
                        ? "Masquer les mots de passe"
                        : "Afficher les mots de passe"
                    }
                    aria-pressed={motDePasseVisible}
                  >
                    <IconeOeil barre={motDePasseVisible} taille={20} />
                  </button>
                </div>
                <ErreurChamp nom="password" messages={messagesChamp("password")} />
                <AvertissementMajuscules visible={verrMaj} />
              </div>
              <div className="cnx-champ">
                <label htmlFor="confirmation">Confirmation</label>
                <div className="cnx-saisie cnx-avec-oeil">
                  <IconeCadenas className="cnx-icone" />
                  <input
                    id="confirmation"
                    aria-invalid={messagesChamp("confirmation") ? true : undefined}
                    aria-describedby={messagesChamp("confirmation") ? "erreur-confirmation" : undefined}
                    type={motDePasseVisible ? "text" : "password"}
                    value={champs.confirmation}
                    onChange={(e) => modifier("confirmation", e.target.value)}
                    onKeyDown={surClavier}
                    onKeyUp={surClavier}
                    onBlur={() => {
                      marquer("confirmation");
                      masquerVerrMaj();
                    }}
                    onFocus={() => annoncerChamp("confirmation", MSG_CONFIRMATION)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="cnx-oeil"
                    onClick={() => setMotDePasseVisible((v) => !v)}
                    aria-label={
                      motDePasseVisible
                        ? "Masquer les mots de passe"
                        : "Afficher les mots de passe"
                    }
                    aria-pressed={motDePasseVisible}
                  >
                    <IconeOeil barre={motDePasseVisible} taille={20} />
                  </button>
                </div>
                <ErreurChamp nom="confirmation" messages={messagesChamp("confirmation")} />
                <AvertissementMajuscules visible={verrMaj} />
                {champs.confirmation && champs.confirmation === champs.password && (
                  <p className="ins-ok-champ" role="status">Les mots de passe correspondent.</p>
                )}
              </div>
            </div>
            <p className="ins-aide">
              Au moins 8 caractères, pas uniquement des chiffres, pas un mot de passe trop courant.
            </p>
            <IndicateurForce motDePasse={champs.password} />

            <button className="cnx-bouton" type="submit" disabled={enCours}>
              {enCours ? (
                <>
                  <span className="cnx-spinner" aria-hidden="true" />
                  Envoi...
                </>
              ) : (
                <>
                  Envoyer la demande
                  <IconeFleche className="cnx-fleche" />
                </>
              )}
            </button>

            <p className="cnx-lien-bas">
              Déjà un compte? <Link to="/connexion">Se connecter</Link>
            </p>
          </form>
          </div>
        </main>
        {pied}
      </section>
    </div>
  );
}