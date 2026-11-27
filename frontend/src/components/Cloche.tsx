import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import "./Cloche.css";

interface Notif {
  id: number;
  message: string;
  date_envoi: string;
  est_lue: boolean;
}

interface Reponse {
  non_lues: number;
  notifications: Notif[];
}

interface Position {
  left: number;
  largeur: number;
  haut?: number; // le panneau part du haut de la cloche
  bas?: number; // le panneau part du bas de la cloche
  origine: string;
}

// « il y a 5 minutes », « hier », …
function ilYA(iso: string) {
  const secondes = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(secondes);
  const f = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (abs < 60) return "à l'instant";
  if (abs < 3600) return f.format(Math.round(secondes / 60), "minute");
  if (abs < 86400) return f.format(Math.round(secondes / 3600), "hour");
  if (abs < 7 * 86400) return f.format(Math.round(secondes / 86400), "day");
  return new Date(iso).toLocaleDateString("fr-FR");
}

// La page à ouvrir selon le sujet du message : un message qui COMMENCE par « Incident »
// ouvre les incidents, un message qui COMMENCE par « Non-conformité » ouvre les
// non-conformités ; sinon le mot « rapport » passe avant « mission »
function pageDe(message: string): string | null {
  if (/^incident/i.test(message)) return "/incidents";
  if (/^non-conformit/i.test(message)) return "/non-conformites";
  if (/rapport/i.test(message)) return "/rapports";
  if (/mission/i.test(message)) return "/missions";
  return null;
}

export default function Cloche() {
  const navigate = useNavigate();
  const bouton = useRef<HTMLButtonElement>(null);
  const precedent = useRef<number | null>(null);

  const [donnees, setDonnees] = useState<Reponse>({ non_lues: 0, notifications: [] });
  const [ouvert, setOuvert] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [sonne, setSonne] = useState(false);

  const charger = useCallback(async () => {
    try {
      const reponse = await api.get<Reponse>("/suivi/notifications/");
      // Une nouvelle notification est arrivée : la cloche sonne
      if (precedent.current !== null && reponse.data.non_lues > precedent.current) {
        setSonne(true);
        window.setTimeout(() => setSonne(false), 1600);
      }
      precedent.current = reponse.data.non_lues;
      setDonnees(reponse.data);
    } catch {
      // Silencieux : la cloche réessaiera au prochain passage
    }
  }, []);

  // Synchronisation : toutes les 20 s, et au retour sur l'onglet
  useEffect(() => {
    charger();
    const rafraichir = () => {
      if (document.visibilityState === "visible") charger();
    };
    const minuteur = window.setInterval(rafraichir, 20000);
    document.addEventListener("visibilitychange", rafraichir);
    window.addEventListener("focus", rafraichir);
    return () => {
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", rafraichir);
      window.removeEventListener("focus", rafraichir);
    };
  }, [charger]);

  // Touche Échap
  useEffect(() => {
    if (!ouvert) return;
    function surTouche(e: KeyboardEvent) {
      if (e.key === "Escape") setOuvert(false);
    }
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  function basculer() {
    if (ouvert) {
      setOuvert(false);
      return;
    }
    const el = bouton.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const largeur = Math.min(380, window.innerWidth - 24);

      if (window.innerWidth - r.right >= largeur + 24) {
        // Assez de place à droite : le panneau s'ouvre à côté de la cloche, comme un volet
        const dansLeHaut = r.top < window.innerHeight / 2;
        setPosition({
          left: r.right + 14,
          largeur,
          haut: dansLeHaut ? r.top : undefined,
          bas: dansLeHaut ? undefined : window.innerHeight - r.bottom,
          origine: `0px ${dansLeHaut ? "0%" : "100%"}`,
        });
      } else {
        // Petit écran : sous la cloche, ou au-dessus s'il n'y a pas la place
        const left = Math.max(12, Math.min(r.left, window.innerWidth - largeur - 12));
        const enBas = window.innerHeight - r.bottom >= 360;
        setPosition({
          left,
          largeur,
          haut: enBas ? r.bottom + 10 : undefined,
          bas: enBas ? undefined : window.innerHeight - r.top + 10,
          origine: `${r.left + r.width / 2 - left}px ${enBas ? "0%" : "100%"}`,
        });
      }
    }
    setOuvert(true);
    charger();
  }

  async function ouvrirNotification(n: Notif) {
    if (!n.est_lue) {
      setDonnees((d) => ({
        non_lues: Math.max(0, d.non_lues - 1),
        notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, est_lue: true } : x)),
      }));
      precedent.current = Math.max(0, (precedent.current ?? 1) - 1);
      api.post(`/suivi/notifications/${n.id}/lue/`).catch(() => charger());
    }
    const page = pageDe(n.message);
    if (page) {
      setOuvert(false);
      navigate(page);
    }
  }

  function toutLire() {
    setDonnees((d) => ({
      non_lues: 0,
      notifications: d.notifications.map((x) => ({ ...x, est_lue: true })),
    }));
    precedent.current = 0;
    api.post("/suivi/notifications/tout-lire/").catch(() => charger());
  }

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={`clo-bouton${sonne ? " sonne" : ""}${ouvert ? " ouvert" : ""}`}
        onClick={basculer}
        aria-label={
          donnees.non_lues > 0
            ? `Notifications : ${donnees.non_lues} non lue${donnees.non_lues > 1 ? "s" : ""}`
            : "Notifications"
        }
        aria-expanded={ouvert}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {donnees.non_lues > 0 && (
          <span className="clo-badge">{donnees.non_lues > 9 ? "9+" : donnees.non_lues}</span>
        )}
      </button>

      {/* Affiché tout en haut de la page : rien ne peut le couper */}
      {ouvert &&
        position &&
        createPortal(
          <div className="clo-portail">
            <div className="clo-voile" onMouseDown={() => setOuvert(false)} />
            <div
              className="clo-panneau"
              role="dialog"
              aria-label="Notifications"
              style={{
                left: position.left,
                width: position.largeur,
                top: position.haut,
                bottom: position.bas,
                transformOrigin: position.origine,
              }}
            >
              <header className="clo-entete">
                <h2>Notifications</h2>
                {donnees.non_lues > 0 && (
                  <button type="button" className="clo-tout" onClick={toutLire}>
                    Tout marquer comme lu
                  </button>
                )}
              </header>

              {donnees.notifications.length === 0 ? (
                <p className="clo-vide">Aucune notification pour le moment.</p>
              ) : (
                <ul className="clo-liste">
                  {donnees.notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`clo-item${n.est_lue ? "" : " non-lue"}`}
                        onClick={() => ouvrirNotification(n)}
                      >
                        <span className="clo-point" aria-hidden="true" />
                        <span className="clo-texte">
                          <span className="clo-message">{n.message}</span>
                          <span className="clo-temps">{ilYA(n.date_envoi)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}