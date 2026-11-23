import { useCallback, useRef, useState } from "react";
import api from "../api/client";

export type EtatAction = "attente" | "envoi" | "confirmee" | "annulee";

/** Action proposée par Maki : rien n'est fait tant que l'utilisateur n'a pas confirmé. */
export interface ActionMaki {
  cle: string;
  type: "corriger_non_conformite" | "message_partenaire";
  numero: number;
  titre: string;
  lignes: string[];
  avertissement?: string | null;
  /** Brouillon de message (type « message_partenaire ») : rien n'est envoyé par la plateforme. */
  objet?: string;
  corps?: string;
  destinataire?: string;
  etat: EtatAction;
  erreur?: string;
}

type ActionRecue = Omit<ActionMaki, "cle" | "etat" | "erreur">;

export interface MessageChat {
  id: number;
  role: "user" | "assistant";
  texte: string;
  /** Message d'erreur affiché par Maki : jamais renvoyé au serveur. */
  erreur?: boolean;
  actions?: ActionMaki[];
}

function detailErreur(e: unknown, defaut: string): string {
  const donnees = (e as { response?: { data?: unknown } })?.response?.data;
  if (donnees && typeof donnees === "object") {
    const detail = (donnees as Record<string, unknown>).detail;
    if (typeof detail === "string") return detail;
  }
  return defaut;
}

/**
 * Exécute l'action confirmée en appelant l'API habituelle de la plateforme : ce sont donc
 * les mêmes règles et les mêmes droits que lorsqu'on utilise la page correspondante.
 * Renvoie la phrase de confirmation de Maki.
 */
async function appliquer(action: ActionMaki): Promise<string> {
  switch (action.type) {
    case "corriger_non_conformite":
      await api.post(`/controles/non-conformites/${action.numero}/corriger/`);
      return `C'est fait : la non-conformité n° ${action.numero} est marquée corrigée. Le contrôleur la vérifiera à son prochain contrôle.`;
    default:
      // Un brouillon de message ne s'exécute pas : on le copie ou on l'ouvre dans la messagerie
      throw new Error("Cette action ne se confirme pas.");
  }
}

/**
 * Conversation avec Maki. L'historique reste en mémoire (rien n'est stocké dans le navigateur) :
 * il est renvoyé au serveur à chaque question pour que Maki comprenne le fil de la discussion.
 */
export function useConversationMaki(surReponse: (texte: string) => void) {
  const [messages, setMessages] = useState<MessageChat[]>([]);
  const [enCours, setEnCours] = useState(false);

  const liste = useRef<MessageChat[]>([]);
  const compteur = useRef(0);
  const occupe = useRef(false);

  const publier = useCallback((suivante: MessageChat[]) => {
    liste.current = suivante;
    setMessages(suivante);
  }, []);

  const ajouter = useCallback(
    (message: Omit<MessageChat, "id">) => {
      compteur.current += 1;
      publier([...liste.current, { ...message, id: compteur.current }]);
    },
    [publier]
  );

  const modifierAction = useCallback(
    (idMessage: number, cle: string, changement: Partial<ActionMaki>) => {
      publier(
        liste.current.map((m) =>
          m.id !== idMessage
            ? m
            : {
                ...m,
                actions: m.actions?.map((a) => (a.cle === cle ? { ...a, ...changement } : a)),
              }
        )
      );
    },
    [publier]
  );

  const envoyer = useCallback(
    async (texte: string) => {
      const question = texte.trim();
      if (!question || occupe.current) return;
      occupe.current = true;

      ajouter({ role: "user", texte: question });
      setEnCours(true);
      try {
        const historique = liste.current
          .filter((m) => !m.erreur)
          .map((m) => ({ role: m.role, texte: m.texte }));
        const reponse = await api.post<{ reponse: string; actions?: ActionRecue[] }>(
          "/suivi/assistant/message/",
          { messages: historique }
        );

        compteur.current += 1;
        const idReponse = compteur.current;
        const actions: ActionMaki[] = (reponse.data.actions ?? []).map((a) => ({
          ...a,
          cle: `${a.type}-${a.numero}`,
          etat: "attente",
        }));
        publier([
          ...liste.current,
          { id: idReponse, role: "assistant", texte: reponse.data.reponse, actions },
        ]);
        surReponse(reponse.data.reponse);
      } catch (e) {
        ajouter({
          role: "assistant",
          texte: detailErreur(
            e,
            "Maki n'arrive pas à répondre pour l'instant. Vérifiez que le serveur est démarré."
          ),
          erreur: true,
        });
      } finally {
        setEnCours(false);
        occupe.current = false;
      }
    },
    [ajouter, publier, surReponse]
  );

  const confirmer = useCallback(
    async (idMessage: number, cle: string) => {
      const action = liste.current
        .find((m) => m.id === idMessage)
        ?.actions?.find((a) => a.cle === cle);
      if (!action || action.etat !== "attente") return;

      modifierAction(idMessage, cle, { etat: "envoi", erreur: undefined });
      try {
        const phrase = await appliquer(action);
        modifierAction(idMessage, cle, { etat: "confirmee" });
        ajouter({ role: "assistant", texte: phrase });
        surReponse(phrase);
      } catch (e) {
        modifierAction(idMessage, cle, {
          etat: "attente",
          erreur: detailErreur(e, "L'action n'a pas pu être effectuée."),
        });
      }
    },
    [ajouter, modifierAction, surReponse]
  );

  const annuler = useCallback(
    (idMessage: number, cle: string) => {
      modifierAction(idMessage, cle, { etat: "annulee", erreur: undefined });
    },
    [modifierAction]
  );

  const effacer = useCallback(() => {
    publier([]);
  }, [publier]);

  return { messages, enCours, envoyer, confirmer, annuler, effacer };
}