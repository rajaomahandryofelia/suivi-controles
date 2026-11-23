import { useState } from "react";
import type { ChangeEvent } from "react";
import { urlMedia } from "./outils";
import type { Critere, PhotoReponse, Saisie } from "./types";
import "./PhotoObligatoire.css";

const MAX_PHOTOS = 4;

interface Props {
  numero: number;
  critere: Critere;
  saisie: Saisie;
  photosEnregistrees: PhotoReponse[];
  nouvellesPhotos: File[];
  desactive: boolean;
  onChange: (saisie: Saisie) => void;
  onAjouterPhotos: (fichiers: File[]) => void;
  onRetirerPhoto: (index: number) => void;
}

// Deux boutons : conforme / non conforme
function Choix({
  conforme,
  desactive,
  onChoisir,
}: {
  conforme: boolean | null;
  desactive: boolean;
  onChoisir: (conforme: boolean) => void;
}) {
  return (
    <div className="gri-choix" role="group" aria-label="Verdict">
      <button
        type="button"
        className={`oui${conforme === true ? " choisi" : ""}`}
        aria-pressed={conforme === true}
        disabled={desactive}
        onClick={() => onChoisir(true)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12l5 5 9-10" />
        </svg>
        Conforme
      </button>
      <button
        type="button"
        className={`non${conforme === false ? " choisi" : ""}`}
        aria-pressed={conforme === false}
        disabled={desactive}
        onClick={() => onChoisir(false)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
        Non conforme
      </button>
    </div>
  );
}

export default function CarteCritere({
  numero,
  critere,
  saisie,
  photosEnregistrees,
  nouvellesPhotos,
  desactive,
  onChange,
  onAjouterPhotos,
  onRetirerPhoto,
}: Props) {
  const [commentaireOuvert, setCommentaireOuvert] = useState(false);

  const etat = saisie.conforme === true ? "conforme" : saisie.conforme === false ? "non-conforme" : "";
  const commentaireVisible =
    commentaireOuvert || saisie.commentaire !== "" || saisie.conforme === false;
  const totalPhotos = photosEnregistrees.length + nouvellesPhotos.length;
  // Un critère non conforme doit être prouvé par au moins une photo
  const photoManquante = saisie.conforme === false && totalPhotos === 0;

  // Pour une question Oui / Non, la réponse est le verdict lui-même
  const verdictOuiNon = saisie.valeur === "OUI" ? true : saisie.valeur === "NON" ? false : null;

  // Pour une note ou une observation : dès qu'il y a une valeur, « conforme » est proposé par défaut
  function changerValeur(valeur: string) {
    const conforme = valeur.trim() === "" ? null : (saisie.conforme ?? true);
    onChange({ ...saisie, valeur, conforme });
  }

  function ajouter(e: ChangeEvent<HTMLInputElement>) {
    const fichiers = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - totalPhotos);
    if (fichiers.length > 0) onAjouterPhotos(fichiers);
    e.target.value = "";
  }

  return (
    <li className={`gri-carte ${etat}${photoManquante ? " sans-photo" : ""}`}>
      <div className="gri-carte-tete">
        <span className="gri-numero" aria-hidden="true">
          {numero}
        </span>
        <p className="gri-libelle">{critere.libelle}</p>
        {critere.est_obligatoire && <span className="gri-oblig">Obligatoire</span>}
        {photoManquante && <span className="gri-badge-photo">Photo requise</span>}
      </div>

      {critere.type_reponse === "OUI_NON" && (
        <Choix
          conforme={verdictOuiNon}
          desactive={desactive}
          onChoisir={(c) => onChange({ ...saisie, valeur: c ? "OUI" : "NON", conforme: c })}
        />
      )}

      {critere.type_reponse === "NOTE" && (
        <>
          <input
            className="gri-entree"
            type="number"
            step="0.1"
            inputMode="decimal"
            placeholder="Saisir la note"
            aria-label={`Note pour : ${critere.libelle}`}
            value={saisie.valeur}
            disabled={desactive}
            onChange={(e) => changerValeur(e.target.value)}
          />
          {saisie.valeur.trim() !== "" && (
            <Choix
              conforme={saisie.conforme}
              desactive={desactive}
              onChoisir={(c) => onChange({ ...saisie, conforme: c })}
            />
          )}
        </>
      )}

      {critere.type_reponse === "TEXTE" && (
        <>
          <textarea
            className="gri-entree"
            rows={2}
            maxLength={255}
            placeholder="Décrire ce que vous observez"
            aria-label={`Observation pour : ${critere.libelle}`}
            value={saisie.valeur}
            disabled={desactive}
            onChange={(e) => changerValeur(e.target.value)}
          />
          {saisie.valeur.trim() !== "" && (
            <Choix
              conforme={saisie.conforme}
              desactive={desactive}
              onChoisir={(c) => onChange({ ...saisie, conforme: c })}
            />
          )}
        </>
      )}

      {commentaireVisible ? (
        <textarea
          className="gri-entree gri-commentaire"
          rows={2}
          maxLength={500}
          placeholder={
            saisie.conforme === false
              ? "Précisez le problème constaté (facultatif)"
              : "Commentaire (facultatif)"
          }
          aria-label="Commentaire"
          value={saisie.commentaire}
          disabled={desactive}
          onChange={(e) => onChange({ ...saisie, commentaire: e.target.value })}
        />
      ) : (
        <button type="button" className="gri-lien" onClick={() => setCommentaireOuvert(true)}>
          + Ajouter un commentaire
        </button>
      )}

      {photoManquante && (
        <p className="gri-photo-alerte" role="alert">
          Prenez une photo du problème : elle prouve le constat devant le partenaire.
        </p>
      )}

      <div className="gri-photos">
        {photosEnregistrees.map((p) => (
          <a key={p.id} className="gri-vignette" href={urlMedia(p.fichier)} target="_blank" rel="noopener noreferrer">
            <img src={urlMedia(p.fichier)} alt="Photo enregistrée" loading="lazy" />
          </a>
        ))}

        {nouvellesPhotos.map((f, i) => (
          <span key={`${f.name}-${i}`} className="gri-puce">
            {f.name}
            <button type="button" onClick={() => onRetirerPhoto(i)} aria-label={`Retirer ${f.name}`} disabled={desactive}>
              ×
            </button>
          </span>
        ))}

        {totalPhotos < MAX_PHOTOS && (
          <label className="gri-ajout-photo">
            {/* « capture » ouvre directement l'appareil photo du téléphone (sur ordinateur : choix d'un fichier) */}
            <input type="file" accept="image/*" capture="environment" onChange={ajouter} disabled={desactive} />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            {photoManquante ? "Prendre la photo" : "Photo"}
          </label>
        )}
      </div>
    </li>
  );
}