/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import client from "../api/client";
import ConfirmationDeconnexion from "../components/ConfirmationDeconnexion";
import type { Utilisateur } from "../types";

interface AuthContextType {
  utilisateur: Utilisateur | null;
  estDirecteur: boolean;
  seConnecter: (username: string, password: string) => Promise<void>;
  seDeconnecter: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Indicateur (horodatage) posé à la déconnexion : la page de connexion s'en sert pour
// afficher « Déconnexion réussie ». Ce n'est ni un jeton ni une donnée sensible.
export const CLE_DECONNEXION = "deconnexion_reussie";

function lireUtilisateurStocke(): Utilisateur | null {
  try {
    const brut = localStorage.getItem("utilisateur");
    return brut ? (JSON.parse(brut) as Utilisateur) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(
    lireUtilisateurStocke
  );

  // Fenêtre « Êtes-vous sûr de vouloir vous déconnecter ? » (purement visuelle)
  const [confirmationOuverte, setConfirmationOuverte] = useState(false);
  const reponseConfirmation = useRef<((confirme: boolean) => void) | null>(null);

  // Ouvre la fenêtre et attend la réponse de l'utilisateur (true = « Oui », false = « Non »)
  function demanderConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      reponseConfirmation.current = resolve;
      setConfirmationOuverte(true);
    });
  }

  function repondre(confirme: boolean) {
    setConfirmationOuverte(false);
    reponseConfirmation.current?.(confirme);
    reponseConfirmation.current = null;
  }

  // Ton `authentifier(login, motDePasse)` puis `ouvrirSession(utilisateur)`
  async function seConnecter(username: string, password: string) {
    const reponse = await client.post("/auth/connexion/", { username, password });
    localStorage.setItem("jeton", reponse.data.token);
    localStorage.setItem("utilisateur", JSON.stringify(reponse.data.utilisateur));
    setUtilisateur(reponse.data.utilisateur);
  }

  async function seDeconnecter() {
    // Une confirmation est déjà affichée : on ignore le clic supplémentaire
    if (reponseConfirmation.current) return new Promise<void>(() => {});

    const confirme = await demanderConfirmation();
    if (!confirme) {
      // « Non » : la déconnexion n'a pas lieu. La promesse reste volontairement en attente
      // pour que le code appelant (ex. navigate("/connexion") après l'await) ne s'exécute pas.
      return new Promise<void>(() => {});
    }

    try {
      await client.post("/auth/deconnexion/");
    } finally {
      localStorage.removeItem("jeton");
      localStorage.removeItem("utilisateur");
      try {
        sessionStorage.setItem(CLE_DECONNEXION, String(Date.now()));
      } catch {
        /* stockage indisponible : on ignore, la déconnexion reste valide */
      }
      setUtilisateur(null);
    }
  }

  const estDirecteur = utilisateur?.role === "DIRECTEUR";

  return (
    <AuthContext.Provider
      value={{ utilisateur, estDirecteur, seConnecter, seDeconnecter }}
    >
      {children}
      {confirmationOuverte && (
        <ConfirmationDeconnexion
          onAnnuler={() => repondre(false)}
          onConfirmer={() => repondre(true)}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexte = useContext(AuthContext);
  if (!contexte) {
    throw new Error("useAuth doit être utilisé dans un AuthProvider");
  }
  return contexte;
}