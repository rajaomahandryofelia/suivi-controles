import { useCallback, useEffect, useState } from "react";
import api from "../../api/client";
import CarteCritere from "./CarteCritere";
import { messagesErreur, obtenirPosition } from "./outils";
import type { Critere, GrilleOuverte, Mission, PhotoReponse, Reponse, Saisie } from "./types";

interface Props {
  mission: Mission;
  onNotifier: (type: "succes" | "erreur", texte: string) => void;
  onRetour: () => void;
  onCloturer: () => void;
}

const VIDE: Saisie = { valeur: "", conforme: null, commentaire: "" };

// Un critère est répondu quand il a une valeur et un verdict
function estRepondu(s: Saisie) {
  return s.valeur.trim() !== "" && s.conforme !== null;
}

export default function FormulaireGrille({ mission, onNotifier, onRetour, onCloturer }: Props) {
  const [criteres, setCriteres] = useState<Critere[]>([]);
  const [saisies, setSaisies] = useState<Record<number, Saisie>>({});
  const [photos, setPhotos] = useState<Record<number, PhotoReponse[]>>({});
  const [nouvelles, setNouvelles] = useState<Record<number, File[]>>({});
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    const reponse = await api.get<GrilleOuverte>(`/controles/missions/${mission.id}/grille/`);
    const s: Record<number, Saisie> = {};
    const p: Record<number, PhotoReponse[]> = {};
    reponse.data.reponses.forEach((r: Reponse) => {
      s[r.critere] = { valeur: r.valeur, conforme: r.est_conforme, commentaire: r.commentaire };
      p[r.critere] = r.photos;
    });
    setCriteres(reponse.data.criteres);
    setSaisies(s);
    setPhotos(p);
    setNouvelles({});
  }, [mission.id]);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        await charger();
      } catch (e) {
        if (actif) setErreur(messagesErreur(e, "Impossible d'ouvrir la grille."));
      } finally {
        if (actif) setChargement(false);
      }
    })();
    return () => {
      actif = false;
    };
  }, [charger]);

  const saisieDe = (id: number) => saisies[id] ?? VIDE;

  const obligatoires = criteres.filter((c) => c.est_obligatoire);
  const obligatoiresRepondus = obligatoires.filter((c) => estRepondu(saisieDe(c.id))).length;
  const pourcentage =
    obligatoires.length > 0 ? Math.round((obligatoiresRepondus / obligatoires.length) * 100) : 100;

  // Un critère jugé non conforme doit être prouvé par au moins une photo (déjà envoyée ou à envoyer)
  const sansPhoto = criteres.filter(
    (c) =>
      saisieDe(c.id).conforme === false &&
      (photos[c.id]?.length ?? 0) + (nouvelles[c.id]?.length ?? 0) === 0
  );

  async function enregistrer(): Promise<boolean> {
    setErreur("");

    const reponses = criteres
      .filter((c) => estRepondu(saisieDe(c.id)))
      .map((c) => {
        const s = saisieDe(c.id);
        return {
          critere: c.id,
          valeur: s.valeur.trim(),
          est_conforme: s.conforme as boolean,
          commentaire: s.commentaire.trim(),
        };
      });

    const photoSansReponse = criteres.find(
      (c) => !estRepondu(saisieDe(c.id)) && (nouvelles[c.id]?.length ?? 0) > 0
    );
    if (photoSansReponse) {
      setErreur(`Répondez d'abord au critère « ${photoSansReponse.libelle} » avant d'y joindre une photo.`);
      return false;
    }
    if (reponses.length === 0) {
      setErreur("Répondez à au moins un critère avant d'enregistrer.");
      return false;
    }

    setEnvoi(true);
    try {
      const resultat = await api.post<Reponse[]>(`/controles/missions/${mission.id}/grille/`, {
        reponses,
      });

      // La position du contrôleur est enregistrée avec les photos : preuve qu'il est sur le site.
      // Si le GPS ne répond pas, les photos sont envoyées quand même (sans position).
      let position: { latitude: string; longitude: string } | null = null;
      if (criteres.some((c) => (nouvelles[c.id]?.length ?? 0) > 0)) {
        try {
          position = await obtenirPosition();
        } catch {
          position = null;
        }
      }

      // Les photos se joignent aux réponses qui viennent d'être enregistrées
      for (const critere of criteres) {
        const fichiers = nouvelles[critere.id] ?? [];
        const reponse = resultat.data.find((r) => r.critere === critere.id);
        if (!reponse) continue;
        for (const fichier of fichiers) {
          const formulaire = new FormData();
          formulaire.append("reponse", String(reponse.id));
          formulaire.append("fichier", fichier);
          if (position) {
            formulaire.append("latitude", position.latitude);
            formulaire.append("longitude", position.longitude);
          }
          await api.post(`/controles/missions/${mission.id}/photos/`, formulaire);
        }
      }

      await charger();
      onNotifier(
        "succes",
        sansPhoto.length > 0
          ? "La grille a été enregistrée. Il reste des photos à joindre pour les critères non conformes."
          : "La grille a été enregistrée."
      );
      return true;
    } catch (e) {
      setErreur(messagesErreur(e, "La grille n'a pas pu être enregistrée."));
      return false;
    } finally {
      setEnvoi(false);
    }
  }

  async function enregistrerEtCloturer() {
    // Pas de clôture tant qu'un constat de non-conformité n'est pas prouvé par une photo
    if (sansPhoto.length > 0) {
      setErreur(
        `Ajoutez au moins une photo pour chaque critère non conforme avant de clôturer : ${sansPhoto
          .map((c) => `« ${c.libelle} »`)
          .join(", ")}.`
      );
      return;
    }
    if (await enregistrer()) onCloturer();
  }

  if (chargement) {
    return (
      <div className="mis-chargement">
        <span className="mis-spinner" aria-hidden="true" />
        Ouverture de la grille…
      </div>
    );
  }

  return (
    <div>
      {erreur && (
        <div className="ile-erreur" role="alert">
          {erreur}
        </div>
      )}

      <div className="gri-progression">
        <div className="gri-progression-texte">
          <span>
            {obligatoires.length > 0
              ? `Critères obligatoires : ${obligatoiresRepondus} sur ${obligatoires.length}`
              : "Aucun critère obligatoire"}
          </span>
          <span>{pourcentage} %</span>
        </div>
        <div
          className="gri-barre"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pourcentage}
        >
          <span style={{ width: `${pourcentage}%` }} />
        </div>
      </div>

      {sansPhoto.length > 0 && (
        <div className="gri-alerte" role="status">
          <p>
            Photo obligatoire : ces critères sont non conformes et n'ont pas encore de photo. La photo
            prouve le constat devant le partenaire.
          </p>
          <ul>
            {sansPhoto.map((c) => (
              <li key={c.id}>{c.libelle}</li>
            ))}
          </ul>
        </div>
      )}

      {criteres.length === 0 ? (
        <p className="mis-vide">Cette grille ne contient aucun critère.</p>
      ) : (
        <ol className="gri-liste">
          {criteres.map((c, index) => (
            <CarteCritere
              key={c.id}
              numero={index + 1}
              critere={c}
              saisie={saisieDe(c.id)}
              photosEnregistrees={photos[c.id] ?? []}
              nouvellesPhotos={nouvelles[c.id] ?? []}
              desactive={envoi}
              onChange={(s) => setSaisies((courant) => ({ ...courant, [c.id]: s }))}
              onAjouterPhotos={(fichiers) =>
                setNouvelles((courant) => ({
                  ...courant,
                  [c.id]: [...(courant[c.id] ?? []), ...fichiers],
                }))
              }
              onRetirerPhoto={(i) =>
                setNouvelles((courant) => ({
                  ...courant,
                  [c.id]: (courant[c.id] ?? []).filter((_, position) => position !== i),
                }))
              }
            />
          ))}
        </ol>
      )}

      <div className="ile-actions gri-actions">
        <button type="button" className="bouton secondaire" onClick={onRetour} disabled={envoi}>
          Retour
        </button>
        <button type="button" className="bouton secondaire" onClick={() => enregistrer()} disabled={envoi}>
          {envoi ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className="bouton" onClick={enregistrerEtCloturer} disabled={envoi}>
          Enregistrer et clôturer
        </button>
      </div>
    </div>
  );
}