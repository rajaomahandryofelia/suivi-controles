import AnneauRisque from "./AnneauRisque";
import { delai } from "./indicateursCommuns";
import type { StatsDirecteur } from "../statistiques";

export default function PanneauRisque({
  niveaux,
  rang,
}: {
  niveaux: StatsDirecteur["sites_par_niveau"];
  rang: number;
}) {
  return (
    <section className="ind-panneau ind-entree" style={delai(rang)} aria-labelledby="ind-risque">
      <h2 className="ind-titre" id="ind-risque">
        Risque des sites
      </h2>
      <AnneauRisque niveaux={niveaux} />
    </section>
  );
}