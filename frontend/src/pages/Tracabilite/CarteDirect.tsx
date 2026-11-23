import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { isCancel } from "axios";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../../api/client";
import BoutonRetour from "../../components/BoutonRetour";
import { formaterDate, lienCarte, messagesErreur } from "../Missions/outils";
import type { PointTrajet, ReponseTrajet } from "../Trajets/types";
import "./CarteDirect.css";

type Etat = "retard" | "sur_place" | "demarree" | "prevue" | "cloturee" | "validee";

// Dernière position connue d'un contrôleur en mission (« recente » : moins de 5 minutes)
interface PositionActuelle {
  latitude: number | string;
  longitude: number | string;
  precision_m: number | null;
  releve_le: string;
  recente: boolean;
}

interface SiteCarte {
  mission: number;
  site_id: number;
  tournee: number | null;
  controleur: string;
  site: string;
  localisation: string;
  site_latitude: string;
  site_longitude: string;
  etat: Etat;
  etat_libelle: string;
  statut_libelle: string;
  creneau: string;
  debut: string | null;
  fin: string | null;
  latitude_debut: string | null;
  longitude_debut: string | null;
  latitude_fin: string | null;
  longitude_fin: string | null;
  ecart_debut_m: number | null;
  ecart_fin_m: number | null;
  debut_loin: boolean;
  fin_loin: boolean;
  arrivee_enregistree: boolean;
  nb_criteres: number;
  nb_reponses: number;
  nb_non_conformites: number;
  // Trajet du contrôleur (tâche 1)
  nb_points?: number;
  position_actuelle?: PositionActuelle | null;
  rapport: { statut: string; statut_libelle: string; score: string | number } | null;
}

interface ResumeMission {
  mission: number;
  controleur: string;
  date: string;
  creneau: string;
  debut: string | null;
  fin: string | null;
  statut_libelle: string;
  rapport: { statut_libelle: string; score: string | number } | null;
}

interface SiteEnregistre {
  dernier_controle: ResumeMission | null;
  prochaine_mission: ResumeMission | null;
  id: number;
  nom: string;
  localisation: string;
  latitude: string;
  longitude: string;
  type: string;
  appartenance: string;
}

interface Reponse {
  date: string;
  sites: SiteEnregistre[];
  missions: SiteCarte[];
  resume: Record<Etat, number>;
  etats: { cle: Etat; libelle: string }[];
  sans_coordonnees: number;
  maj: string;
}

// Le tracé de la mission choisie, avec le numéro de mission pour ne jamais afficher celui d'une autre
interface Trace {
  mission: number;
  points: PointTrajet[];
}

// Madagascar : sud-ouest et nord-est de l'île. La carte ne sort pas de cette zone.
const MADAGASCAR = L.latLngBounds([-25.8, 42.9], [-11.8, 50.7]);
// Limite de déplacement : large, pour que l'île reste centrée quelle que soit la forme de la carte
const ZONE = L.latLngBounds([-36, 28], [-2, 64]);

const ACTUALISATION_MS = 15000;
const FLASH_MS = 9000;

const jourISO = () => new Date().toLocaleDateString("sv-SE");

function heure(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "-";
}

function distanceTexte(metres: number) {
  return metres < 1000
    ? `${metres} m`
    : `${(metres / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

// L'épingle posée sur la carte : sa classe donne la couleur et l'animation.
// « site » = site enregistré sans mission ce jour-là.
function icone(etat: Etat | "site", flash: boolean, choisi: boolean) {
  const fini = etat === "cloturee" || etat === "validee";
  const symbole = fini
    ? '<path d="M11 17.5l5 5 9-10" stroke-width="3"/>'
    : '<path d="M18 8v3M18 11l-5.5 14M18 11l5.5 14M14.2 20h7.6M12.8 24h10.4" stroke-width="1.9"/>';
  const classes = `cd-pin cd-${etat}${flash ? " cd-flash" : ""}${choisi ? " cd-choisi" : ""}`;
  return L.divIcon({
    className: "cd-pin-conteneur",
    html:
      `<div class="${classes}"><span class="cd-pin-onde"></span>` +
      `<svg class="cd-pin-corps" viewBox="0 0 36 46" width="36" height="46" aria-hidden="true">` +
      `<path class="cd-pin-forme" d="M18 44.5C18 44.5 3 29 3 17.5a15 15 0 0 1 30 0C33 29 18 44.5 18 44.5z"/>` +
      `<g class="cd-pin-symbole" fill="none" stroke-linecap="round" stroke-linejoin="round">${symbole}</g>` +
      `</svg></div>`,
    iconSize: [36, 46],
    iconAnchor: [18, 44],
    tooltipAnchor: [0, -40],
  });
}

// Le point bleu d'un contrôleur sur le terrain (comme sur un GPS)
function iconeGps() {
  return L.divIcon({
    className: "cd-pin-conteneur",
    html: '<div class="cd-gps"><span class="cd-gps-halo"></span><span class="cd-gps-point"></span></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function CarteDirect() {
  const [jour, setJour] = useState(jourISO());
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [siteChoisi, setSiteChoisi] = useState<number | null>(null);
  const [annonce, setAnnonce] = useState("");
  const [tentative, setTentative] = useState(0);
  const [trace, setTrace] = useState<Trace | null>(null);

  const conteneur = useRef<HTMLDivElement | null>(null);
  const carte = useRef<L.Map | null>(null);
  const pastilles = useRef<Map<number, L.Marker>>(new Map());
  const couche = useRef<L.LayerGroup | null>(null);
  const coucheSites = useRef<L.LayerGroup | null>(null);
  const coucheGps = useRef<L.LayerGroup | null>(null);
  const coucheTrace = useRef<L.LayerGroup | null>(null);
  const selection = useRef<L.LayerGroup | null>(null);
  const etatsPrecedents = useRef<Map<number, Etat>>(new Map());
  const clignotants = useRef<Set<number>>(new Set());
  const cles = useRef<Map<number, string>>(new Map());
  const premierCadrage = useRef(true);
  const choisieRef = useRef<number | null>(null);
  const minuteurAnnonce = useRef<number | null>(null);

  choisieRef.current = choisie;

  function cadrerLesSites() {
    const c = carte.current;
    if (!c || !donnees) return;
    const points: [number, number][] = [
      ...donnees.sites.map((x) => [Number(x.latitude), Number(x.longitude)] as [number, number]),
      ...donnees.missions.map((m) => [Number(m.site_latitude), Number(m.site_longitude)] as [number, number]),
    ];
    if (points.length === 0) c.fitBounds(MADAGASCAR);
    else if (points.length === 1) c.setView(points[0], 12);
    else c.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 13 });
  }

  // ---- La carte (créée une seule fois) ----
  useEffect(() => {
    if (!conteneur.current || carte.current) return;
    const c = L.map(conteneur.current, {
      zoomControl: true,
      zoomSnap: 0.25,
      maxBounds: ZONE,
      maxBoundsViscosity: 1,
    });
    // Toute l'île, centrée, quelle que soit la taille de la carte
    const cadrerMadagascar = () => {
      c.invalidateSize();
      c.fitBounds(MADAGASCAR, { padding: [10, 10], animate: false });
      c.setMinZoom(c.getZoom() - 0.5);
    };
    cadrerMadagascar();
    // Tant que l'utilisateur n'a pas touché la carte, on la recentre si sa taille change
    let touche = false;
    const marquer = () => {
      touche = true;
    };
    conteneur.current.addEventListener("pointerdown", marquer);
    conteneur.current.addEventListener("wheel", marquer, { passive: true });
    // Trois fonds au choix, sans clé : plan routier (comme un GPS), satellite, OpenStreetMap
    const esri = "https://server.arcgisonline.com/ArcGIS/rest/services";
    const plan = L.tileLayer(`${esri}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, {
      minZoom: 5,
      maxZoom: 19,
      maxNativeZoom: 18,
      attribution: "Tuiles &copy; Esri, HERE, Garmin, OpenStreetMap",
    });
    const satellite = L.layerGroup([
      L.tileLayer(`${esri}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
        minZoom: 5,
        maxZoom: 19,
        maxNativeZoom: 18,
        attribution: "Imagerie &copy; Esri, Maxar, Earthstar Geographics",
      }),
      L.tileLayer(`${esri}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, {
        minZoom: 5,
        maxZoom: 19,
        maxNativeZoom: 18,
      }),
    ]);
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      minZoom: 5,
      maxZoom: 19,
      attribution: "&copy; les contributeurs d'OpenStreetMap",
    });
    plan.addTo(c);
    L.control.layers({ Plan: plan, Satellite: satellite, OpenStreetMap: osm }, undefined, { position: "topright" }).addTo(c);
    // La carte se redimensionne avec la fenêtre
    const observateur = new ResizeObserver(() => {
      if (touche) c.invalidateSize();
      else cadrerMadagascar();
    });
    observateur.observe(conteneur.current);
    coucheSites.current = L.layerGroup().addTo(c);
    coucheTrace.current = L.layerGroup().addTo(c);
    coucheGps.current = L.layerGroup().addTo(c);
    couche.current = L.layerGroup().addTo(c);
    selection.current = L.layerGroup().addTo(c);
    carte.current = c;
    return () => {
      observateur.disconnect();
      c.remove();
      carte.current = null;
      pastilles.current.clear();
    };
  }, []);

  // ---- Chargement et actualisation automatique ----
  const charger = useCallback(
    async (silencieux: boolean, signal?: AbortSignal) => {
      if (!silencieux) setChargement(true);
      try {
        const r = await api.get<Reponse>("/controles/tracabilite/carte/", {
          params: { date: jour },
          signal,
        });
        setDonnees({ ...r.data, sites: r.data.sites ?? [], missions: r.data.missions ?? [] });
        setErreur("");
      } catch (e) {
        if (isCancel(e)) return;
        setErreur(messagesErreur(e, "Impossible de charger la carte. Réessayez."));
      } finally {
        if (!signal?.aborted) setChargement(false);
      }
    },
    [jour]
  );

  useEffect(() => {
    const annulation = new AbortController();
    premierCadrage.current = true;
    etatsPrecedents.current = new Map();
    charger(false, annulation.signal);
    const minuteur = window.setInterval(() => {
      if (document.visibilityState === "visible") charger(true);
    }, ACTUALISATION_MS);
    return () => {
      annulation.abort();
      window.clearInterval(minuteur);
    };
  }, [charger, tentative]);

  // ---- Détection des changements : le site qui vient de changer d'état clignote ----
  useEffect(() => {
    if (!donnees) return;
    const avant = etatsPrecedents.current;
    const dejaVu = avant.size > 0;
    const changements: SiteCarte[] = [];
    for (const m of donnees.missions) {
      const ancien = avant.get(m.mission);
      if (dejaVu && ancien !== undefined && ancien !== m.etat) changements.push(m);
    }
    etatsPrecedents.current = new Map(donnees.missions.map((m) => [m.mission, m.etat]));

    for (const m of changements) {
      clignotants.current.add(m.mission);
      window.setTimeout(() => {
        clignotants.current.delete(m.mission);
        const p = pastilles.current.get(m.mission);
        if (p) {
          const choisi = choisieRef.current === m.mission;
          p.setIcon(icone(m.etat, false, choisi));
          cles.current.set(m.mission, `${m.etat}|false|${choisi}`);
        }
      }, FLASH_MS);
    }
    if (changements.length > 0) {
      const m = changements[0];
      const texte =
        m.etat === "cloturee" || m.etat === "validee"
          ? `${m.controleur} a terminé « ${m.site} »`
          : m.etat === "sur_place"
            ? `${m.controleur} est arrivé sur « ${m.site} »`
            : `« ${m.site} » : ${m.etat_libelle.toLowerCase()}`;
      setAnnonce(changements.length > 1 ? `${texte} (+${changements.length - 1})` : texte);
      if (minuteurAnnonce.current) window.clearTimeout(minuteurAnnonce.current);
      minuteurAnnonce.current = window.setTimeout(() => setAnnonce(""), 7000);
    }
  }, [donnees]);

  // ---- Les pastilles sur la carte ----
  useEffect(() => {
    const c = carte.current;
    const g = couche.current;
    if (!c || !g || !donnees) return;

    const presentes = new Set<number>();
    for (const m of donnees.missions) {
      presentes.add(m.mission);
      const position: [number, number] = [Number(m.site_latitude), Number(m.site_longitude)];
      const flash = clignotants.current.has(m.mission);
      const choisi = choisie === m.mission;
      const cle = `${m.etat}|${flash}|${choisi}`;
      let pastille = pastilles.current.get(m.mission);
      if (!pastille) {
        pastille = L.marker(position, { icon: icone(m.etat, flash, choisi), title: m.site, riseOnHover: true });
        pastille.on("click", () => {
          setChoisie(m.mission);
          setSiteChoisi(null);
        });
        pastille.addTo(g);
        pastilles.current.set(m.mission, pastille);
        cles.current.set(m.mission, cle);
      } else {
        pastille.setLatLng(position);
        // On ne recrée l'icône que si quelque chose a changé : l'animation ne repart pas à chaque actualisation
        if (cles.current.get(m.mission) !== cle) {
          pastille.setIcon(icone(m.etat, flash, choisi));
          cles.current.set(m.mission, cle);
        }
      }
    }
    // Une mission qui n'est plus dans la liste disparaît de la carte
    for (const [id, p] of pastilles.current) {
      if (!presentes.has(id)) {
        g.removeLayer(p);
        pastilles.current.delete(id);
        cles.current.delete(id);
      }
    }

  }, [donnees, choisie]);

  // ---- Les sites enregistrés (ceux qui n'ont pas de mission ce jour-là) ----
  useEffect(() => {
    const g = coucheSites.current;
    if (!g || !donnees) return;
    g.clearLayers();
    const avecMission = new Set(donnees.missions.map((m) => m.site_id));
    for (const site of donnees.sites) {
      if (avecMission.has(site.id)) continue; // le point coloré de la mission le remplace
      const repere = L.marker([Number(site.latitude), Number(site.longitude)], {
        icon: icone("site", false, siteChoisi === site.id),
        title: site.nom,
      });
      repere.bindTooltip(site.nom, { direction: "top" });
      repere.on("click", () => {
        setSiteChoisi(site.id);
        setChoisie(null);
      });
      repere.addTo(g);
    }
  }, [donnees, siteChoisi]);

  // ---- Les contrôleurs sur le terrain : un point bleu à leur position GPS ----
  // Position actuelle quand elle est récente (moins de 5 min), sinon position d'arrivée.
  useEffect(() => {
    const g = coucheGps.current;
    if (!g || !donnees) return;
    g.clearLayers();
    for (const m of donnees.missions) {
      const surLeTerrain = m.etat === "sur_place" || m.etat === "retard" || m.etat === "demarree";
      if (!surLeTerrain) continue;

      const actuelle = m.position_actuelle;
      let position: [number, number] | null = null;
      if (actuelle && actuelle.recente) {
        position = [Number(actuelle.latitude), Number(actuelle.longitude)];
      } else if (m.latitude_debut && m.longitude_debut) {
        position = [Number(m.latitude_debut), Number(m.longitude_debut)];
      }
      if (!position) continue;

      L.marker(position, {
        icon: iconeGps(),
        title: m.controleur,
        zIndexOffset: 500,
      })
        .bindTooltip(m.controleur, { permanent: true, direction: "right", offset: [12, 0], className: "cd-etiquette" })
        .on("click", () => {
          setChoisie(m.mission);
          setSiteChoisi(null);
        })
        .addTo(g);
    }
  }, [donnees]);

  // ---- Le tracé de la mission choisie : rechargé à chaque actualisation de la carte ----
  useEffect(() => {
    if (choisie === null) {
      setTrace(null);
      return;
    }
    const m = donnees?.missions.find((x) => x.mission === choisie);
    if (!m || !m.nb_points) {
      setTrace(null);
      return;
    }
    const annulation = new AbortController();
    api
      .get<ReponseTrajet>(`/controles/missions/${choisie}/trajet/`, { signal: annulation.signal })
      .then((r) => setTrace({ mission: choisie, points: r.data.points }))
      .catch((e) => {
        if (isCancel(e)) return;
        // Le tracé est un plus : sans lui, la carte reste utilisable
        setTrace(null);
      });
    return () => annulation.abort();
  }, [donnees, choisie]);

  // ---- Le dessin du tracé (vert) ----
  useEffect(() => {
    const g = coucheTrace.current;
    if (!g) return;
    g.clearLayers();
    if (!trace || trace.mission !== choisie || trace.points.length < 2) return;
    const pts = [...trace.points]
      .sort((a, b) => new Date(a.releve_le).getTime() - new Date(b.releve_le).getTime())
      .map((p) => [p.latitude, p.longitude] as L.LatLngTuple);
    L.polyline(pts, {
      color: "#007A3D",
      weight: 5,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(g);
  }, [trace, choisie]);

  // ---- Le site choisi : position réelle du contrôleur et trait vers le site ----
  useEffect(() => {
    const s = selection.current;
    if (!s) return;
    s.clearLayers();
    const m = donnees?.missions.find((x) => x.mission === choisie);
    if (!m) return;
    const site: [number, number] = [Number(m.site_latitude), Number(m.site_longitude)];

    const points: { lat: string | null; lng: string | null; texte: string; loin: boolean }[] = [
      { lat: m.latitude_debut, lng: m.longitude_debut, texte: "Arrivée du contrôleur", loin: m.debut_loin },
      { lat: m.latitude_fin, lng: m.longitude_fin, texte: "Clôture du contrôle", loin: m.fin_loin },
    ];
    for (const p of points) {
      if (!p.lat || !p.lng) continue;
      const pos: [number, number] = [Number(p.lat), Number(p.lng)];
      L.circleMarker(pos, {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: p.loin ? "#ed1c24" : "#1d6fd1",
        fillOpacity: 1,
      })
        .bindTooltip(p.texte, { direction: "top" })
        .addTo(s);
      L.polyline([pos, site], {
        color: p.loin ? "#ed1c24" : "#1d6fd1",
        weight: 2,
        dashArray: "5 6",
      }).addTo(s);
    }
  }, [donnees, choisie]);

  function choisir(m: SiteCarte) {
    setChoisie(m.mission);
    setSiteChoisi(null);
    carte.current?.flyTo([Number(m.site_latitude), Number(m.site_longitude)], Math.max(carte.current.getZoom(), 14), {
      duration: 0.8,
    });
  }

  function voirMadagascar() {
    carte.current?.fitBounds(MADAGASCAR, { padding: [10, 10] });
  }

  function toutVoir() {
    cadrerLesSites();
  }

  const missions = donnees?.missions ?? [];
  const sites = donnees?.sites ?? [];
  const siteDetail = sites.find((x) => x.id === siteChoisi) ?? null;
  const detail = missions.find((m) => m.mission === choisie) ?? null;
  const dernier = donnees ? new Date(donnees.maj).toLocaleTimeString("fr-FR") : "";

  return (
    <div className="cd-page">
      <BoutonRetour vers="/trajets" texte="Retour aux trajets" />

      <div className="entete-page">
        <h1>Carte en direct</h1>
      </div>
      <p className="cd-intro">
        Chaque point est un site à contrôler. Cliquez dessus pour voir qui y est, de quelle heure à quelle heure,
        et où en est le contrôle. Un point qui change d'état clignote quelques secondes.
      </p>

      {erreur && (
        <p className="cd-message erreur" role="alert">
          {erreur}{" "}
          <button type="button" className="cd-lien" onClick={() => setTentative((n) => n + 1)}>
            Réessayer
          </button>
        </p>
      )}

      {annonce && (
        <div className="cd-ile-zone">
          <div className="cd-ile" role="status">
            <span className="cd-ile-point" aria-hidden="true" />
            <span className="cd-ile-texte">{annonce}</span>
          </div>
        </div>
      )}

      <div className="cd-barre">
        <div className="cd-champ">
          <label htmlFor="cd-jour">Jour</label>
          <input id="cd-jour" type="date" value={jour} onChange={(e) => e.target.value && setJour(e.target.value)} />
        </div>
        <button type="button" className="cd-btn" onClick={() => setJour(jourISO())} disabled={jour === jourISO()}>
          Aujourd'hui
        </button>
        <button type="button" className="cd-btn" onClick={toutVoir} disabled={missions.length === 0 && sites.length === 0}>
          Voir les sites
        </button>
        <button type="button" className="cd-btn" onClick={voirMadagascar}>
          Madagascar
        </button>
        <span className="cd-direct" title="La carte se met à jour toute seule toutes les 15 secondes">
          <span className="cd-direct-point" aria-hidden="true" />
          En direct{dernier ? ` · mis à jour à ${dernier}` : ""}
        </span>
      </div>

      {donnees && (
        <ul className="cd-legende" aria-label="Légende">
          {donnees.etats.map((e) => (
            <li key={e.cle}>
              <span className={`cd-puce cd-${e.cle}`} aria-hidden="true" />
              <strong>{donnees.resume[e.cle]}</strong> {e.libelle.toLowerCase()}
            </li>
          ))}
          <li>
            <span className="cd-puce cd-site" aria-hidden="true" />
            <strong>{sites.length}</strong> site{sites.length > 1 ? "s" : ""} enregistré{sites.length > 1 ? "s" : ""}
          </li>
        </ul>
      )}

      <div className="cd-zone">
        <div className="cd-carte-cadre">
          <div ref={conteneur} className="cd-carte" aria-label="Carte des sites" />
          {chargement && !donnees && <div className="cd-carte-voile">Chargement de la carte…</div>}
          {donnees && missions.length === 0 && (
            <div className="cd-carte-voile">
              {sites.length > 0 ? "Aucune mission ce jour-là : les sites enregistrés sont affichés." : "Aucun site enregistré avec des coordonnées GPS."}
            </div>
          )}
        </div>

        <aside className="cd-panneau">
          {detail ? (
            <section className={`cd-detail cd-bord-${detail.etat}`}>
              <button type="button" className="cd-fermer" onClick={() => setChoisie(null)} aria-label="Fermer le détail">
                ✕
              </button>
              <span className={`cd-statut cd-${detail.etat}`}>{detail.etat_libelle}</span>
              <h2>{detail.site}</h2>
              <p className="cd-lieu">{detail.localisation}</p>

              <dl className="cd-infos">
                <div>
                  <dt>Contrôleur</dt>
                  <dd>{detail.controleur}</dd>
                </div>
                <div>
                  <dt>Créneau prévu</dt>
                  <dd>{detail.creneau || "-"}</dd>
                </div>
                <div>
                  <dt>Arrivé à</dt>
                  <dd>
                    {heure(detail.debut)}
                    {detail.debut && !detail.arrivee_enregistree && <small>démarrage automatique, sans GPS</small>}
                    {detail.ecart_debut_m !== null && (
                      <small className={detail.debut_loin ? "cd-loin" : undefined}>
                        {detail.debut_loin ? "éloigné : " : ""}à {distanceTexte(detail.ecart_debut_m)} du site
                      </small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Terminé à</dt>
                  <dd>
                    {detail.fin ? heure(detail.fin) : detail.debut ? "En cours" : "-"}
                    {detail.ecart_fin_m !== null && (
                      <small className={detail.fin_loin ? "cd-loin" : undefined}>
                        {detail.fin_loin ? "éloigné : " : ""}à {distanceTexte(detail.ecart_fin_m)} du site
                      </small>
                    )}
                  </dd>
                </div>
                {(detail.nb_points ?? 0) > 0 && (
                  <div>
                    <dt>Trajet</dt>
                    <dd>
                      {detail.nb_points} point{(detail.nb_points ?? 0) > 1 ? "s" : ""}
                      {detail.position_actuelle && (
                        <small>
                          {detail.position_actuelle.recente ? "position à " : "dernière position à "}
                          {heure(detail.position_actuelle.releve_le)}
                        </small>
                      )}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Grille</dt>
                  <dd>
                    {detail.nb_reponses}/{detail.nb_criteres} critères
                    <small>
                      {detail.nb_non_conformites} non-conformité{detail.nb_non_conformites > 1 ? "s" : ""}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Rapport</dt>
                  <dd>
                    {detail.rapport
                      ? `${detail.rapport.statut_libelle} · ${Math.round(Number(detail.rapport.score))} %`
                      : "Pas encore envoyé"}
                  </dd>
                </div>
              </dl>

              <div className="cd-actions">
                <Link className="cd-btn cd-btn-plein" to={`/missions?mission=${detail.mission}`}>
                  Ouvrir la mission
                </Link>
                {(detail.nb_points ?? 0) > 0 && (
                  <Link className="cd-btn" to={`/trajets/${detail.mission}`}>
                    Voir le trajet
                  </Link>
                )}
                <a
                  className="cd-btn"
                  href={lienCarte(detail.site_latitude, detail.site_longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Itinéraire
                </a>
              </div>
            </section>
          ) : siteDetail ? (
            <section className="cd-detail cd-bord-prevue">
              <button type="button" className="cd-fermer" onClick={() => setSiteChoisi(null)} aria-label="Fermer le détail">
                ✕
              </button>
              <span className="cd-statut cd-site-statut">Site enregistré</span>
              <h2>{siteDetail.nom}</h2>
              <p className="cd-lieu">{siteDetail.localisation}</p>
              <dl className="cd-infos">
                <div>
                  <dt>Type</dt>
                  <dd>{siteDetail.type || "-"}</dd>
                </div>
                <div>
                  <dt>Appartenance</dt>
                  <dd>{siteDetail.appartenance}</dd>
                </div>
              </dl>
              <div className="cd-historique">
                <h3>Dernier contrôle</h3>
                {siteDetail.dernier_controle ? (
                  <>
                    <p>
                      <strong>{siteDetail.dernier_controle.controleur}</strong>
                      <span>{formaterDate(siteDetail.dernier_controle.date)}</span>
                      <span>
                        {siteDetail.dernier_controle.debut ? `de ${heure(siteDetail.dernier_controle.debut)}` : ""}
                        {siteDetail.dernier_controle.fin
                          ? ` à ${heure(siteDetail.dernier_controle.fin)}`
                          : " · en cours"}
                      </span>
                    </p>
                    <p className="cd-rapport">
                      {siteDetail.dernier_controle.rapport
                        ? `Rapport ${siteDetail.dernier_controle.rapport.statut_libelle.toLowerCase()} · ${Math.round(Number(siteDetail.dernier_controle.rapport.score))} %`
                        : "Rapport pas encore envoyé"}
                    </p>
                    <Link className="cd-lien" to={`/missions?mission=${siteDetail.dernier_controle.mission}`}>
                      Ouvrir cette mission
                    </Link>
                  </>
                ) : (
                  <p className="cd-aide">Ce site n'a encore jamais été contrôlé.</p>
                )}
              </div>
              {siteDetail.prochaine_mission && (
                <div className="cd-historique">
                  <h3>Prochaine mission</h3>
                  <p>
                    <strong>{siteDetail.prochaine_mission.controleur}</strong>
                    <span>{formaterDate(siteDetail.prochaine_mission.date)}</span>
                    {siteDetail.prochaine_mission.creneau && <span>{siteDetail.prochaine_mission.creneau}</span>}
                  </p>
                </div>
              )}
              <div className="cd-actions">
                <a
                  className="cd-btn"
                  href={lienCarte(siteDetail.latitude, siteDetail.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Itinéraire
                </a>
              </div>
            </section>
          ) : (
            <p className="cd-aide">Cliquez sur un site de la carte, ou sur une ligne ci-dessous, pour voir le détail.</p>
          )}

          <ul className="cd-liste">
            {missions.map((m) => (
              <li key={m.mission}>
                <button
                  type="button"
                  className={`cd-ligne${m.mission === choisie ? " actif" : ""}`}
                  onClick={() => choisir(m)}
                >
                  <span className={`cd-puce cd-${m.etat}`} aria-hidden="true" />
                  <span className="cd-ligne-texte">
                    <strong>{m.site}</strong>
                    <span>
                      {m.controleur}
                      {m.creneau ? ` · ${m.creneau}` : ""}
                    </span>
                  </span>
                  <span className="cd-ligne-etat">{m.etat_libelle}</span>
                </button>
              </li>
            ))}
          </ul>
          {donnees && donnees.sans_coordonnees > 0 && (
            <p className="cd-aide">
              {donnees.sans_coordonnees} site{donnees.sans_coordonnees > 1 ? "s" : ""} sans coordonnées GPS : non
              affiché{donnees.sans_coordonnees > 1 ? "s" : ""} sur la carte.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}