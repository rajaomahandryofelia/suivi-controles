import type { ReactNode } from "react";
import { pucesMissions } from "./indicateursCommuns";
import PanneauProcessus from "./PanneauProcessus";
import type { EtapeProcessus } from "./PanneauProcessus";
import PanneauRisque from "./PanneauRisque";
import PanneauSites from "./PanneauSites";
import type { StatsDirecteur } from "../statistiques";
import "./IndicateursDirecteur.css";

// Les demandes d'inscription sont sur la même page : un clic y fait défiler
function allerAuxDemandes() {
  const bloc = document.getElementById("demandes-inscription");
  if (!bloc) return;
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  bloc.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "start" });
}

interface Props {
  stats: StatsDirecteur;
  // Nombre de demandes d'inscription en attente (elles se traitent sur cette page)
  nbDemandes: number;
  // Le bloc des demandes, affiché en bas (vide : on ne le montre pas)
  demandes?: ReactNode;
}

export default function IndicateursDirecteur({ stats, nbDemandes, demandes }: Props) {
  const nc = stats.non_conformites;

  // Les adresses des missions viennent des pastilles déjà définies dans indicateursCommuns
  const puces = pucesMissions(stats.missions);
  const versMissions = (debut: string) =>
    puces.find((p) => p.libelle.toLowerCase().startsWith(debut))?.vers ?? "/missions";

  // Le parcours d'un contrôle, dans l'ordre où il se déroule
  const etapes: EtapeProcessus[] = [
    {
      cle: "planifiees",
      libelle: "Missions planifiées",
      nombre: stats.missions.planifiees,
      ton: "neutre",
      vers: versMissions("planif"),
    },
    {
      cle: "en-cours",
      libelle: "Missions en cours",
      nombre: stats.missions.en_cours,
      ton: "neutre",
      vers: versMissions("en cours"),
    },
    {
      cle: "rapports",
      libelle: "Rapports à valider",
      nombre: stats.rapports_en_attente,
      ton: stats.rapports_en_attente > 0 ? "attention" : "neutre",
      vers: "/rapports",
    },
    {
      cle: "non-conformites",
      libelle: "Non-conformités à suivre",
      nombre: nc.a_traiter,
      ton: nc.en_retard > 0 ? "danger" : "neutre",
      vers: "/non-conformites",
      note: nc.en_retard > 0 ? `dont ${nc.en_retard} en retard` : null,
    },
  ];

  return (
    <div className="ind-pile">
      {/* 1. Où en sont les contrôles, et ce qui attend le directeur */}
      <PanneauProcessus
        rang={0}
        etapes={etapes}
        demandes={{ nombre: nbDemandes, action: allerAuxDemandes }}
      />

      {/* 2. L'analyse : quels sites surveiller, quelle répartition du risque */}
      <div className="ind-principal">
        <div className="ind-colonne">
          <PanneauSites sites={stats.sites_a_risque} rang={1} />
        </div>
        <div className="ind-colonne">
          <PanneauRisque niveaux={stats.sites_par_niveau} rang={2} />
        </div>
      </div>

      {/* 3. Les demandes d'inscription, seulement s'il y en a */}
      {demandes && <div id="demandes-inscription">{demandes}</div>}
    </div>
  );
}