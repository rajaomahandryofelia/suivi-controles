import { useState } from "react";
import api from "../../api/client";

interface Props {
  tourneeId: number;
  aOrdreMission: boolean;
  aOrdreRoute: boolean;
}

export default function TelechargerOrdres({ tourneeId, aOrdreMission, aOrdreRoute }: Props) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState("");

  async function ouvrir(chemin: "ordre-mission" | "ordre-route") {
    setEnCours(chemin);
    setErreur("");
    try {
      const reponse = await api.get(`/controles/tournees/${tourneeId}/${chemin}/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([reponse.data], { type: "application/pdf" }));
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      setErreur("Le document n'a pas pu être ouvert.");
    } finally {
      setEnCours(null);
    }
  }

  if (!aOrdreMission && !aOrdreRoute) return null;

  return (
    <div className="tou-documents">
      <div className="tou-actions">
        {aOrdreMission && (
          <button
            type="button"
            className="bouton secondaire"
            onClick={() => ouvrir("ordre-mission")}
            disabled={enCours !== null}
          >
            {enCours === "ordre-mission" ? "Ouverture…" : "Ordre de mission (PDF)"}
          </button>
        )}
        {aOrdreRoute && (
          <button
            type="button"
            className="bouton secondaire"
            onClick={() => ouvrir("ordre-route")}
            disabled={enCours !== null}
          >
            {enCours === "ordre-route" ? "Ouverture…" : "Ordre de route (PDF)"}
          </button>
        )}
      </div>
      {erreur && <p className="tou-ecart tou-ecart-pire">{erreur}</p>}
    </div>
  );
}