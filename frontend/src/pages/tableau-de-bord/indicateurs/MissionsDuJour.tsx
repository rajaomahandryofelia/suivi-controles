import { useNavigate } from "react-router-dom";
import { delai } from "./indicateursCommuns";
import type { StatsControleur } from "../statistiques";

export default function MissionsDuJour({
  missions,
  rang,
}: {
  missions: StatsControleur["missions_du_jour"];
  rang: number;
}) {
  const navigate = useNavigate();

  return (
    <section className="ind-panneau ind-entree" style={delai(rang)} aria-labelledby="ind-aujourdhui">
      <div className="ind-panneau-tete">
        <h2 className="ind-titre" id="ind-aujourdhui">
          Aujourd'hui
        </h2>
        <button type="button" className="ind-lien" onClick={() => navigate("/missions")}>
          Toutes mes missions
        </button>
      </div>
      {missions.length === 0 ? (
        <p className="ind-vide">Aucune mission prévue aujourd'hui.</p>
      ) : (
        <ul className="ind-jour">
          {missions.map((mission) => (
            <li key={mission.id}>
              <button type="button" className="ind-mission" onClick={() => navigate("/missions")}>
                <span className="ind-mission-heure">
                  {mission.heure_prevue ? mission.heure_prevue.slice(0, 5) : "--:--"}
                </span>
                <span className="ind-mission-site">
                  <strong>{mission.site_nom}</strong>
                  {mission.site_localisation && <span>{mission.site_localisation}</span>}
                </span>
                <span className={`ind-statut ${mission.statut}`}>
                  {mission.statut_libelle ??
                    (mission.statut === "EN_COURS" ? "En cours" : "Planifiée")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}