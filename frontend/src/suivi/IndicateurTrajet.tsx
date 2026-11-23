import { useEtatSuivi } from "./contexte";
import "./suivi.css";

export default function IndicateurTrajet() {
  const { etat, enAttente, detail } = useEtatSuivi();
  if (etat === "inactif") return null;

  const textes = {
    ok: "Trajet enregistré",
    recherche: "Recherche de votre position…",
    attente: `En attente du réseau · ${enAttente} point${enAttente > 1 ? "s" : ""}`,
    indisponible: "Position indisponible",
  };
  const classe = etat === "ok" ? "ok" : etat === "indisponible" ? "alerte" : "neutre";

  return (
    <div className="sv-indicateur" role="status" aria-live="polite">
      <span className={`sv-pastille ${classe}`}>
        <span className="sv-point" aria-hidden="true" />
        {textes[etat]}
      </span>
      <p className="sv-note">
        {detail || "Suivi actif pendant la mission : gardez la page ouverte et l'écran allumé."}
      </p>
    </div>
  );
}