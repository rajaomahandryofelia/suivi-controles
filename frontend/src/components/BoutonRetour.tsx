import { Link } from "react-router-dom";

interface Props {
  vers: string;
  texte?: string;
}

// Bouton « Retour » à mettre en haut de chaque page (flèche seule)
export default function BoutonRetour({ vers, texte = "Retour" }: Props) {
  return (
    <Link to={vers} className="bouton-retour" aria-label={texte} title={texte}>
      <span aria-hidden="true">←</span>
    </Link>
  );
}