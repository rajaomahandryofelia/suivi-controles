import { useEffect } from "react";
import BulleMaki from "./BulleMaki";
import MakiMascotte from "./MakiMascotte";
import { useVoixMaki } from "./useVoixMaki";
import type { EtatMaki, MessageMaki } from "./types";
import "./Maki.css";

interface Props {
  message: MessageMaki;
  etat: EtatMaki;
  imageSrc?: string;
}

function IconeHautParleur({ coupe }: { coupe: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {coupe ? (
        <>
          <path d="m16 9 5 6" />
          <path d="m21 9-5 6" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}

function IconeRepeter() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export default function MakiAssistant({ message, etat, imageSrc }: Props) {
  const voix = useVoixMaki();
  const { parler } = voix;

  // Chaque nouveau message est affiché (par la bulle) et, si demandé, prononcé
  useEffect(() => {
    if (message.parler) parler(message.texte, { final: message.final });
  }, [message.cle, message.parler, message.texte, message.final, parler]);

  function basculerVoix() {
    if (voix.active) {
      voix.desactiver();
    } else {
      voix.activer();
      voix.parler(message.texte); // lecture déclenchée par un clic : autorisée par le navigateur
    }
  }

  return (
    <section className="maki-zone" aria-label="Assistant virtuel Maki">
      <MakiMascotte etat={etat} parle={voix.parle} imageSrc={imageSrc} />

      <div className="maki-dialogue">
        <BulleMaki texte={message.texte} annoncer={message.annoncer !== false} />

        <div className="maki-controles">
          {voix.supporte && (
            <>
              <button
                type="button"
                className={`maki-btn${voix.active ? " maki-btn--actif" : ""}`}
                onClick={basculerVoix}
                aria-pressed={voix.active}
                aria-label={voix.active ? "Couper la voix de Maki" : "Activer la voix de Maki"}
              >
                <IconeHautParleur coupe={!voix.active} />
                <span>{voix.active ? "Voix activée" : "Voix coupée"}</span>
              </button>

              {voix.active && (
                <button
                  type="button"
                  className="maki-btn"
                  onClick={() => voix.parler(message.texte)}
                  aria-label="Réécouter le message de Maki"
                >
                  <IconeRepeter />
                  <span>Réécouter</span>
                </button>
              )}

              {voix.parle && (
                <span className="maki-onde" aria-hidden="true" title="Maki parle">
                  <i /><i /><i />
                </span>
              )}
            </>
          )}
        </div>

        {voix.supporte && voix.active && !voix.voixFrancaise && (
          <p className="maki-note">
            Aucune voix française n'a été détectée sur cet appareil : les messages restent affichés.
          </p>
        )}
        {voix.erreurAudio && (
          <p className="maki-note">
            La lecture audio n'a pas pu démarrer. Utilisez « Réécouter » ou lisez le message ci-dessus.
          </p>
        )}
      </div>
    </section>
  );
}