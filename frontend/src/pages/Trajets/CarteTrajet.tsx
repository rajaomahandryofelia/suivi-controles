import { useEffect, useRef } from "react";
import L from "leaflet";
import { creerCarte, MADAGASCAR } from "./fondsCarte";
import { distanceTexte, heureCourte } from "./format";
import type { PointTrajet, SiteTrajet, Trou } from "./types";

interface Props {
  points: PointTrajet[];
  site: SiteTrajet | null;
  seuilM: number;
  trous: Trou[];
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

export default function CarteTrajet({ points, site, seuilM, trous }: Props) {
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

  // Le dessin : site, tracé, trous, départ et dernière position
  useEffect(() => {
    const c = carte.current;
    const g = couche.current;
    if (!c || !g) return;
    g.clearLayers();

    const zones: L.LatLngBounds[] = [];

    // Site et cercle de tolérance
    if (site && site.latitude !== null && site.longitude !== null) {
      const centre: L.LatLngTuple = [site.latitude, site.longitude];
      const cercle = L.circle(centre, {
        radius: seuilM,
        color: "#007A3D",
        weight: 2,
        dashArray: "6 6",
        fillColor: "#007A3D",
        fillOpacity: 0.08,
      }).addTo(g);
      L.circleMarker(centre, {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: "#343434",
        fillOpacity: 1,
      })
        .bindTooltip(`${site.nom} · tolérance ${distanceTexte(seuilM)}`, { direction: "top" })
        .addTo(g);
      zones.push(cercle.getBounds());
    }

    // Tracé, dans l'ordre du temps
    const ordonnes = [...points].sort(
      (a, b) => new Date(a.releve_le).getTime() - new Date(b.releve_le).getTime()
    );
    const pts: L.LatLngTuple[] = ordonnes.map((p) => [p.latitude, p.longitude]);
    const temps = ordonnes.map((p) => new Date(p.releve_le).getTime());

    // Les segments qui traversent un silence sont dessinés en pointillé gris
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

    if (pts.length > 0) {
      L.circleMarker(pts[0], {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: "#007A3D",
        fillOpacity: 1,
      })
        .bindTooltip(`Départ · ${heureCourte(ordonnes[0].releve_le)}`, { direction: "top" })
        .addTo(g);
      if (pts.length > 1) {
        const dernier = pts.length - 1;
        L.circleMarker(pts[dernier], {
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#343434",
          fillOpacity: 1,
        })
          .bindTooltip(`Dernière position · ${heureCourte(ordonnes[dernier].releve_le)}`, {
            direction: "top",
          })
          .addTo(g);
      }
      zones.push(L.latLngBounds(pts));
    }

    // Cadrage : tout le tracé et le site
    if (zones.length > 0) {
      const bornes = L.latLngBounds(zones[0].getSouthWest(), zones[0].getNorthEast());
      zones.slice(1).forEach((z) => bornes.extend(z));
      c.fitBounds(bornes, { padding: [40, 40], maxZoom: 17, animate: false });
    } else {
      c.fitBounds(MADAGASCAR, { padding: [10, 10], animate: false });
    }
  }, [points, site, seuilM, trous]);

  return <div ref={conteneur} className="tj-carte" aria-label="Carte du trajet" />;
}