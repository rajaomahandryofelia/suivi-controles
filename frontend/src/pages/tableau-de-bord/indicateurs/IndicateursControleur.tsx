import { IconeAlerte, IconeRapport } from "../icones/IconesTdb";
import { pucesMissions } from "./indicateursCommuns";
import MissionsDuJour from "./MissionsDuJour";
import PanneauAFaire from "./PanneauAFaire";
import type { ElementAFaire } from "./PanneauAFaire";
import type { StatsControleur } from "../statistiques";

export default function IndicateursControleur({ stats }: { stats: StatsControleur }) {
  const aTraiter: ElementAFaire[] = [
    {
      cle: "corriger",
      libelle: "Rapports à corriger",
      nombre: stats.rapports_a_corriger,
      ton: "danger",
      icone: <IconeRapport />,
      vers: "/rapports",
    },
    {
      cle: "verifier",
      libelle: "Défauts à vérifier",
      nombre: stats.non_conformites_a_verifier,
      ton: "attention",
      icone: <IconeAlerte />,
      vers: "/non-conformites",
    },
  ];

  return (
    <div className="ind-pile">
      {/* Ce qui se passe aujourd'hui passe en premier */}
      <MissionsDuJour missions={stats.missions_du_jour} rang={0} />

      <PanneauAFaire
        rang={1}
        elements={aTraiter}
        resume={{ titre: "Mes missions", puces: pucesMissions(stats.missions) }}
      />
    </div>
  );
}