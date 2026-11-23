import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Nombre from "./Nombre";

interface Props {
  libelle: string;
  nombre: number;
  vers: string;
  // Couleur de l'icône et du chiffre quand il y a quelque chose à faire ; à 0, la carte s'efface
  ton: "attention" | "danger" | "succes" | "info";
  icone: ReactNode;
  // Rang d'apparition (les cartes arrivent l'une après l'autre)
  rang?: number;
}

// Une carte de chiffre : libellé, petite icône, nombre animé ; un clic ouvre la page concernée
export default function CarteAction({ libelle, nombre, vers, ton, icone, rang = 0 }: Props) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={`ind-kpi ind-entree ${nombre === 0 ? "calme" : ton}`}
      style={{ "--i": rang } as CSSProperties}
      onClick={() => navigate(vers)}
    >
      <span className="ind-kpi-haut">
        <span>{libelle}</span>
        <span className="ind-kpi-icone">{icone}</span>
      </span>
      <strong className="ind-kpi-nombre">
        <Nombre valeur={nombre} />
      </strong>
    </button>
  );
}