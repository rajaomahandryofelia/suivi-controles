import { useCallback, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { Utilisateur } from "../types";
import "./TableauDeBord.css";
import DemandesInscription from "./tableau-de-bord/demandes/DemandesInscription";
import FicheDemande from "./tableau-de-bord/demandes/FicheDemande";
import { useDemandesInscription } from "./tableau-de-bord/hooks/useDemandesInscription";
import { useStatistiques } from "./tableau-de-bord/hooks/useStatistiques";
import IleDynamique from "./tableau-de-bord/ile/IleDynamique";
import IndicateursControleur from "./tableau-de-bord/indicateurs/IndicateursControleur";
import SupervisionIncidents from "./tableau-de-bord/incidents/SupervisionIncidents";
import { nomAffiche } from "./tableau-de-bord/outils";
import "./tableau-de-bord/indicateurs/Indicateurs.css";

export default function TableauDeBord() {
  const { utilisateur, estDirecteur } = useAuth();

  const { stats, chargement, erreur: erreurStats } = useStatistiques();
  const {
    demandes,
    erreur: erreurDemandes,
    succes,
    enCours,
    accepter,
    refuser,
  } = useDemandesInscription(estDirecteur);

  const erreur = erreurDemandes || erreurStats;

  // État purement visuel : demande dont la fiche est ouverte
  const [demandeConsultee, setDemandeConsultee] = useState<Utilisateur | null>(null);
  const fermerFiche = useCallback(() => setDemandeConsultee(null), []);

  const dateDuJour = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Le bloc des demandes n'existe que s'il y en a : sinon il ne prend pas de place
  const blocDemandes =
    estDirecteur && demandes.length > 0 ? (
      <DemandesInscription
        demandes={demandes}
        enCours={enCours}
        onConsulter={setDemandeConsultee}
        onAccepter={accepter}
        onRefuser={refuser}
      />
    ) : null;

  return (
    <div>
      <IleDynamique
        nom={utilisateur ? nomAffiche(utilisateur) : ""}
        date={dateDuJour}
        estDirecteur={estDirecteur}
        nbDemandes={demandes.length}
      />

      {erreur && <div className="tdb-erreur" role="alert">{erreur}</div>}
      {succes && <div className="tdb-succes" role="status">{succes}</div>}

      {/* Directeur : les demandes d'inscription à traiter, puis la supervision des incidents */}
      {estDirecteur && (
        <>
          {blocDemandes}
          <SupervisionIncidents />
        </>
      )}

      {/* Contrôleur : ses indicateurs habituels */}
      {!estDirecteur && chargement && (
        <div className="tdb-chargement">
          <span className="tdb-spinner" aria-hidden="true" />
          Chargement…
        </div>
      )}
      {stats?.role === "CONTROLEUR" && <IndicateursControleur stats={stats} />}

      {demandeConsultee && (
        <FicheDemande
          demande={demandeConsultee}
          desactive={enCours === demandeConsultee.id}
          onFermer={fermerFiche}
          onAccepter={() => {
            fermerFiche();
            accepter(demandeConsultee);
          }}
          onRefuser={() => {
            fermerFiche();
            refuser(demandeConsultee);
          }}
        />
      )}
    </div>
  );
}