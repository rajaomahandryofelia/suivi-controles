import { useCallback, useEffect, useState } from "react";
import api from "../../../api/client";
import type { Utilisateur } from "../../../types";
import { nomAffiche } from "../outils";

/**
 * Gère les demandes d'inscription (réservées au directeur) :
 * chargement de la liste, acceptation et refus.
 */
export function useDemandesInscription(estDirecteur: boolean) {
  const [demandes, setDemandes] = useState<Utilisateur[]>([]);
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState("");
  const [enCours, setEnCours] = useState<number | null>(null);

  const charger = useCallback(async () => {
    if (!estDirecteur) return;
    try {
      const reponse = await api.get("/auth/demandes/");
      setDemandes(reponse.data);
    } catch {
      setErreur("Impossible de charger le tableau de bord.");
    }
  }, [estDirecteur]);

  useEffect(() => {
    charger();
  }, [charger]);

  const retirer = (id: number) =>
    setDemandes((liste) => liste.filter((d) => d.id !== id));

  const accepter = useCallback(async (u: Utilisateur) => {
    setErreur("");
    setSucces("");
    setEnCours(u.id);
    try {
      const r = await api.post(`/auth/demandes/${u.id}/accepter/`);
      retirer(u.id);
      setSucces(
        r.data.email_envoye
          ? `Le compte de ${nomAffiche(u)} est accepté. Un e-mail vient de lui être envoyé.`
          : `Le compte de ${nomAffiche(u)} est accepté, mais aucun e-mail n'a pu être envoyé (adresse manquante ou erreur d'envoi).`
      );
    } catch {
      setErreur("L'acceptation a échoué. Réessayez.");
    } finally {
      setEnCours(null);
    }
  }, []);

  const refuser = useCallback(async (u: Utilisateur) => {
    if (!window.confirm(`Refuser et supprimer la demande de ${nomAffiche(u)} ?`)) return;
    setErreur("");
    setSucces("");
    setEnCours(u.id);
    try {
      await api.post(`/auth/demandes/${u.id}/refuser/`);
      retirer(u.id);
      setSucces(`La demande de ${nomAffiche(u)} a été refusée.`);
    } catch {
      setErreur("Le refus a échoué. Réessayez.");
    } finally {
      setEnCours(null);
    }
  }, []);

  return { demandes, erreur, succes, enCours, accepter, refuser };
}