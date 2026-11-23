import { useEffect, useRef } from "react";
import L from "leaflet";
import { creerCarte, MADAGASCAR } from "./fondsCarte";
import { heureCourte } from "./format";
import type { PointTrajet, SiteTrajet, Trou } from "./types";

// Une étape de la tournée : un site, et le tracé relevé pendant sa mission
export interface Etape {
  rang: number;
  mission: number;
  site: SiteTrajet;
  points: PointTrajet[];
  trous: Trou[];
  seuilM: number;
}

interface Props {
  etapes: Etape[];
}

const STYLE_TRACE: L.PolylineOptions = {
  color: "#007A3D",
  weight: 5,
  opacity: 0.9,
  lineCap: "round",
  lineJoin: "round",
};
const STYLE_TROU: L.PolylineOptions = {
  color: "#9aa0a6",
  weight: 3,
  opacity: 0.95,
  dashArray: "4 8",
  lineCap: "round",
};

// Tracé d'une étape : vert, avec les segments qui traversent un silence en pointillé gris
function dessinerTrace(
  g: L.LayerGroup,
  ordonnes: PointTrajet[],
  pts: L.LatLngTuple[],
  trous: Trou[]
) {
  const temps = ordonnes.map((p) => new Date(p.releve_le).getTime());
  const pointille = new Set<number>(); // i : segment du point i au point i+1
  for (const t of trous) {
    const du = new Date(t.du).getTime();
    const au = new Date(t.au).getTime();
    let i0 = -1;
    for (let i = 0; i < temps.length; i++) {
      if (temps[i] <= du) i0 = i;
      else break;
    }
    let i1 = -1;
    for (let i = 0; i < temps.length; i++) {
      if (temps[i] >= au) {
        i1 = i;
        break;
      }
    }
    if (i0 >= 0 && i1 > i0) {
      for (let i = i0; i < i1; i++) pointille.add(i);
    }
  }

  let suite: L.LatLngTuple[] = [];
  let suitePointille = false;
  const vider = () => {
    if (suite.length > 1) L.polyline(suite, suitePointille ? STYLE_TROU : STYLE_TRACE).addTo(g);
    suite = [];
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const pointilleIci = pointille.has(i);
    if (suite.length === 0) {
      suite = [pts[i], pts[i + 1]];
      suitePointille = pointilleIci;
    } else if (pointilleIci === suitePointille) {
      suite.push(pts[i + 1]);
    } else {
      vider();
      suite = [pts[i], pts[i + 1]];
      suitePointille = pointilleIci;
    }
  }
  vider();
}

// Texte brut pour les infobulles : jamais interprété comme du HTML
function texte(contenu: string): HTMLElement {
  const el = document.createElement("span");
  el.textContent = contenu;
  return el;
}

export default function CarteTournee({ etapes }: Props) {
  const conteneur = useRef<HTMLDivElement | null>(null);
  const carte = useRef<L.Map | null>(null);
  const couche = useRef<L.LayerGroup | null>(null);

  // La carte, créée une seule fois
  useEffect(() => {
    if (!conteneur.current || carte.current) return;
    const c = creerCarte(conteneur.current);
    couche.current = L.layerGroup().addTo(c);
    carte.current = c;
    const observateur = new ResizeObserver(() => c.invalidateSize());
    observateur.observe(conteneur.current);
    return () => {
      observateur.disconnect();
      c.remove();
      carte.current = null;
      couche.current = null;
    };
  }, []);

  // Le dessin : cercles des sites, tracés, liaisons entre étapes, repères numérotés
  useEffect(() => {
    const c = carte.current;
    const g = couche.current;
    if (!c || !g) return;
    g.clearLayers();

    const zones: L.LatLngBounds[] = [];
    let precedent: L.LatLngTuple | null = null;
    let premier: { pt: L.LatLngTuple; quand: string } | null = null;
    let dernier: { pt: L.LatLngTuple; quand: string } | null = null;
    let total = 0;

    for (const e of etapes) {
      const { site } = e;
      if (site.latitude !== null && site.longitude !== null) {
        const cercle = L.circle([site.latitude, site.longitude], {
          radius: e.seuilM,
          color: "#007A3D",
          weight: 2,
          dashArray: "6 6",
          fillColor: "#007A3D",
          fillOpacity: 0.08,
        }).addTo(g);
        zones.push(cercle.getBounds());
      }

      const ordonnes = [...e.points].sort(
        (a, b) => new Date(a.releve_le).getTime() - new Date(b.releve_le).getTime()
      );
      const pts: L.LatLngTuple[] = ordonnes.map((p) => [p.latitude, p.longitude]);
      if (pts.length === 0) continue;

      // Entre deux étapes, le déplacement n'est pas suivi : trait pointillé gris
      if (precedent) L.polyline([precedent, pts[0]], STYLE_TROU).addTo(g);
      dessinerTrace(g, ordonnes, pts, e.trous);

      precedent = pts[pts.length - 1];
      if (!premier) premier = { pt: pts[0], quand: ordonnes[0].releve_le };
      dernier = { pt: precedent, quand: ordonnes[ordonnes.length - 1].releve_le };
      total += pts.length;
      zones.push(L.latLngBounds(pts));
    }

    // Départ et dernière position
    if (premier) {
      L.circleMarker(premier.pt, {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: "#007A3D",
        fillOpacity: 1,
      })
        .bindTooltip(texte(`Départ · ${heureCourte(premier.quand)}`), { direction: "top" })
        .addTo(g);
    }
    if (dernier && total > 1) {
      L.circleMarker(dernier.pt, {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: "#343434",
        fillOpacity: 1,
      })
        .bindTooltip(texte(`Dernière position · ${heureCourte(dernier.quand)}`), {
          direction: "top",
        })
        .addTo(g);
    }

    // Les sites numérotés, au-dessus du reste
    for (const e of etapes) {
      const { site } = e;
      if (site.latitude === null || site.longitude === null) continue;
      L.marker([site.latitude, site.longitude], {
        icon: L.divIcon({
          className: "tt-repere",
          html: `<span>${e.rang}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        title: site.nom,
        zIndexOffset: 400,
      })
        .bindTooltip(texte(`${e.rang}. ${site.nom}`), { direction: "top", offset: [0, -14] })
        .addTo(g);
    }

    // Cadrage : tous les tracés et tous les sites
    if (zones.length > 0) {
      const bornes = L.latLngBounds(zones[0].getSouthWest(), zones[0].getNorthEast());
      zones.slice(1).forEach((z) => bornes.extend(z));
      c.fitBounds(bornes, { padding: [40, 40], maxZoom: 17, animate: false });
    } else {
      c.fitBounds(MADAGASCAR, { padding: [10, 10], animate: false });
    }
  }, [etapes]);

  return <div ref={conteneur} className="tj-carte" aria-label="Carte du trajet de la tournée" />;
}