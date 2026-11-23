import { useNavigate } from "react-router-dom";

interface Props {
  nombre: number;
  libelle: string;
  vers: string;
}

// Une puce neutre (missions en cours, planifiées...)
export default function Compteur({ nombre, libelle, vers }: Props) {
  const navigate = useNavigate();
  return (
    <button type="button" className="ind-puce neutre" onClick={() => navigate(vers)}>
      <strong>{nombre}</strong>
      <span>{libelle}</span>
    </button>
  );
}