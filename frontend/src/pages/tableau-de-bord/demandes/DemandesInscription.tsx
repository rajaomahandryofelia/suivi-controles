import type { Utilisateur } from "../../../types";
import { IconePersonnes } from "../icones/Icones";
import LigneDemande from "./LigneDemande";
import "./Demandes.css";

// Carte « Demandes d'inscription » (réservée au Directeur)
interface Props {
  demandes: Utilisateur[];
  enCours: number | null;
  onConsulter: (demande: Utilisateur) => void;
  onAccepter: (demande: Utilisateur) => void;
  onRefuser: (demande: Utilisateur) => void;
}

export default function DemandesInscription({
  demandes,
  enCours,
  onConsulter,
  onAccepter,
  onRefuser,
}: Props) {
  return (
    <section className="tdb-carte">
      <div className="tdb-carte-tete">
        <div className="tdb-icone"><IconePersonnes /></div>
        <div>
          <h2>Demandes d'inscription</h2>
          <p>Contrôleurs en attente de validation de leur compte</p>
        </div>
        {demandes.length > 0 && <span className="tdb-badge">{demandes.length}</span>}
      </div>

      {demandes.length === 0 ? (
        <p className="tdb-vide">Aucune demande en attente.</p>
      ) : (
        <div className="tdb-demandes">
          {demandes.map((d) => (
            <LigneDemande
              key={d.id}
              demande={d}
              desactive={enCours === d.id}
              onConsulter={() => onConsulter(d)}
              onAccepter={() => onAccepter(d)}
              onRefuser={() => onRefuser(d)}
            />
          ))}
        </div>
      )}
    </section>
  );
}