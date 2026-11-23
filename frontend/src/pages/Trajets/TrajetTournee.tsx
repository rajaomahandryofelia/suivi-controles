import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isCancel } from "axios";
import api from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import BoutonRetour from "../../components/BoutonRetour";
import { formaterDate, messagesErreur } from "../Missions/outils";
import type { Mission } from "../Missions/types";
import CarteTournee from "./CarteTournee";
import type { Etape } from "./CarteTournee";
import { distanceTexte, dureeMinTexte, heureCourte, pluriel } from "./format";
import type { ReponseTrajet } from "./types";
import "../Tracabilite/PageTracabilite.css";
import "./Trajets.css";
import "./TrajetTournee.css";

interface TourneeReponse {
  id: number;
  date: string;
  statut: string;
  controleur_nom: string;
  distance_estimee_km: number | string | null;
  duree_estimee_min?: number | null;
  // Les missions arrivent déjà dans l'ordre de passage
  missions: Mission[];
  statut_global?: string;
  statut_global_libelle?: string;
  ordre_mission?: { numero: string; date_emission: string } | null;
  ordre_route?: { numero: string; depart: string; destination: string; transport: string } | null;
}

export default function TrajetTournee() {
  const { id } = useParams<{ id: string }>();
  const { estDirecteur } = useAuth();

  const [tournee, setTournee] = useState<TourneeReponse | null>(null);
  const [trajets, setTrajets] = useState<Record<number, ReponseTrajet>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    if (!id) return;
    const annulation = new AbortController();
    const signal = annulation.signal;
    setChargement(true);
    setErreur("");

    (async () => {
      try {
        const t = await api.get<TourneeReponse>(`/controles/tournees/${id}/`, { signal });
        const missions = t.data.missions ?? [];
        // Le trajet de chaque étape, en parallèle : une étape sans trajet n'empêche pas les autres
        const resultats = await Promise.allSettled(
          missions.map((m) =>
            api.get<ReponseTrajet>(`/controles/missions/${m.id}/trajet/`, { signal })
          )
        );
        if (signal.aborted) return;
        const parMission: Record<number, ReponseTrajet> = {};
        resultats.forEach((r, i) => {
          if (r.status === "fulfilled") parMission[missions[i].id] = r.value.data;
        });
        setTournee(t.data);
        setTrajets(parMission);
        setChargement(false);
      } catch (e) {
        if (isCancel(e)) return;
        setChargement(false);
        setErreur(messagesErreur(e, "Impossible de charger la tournée. Réessayez."));
      }
    })();

    return () => annulation.abort();
  }, [id, tentative]);

  const missions = useMemo(() => tournee?.missions ?? [], [tournee]);

  const etapes = useMemo<Etape[]>(
    () =>
      missions.map((m, i) => {
        const t = trajets[m.id];
        return {
          rang: i + 1,
          mission: m.id,
          site: t ? t.site : { nom: m.site_nom, latitude: null, longitude: null },
          points: t ? t.points : [],
          trous: t ? t.resume.trous : [],
          seuilM: t ? t.resume.seuil_ecart_m : 500,
        };
      }),
    [missions, trajets]
  );

  // Totaux calculés par le serveur, additionnés étape par étape
  const liste = Object.values(trajets);
  const distanceReelleM = liste.reduce((somme, t) => somme + t.resume.distance_m, 0);
  const dureeSuivie = liste.reduce((somme, t) => somme + t.resume.duree_min, 0);
  const nbAvecTrajet = liste.filter((t) => t.resume.nb_points > 0).length;

  const estimeeBrute = tournee?.distance_estimee_km;
  const estimeeKm =
    estimeeBrute !== null && estimeeBrute !== undefined && Number.isFinite(Number(estimeeBrute))
      ? Number(estimeeBrute)
      : null;
  const estimeeM = estimeeKm !== null && estimeeKm > 0 ? estimeeKm * 1000 : null;
  const ecartPct =
    estimeeM !== null && distanceReelleM > 0
      ? Math.round(((distanceReelleM - estimeeM) / estimeeM) * 100)
      : null;

  const enCours = tournee?.statut_global === "EN_COURS";
  const route = tournee?.ordre_route ?? null;

  return (
    <div className="trp-page">
      <BoutonRetour
        vers={estDirecteur ? "/ordres" : "/trajets"}
        texte={estDirecteur ? "Retour aux ordres" : "Retour aux trajets"}
      />

      {erreur && (
        <div className="tj-erreur">
          <p className="trp-message erreur" role="alert">
            {erreur}
          </p>
          <button type="button" className="trp-btn trp-btn-secondaire" onClick={() => setTentative((n) => n + 1)}>
            Réessayer
          </button>
        </div>
      )}

      {chargement && !tournee && !erreur && (
        <div className="trp-chargement" role="status">
          <span className="trp-spinner-vert" aria-hidden="true" />
          Chargement de la tournée…
        </div>
      )}

      {tournee && (
        <>
          <header className="trp-entete">
            <h1>Tournée du {formaterDate(tournee.date)}</h1>
            <p className="tj-meta">
              <span>{tournee.controleur_nom}</span>
              <span className={`tj-etat${enCours ? " encours" : ""}`}>
                {tournee.statut_global_libelle ?? "Tournée"}
              </span>
              {tournee.ordre_mission && <span>Ordre de mission {tournee.ordre_mission.numero}</span>}
            </p>
          </header>

          <section className="tj-chiffres" aria-label="Résumé de la tournée">
            <div className="tj-chiffre">
              <strong>{distanceTexte(distanceReelleM)}</strong>
              <span>Distance réellement suivie</span>
            </div>
            <div className="tj-chiffre">
              <strong>{estimeeM !== null ? distanceTexte(estimeeM) : "-"}</strong>
              <span>Distance estimée de la tournée</span>
            </div>
            <div className="tj-chiffre">
              <strong>{ecartPct !== null ? `${ecartPct > 0 ? "+" : ""}${ecartPct} %` : "-"}</strong>
              <span>Écart réel / estimé</span>
            </div>
            <div className="tj-chiffre">
              <strong>{dureeMinTexte(dureeSuivie)}</strong>
              <span>Durée suivie</span>
            </div>
            <div className="tj-chiffre">
              <strong>
                {nbAvecTrajet} / {missions.length}
              </strong>
              <span>{missions.length > 1 ? "Étapes" : "Étape"} avec trajet</span>
            </div>
          </section>

          <div className="tj-carte-cadre">
            <CarteTournee etapes={etapes} />
            {nbAvecTrajet === 0 && (
              <div className="tj-carte-voile">Aucun point enregistré pour cette tournée.</div>
            )}
          </div>

          <ul className="tj-legende" aria-label="Légende de la carte">
            <li>
              <span className="tj-trait" aria-hidden="true" />
              Trajet suivi
            </li>
            <li>
              <span className="tj-trait gris" aria-hidden="true" />
              Silence du suivi, ou déplacement entre deux étapes
            </li>
            <li>
              <span className="tj-zone" aria-hidden="true" />
              Site numéroté, tolérance de 500 m
            </li>
          </ul>

          <p className="tj-note">
            Tracé approximatif : la position n'est relevée que lorsque la page reste ouverte et
            l'écran allumé. La distance réelle ne compte que les parties suivies : elle peut être
            inférieure à la réalité. L'estimation vient du planificateur de tournée.
          </p>

          {route && (
            <section className="tt-route" aria-label="Ordre de route">
              <h2 className="tt-titre">Ordre de route {route.numero}</h2>
              <p className="tt-route-trajet">
                <strong>{route.depart}</strong>
                <span className="tt-fleche" aria-hidden="true">
                  →
                </span>
                <strong>{route.destination}</strong>
              </p>
              <p className="tt-route-meta">
                Transport : {route.transport} · La destination est la première étape de la carte.
              </p>
            </section>
          )}

          <section className="tt-etapes">
            <h2 className="tt-titre">
              {pluriel(missions.length, "étape")} dans l'ordre de passage
            </h2>
            {missions.length === 0 ? (
              <p className="trp-vide-page">Cette tournée ne contient aucune mission.</p>
            ) : (
              <ul className="tj-liste">
                {missions.map((m, i) => {
                  const t = trajets[m.id];
                  const nbPoints = t ? t.resume.nb_points : 0;
                  const horaire =
                    t && t.resume.debut
                      ? `${heureCourte(t.resume.debut)} → ${
                          t.resume.fin && m.statut === "CLOTUREE" ? heureCourte(t.resume.fin) : "en cours"
                        }`
                      : m.statut === "PLANIFIEE"
                        ? "Pas encore démarrée"
                        : "Pas de trajet enregistré";
                  return (
                    <li key={m.id}>
                      <Link
                        to={`/trajets/${m.id}`}
                        className="tj-ligne"
                        style={{ animationDelay: `${Math.min(i, 9) * 35}ms` }}
                      >
                        <span className="tt-rang" aria-hidden="true">
                          {i + 1}
                        </span>
                        <span className="tj-ligne-texte">
                          <strong>{m.site_nom}</strong>
                          <span>{horaire}</span>
                        </span>
                        <span className="tj-ligne-trajet">
                          <strong>{t && nbPoints > 0 ? distanceTexte(t.resume.distance_m) : "-"}</strong>
                          <small>{nbPoints > 0 ? pluriel(nbPoints, "point") : "Pas de trajet"}</small>
                        </span>
                        <span className="tj-chevron" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}