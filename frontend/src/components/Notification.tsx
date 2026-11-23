import { useEffect } from "react";
import "./PanneauIle.css";

interface Props {
  type: "succes" | "erreur";
  texte: string;
  onFermer: () => void;
}

// Petit bandeau en verre qui disparaît tout seul
export default function Notification({ type, texte, onFermer }: Props) {
  useEffect(() => {
    const minuteur = window.setTimeout(onFermer, 4500);
    return () => window.clearTimeout(minuteur);
  }, [texte, onFermer]);

  return (
    <div className="notif-zone">
      <div className={`notif ${type}`} role={type === "erreur" ? "alert" : "status"}>
        <span className="notif-icone" aria-hidden="true">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {type === "succes" ? <path d="M5 12l5 5 9-10" /> : <path d="M12 6v8M12 18h.01" />}
          </svg>
        </span>
        <span>{texte}</span>
        <button type="button" onClick={onFermer} aria-label="Fermer la notification">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}