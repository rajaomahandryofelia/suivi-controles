import type { Utilisateur } from "../../../types";
import MenuDemande from "./MenuDemande";
import { initiales, nomAffiche } from "../outils";

// Une ligne de la liste des demandes d'inscription
export default function LigneDemande({
  demande,
  desactive,
  onConsulter,
  onAccepter,
  onRefuser,
}: {
  demande: Utilisateur;
  desactive: boolean;
  onConsulter: () => void;
  onAccepter: () => void;
  onRefuser: () => void;
}) {
  return (
    <div className="tdb-demande">
      <div className="tdb-avatar" aria-hidden="true">{initiales(demande)}</div>
      <div className="tdb-demande-infos">
        <strong>{nomAffiche(demande)}</strong>
        <span>
          {demande.matricule ? `Matricule ${demande.matricule} · ` : ""}
          {demande.email || "pas d'e-mail"}
          {demande.telephone ? ` · ${demande.telephone}` : ""}
        </span>
      </div>
      <div className="tdb-demande-actions">
        <MenuDemande
          nom={nomAffiche(demande)}
          desactive={desactive}
          onConsulter={onConsulter}
          onAccepter={onAccepter}
          onRefuser={onRefuser}
        />
      </div>
    </div>
  );
}