import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Madagascar : sud-ouest et nord-est de l'île
export const MADAGASCAR = L.latLngBounds([-25.8, 42.9], [-11.8, 50.7]);
// Limite de déplacement : large, pour que l'île reste centrée
const ZONE = L.latLngBounds([-36, 28], [-2, 64]);

// Même carte que « Carte en direct » : Plan, Satellite, OpenStreetMap, sans clé
export function creerCarte(conteneur: HTMLElement): L.Map {
  const c = L.map(conteneur, {
    zoomControl: true,
    zoomSnap: 0.25,
    maxBounds: ZONE,
    maxBoundsViscosity: 1,
  });

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
  L.control
    .layers({ Plan: plan, Satellite: satellite, OpenStreetMap: osm }, undefined, { position: "topright" })
    .addTo(c);
  c.fitBounds(MADAGASCAR, { padding: [10, 10], animate: false });
  return c;
}