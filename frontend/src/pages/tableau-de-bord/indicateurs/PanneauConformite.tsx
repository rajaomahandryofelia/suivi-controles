import GraphiqueConformite from "./GraphiqueConformite";
import { delai } from "./indicateursCommuns";
import Nombre from "./Nombre";
import { resumeTendance } from "../statistiques";
import type { StatsDirecteur } from "../statistiques";

export default function PanneauConformite({
  points,
  rang,
}: {
  points: StatsDirecteur["tendance_conformite"];
  rang: number;
}) {
  const tendance = resumeTendance(points);

  return (
    <section className="ind-panneau ind-entree" style={delai(rang)} aria-labelledby="ind-conformite">
      <div className="ind-panneau-tete">
        <h2 className="ind-titre" id="ind-conformite">
          Conformité moyenne
        </h2>
        {tendance && (
          <span className="ind-valeur">
            <strong>
              <Nombre valeur={Math.round(tendance.valeur)} /> %
            </strong>
            {tendance.variation !== null && tendance.variation !== 0 && (
              <span className={tendance.variation > 0 ? "hausse" : "baisse"}>
                {tendance.variation > 0 ? "+" : "−"}
                {Math.abs(tendance.variation).toLocaleString("fr-FR")} pt
                {Math.abs(tendance.variation) >= 2 ? "s" : ""}
              </span>
            )}
          </span>
        )}
      </div>
      <GraphiqueConformite points={points} />
    </section>
  );
}