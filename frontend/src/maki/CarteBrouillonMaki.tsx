import { useState } from "react";
import type { ActionMaki } from "./useConversationMaki";

interface Props {
  action: ActionMaki;
  onIgnorer: () => void;
}

/** Texte à copier dans le presse-papiers, avec une solution de repli pour les navigateurs anciens. */
async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    try {
      const zone = document.createElement("textarea");
      zone.value = texte;
      zone.style.position = "fixed";
      zone.style.opacity = "0";
      document.body.appendChild(zone);
      zone.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(zone);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Brouillon de message au partenaire : à relire, copier ou ouvrir dans la messagerie. Rien n'est envoyé. */
export default function CarteBrouillonMaki({ action, onIgnorer }: Props) {
  const [copie, setCopie] = useState<"non" | "oui" | "echec">("non");
  const objet = action.objet ?? "";
  const corps = action.corps ?? "";
  const ignore = action.etat === "annulee";

  async function surCopier() {
    const ok = await copier(`Objet : ${objet}\n\n${corps}`);
    setCopie(ok ? "oui" : "echec");
    window.setTimeout(() => setCopie("non"), 2500);
  }

  const lien =
    `mailto:${encodeURIComponent(action.destinataire ?? "")}` +
    `?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;

  return (
    <div className={`mk-brouillon${ignore ? " ignore" : ""}`} role="group" aria-label={action.titre}>
      <strong className="mk-brouillon-titre">{action.titre}</strong>
      <ul className="mk-action-lignes">
        {action.lignes.map((ligne, i) => (
          <li key={i}>{ligne}</li>
        ))}
        {action.destinataire && <li>À : {action.destinataire}</li>}
      </ul>

      {!ignore && (
        <>
          <div className="mk-brouillon-texte">
            <span className="mk-brouillon-objet">{objet}</span>
            <p>{corps}</p>
          </div>

          {action.avertissement && <p className="mk-action-note">{action.avertissement}</p>}
          <p className="mk-action-note">Ce message n'a pas été envoyé.</p>

          <div className="mk-action-boutons">
            <button type="button" className="mk-action-annuler" onClick={onIgnorer}>
              Ignorer
            </button>
            <button type="button" className="mk-brouillon-copier" onClick={surCopier}>
              {copie === "oui" ? "Copié" : copie === "echec" ? "Copie impossible" : "Copier"}
            </button>
            {action.destinataire && (
              <a className="bouton" href={lien}>
                Ouvrir dans ma messagerie
              </a>
            )}
          </div>
        </>
      )}
      {ignore && <p className="mk-action-etat">Brouillon ignoré</p>}
    </div>
  );
}