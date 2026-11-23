import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { SuiviContext } from "./contexte";
import { useSuiviTrajet } from "./useSuiviTrajet";

// Suit la mission en cours du contrôleur connecté. Le Directeur n'est jamais suivi.
export default function SuiviTrajet({ children }: { children: ReactNode }) {
  const { utilisateur, estDirecteur } = useAuth();
  const etat = useSuiviTrajet(Boolean(utilisateur) && !estDirecteur);
  return <SuiviContext.Provider value={etat}>{children}</SuiviContext.Provider>;
}