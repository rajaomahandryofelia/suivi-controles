import { useState } from "react";
import type { FormEvent } from "react";
import {
  GRAVITES,
  MOYENS,
  formaterDate,
  formaterDateHeure,
  libelleStatut,
  retardTexte,
} from "./outils";
import type { Evenement, MoyenRelance, NonConformite } from "./types";
import "./Relance.css";

interface Props {
  nc: NonConformite;
  estDirecteur: boolean;
  enCours: boolean;
  onCorriger: () => void;
  // Renvoie true quand la relance est enregistrée
  onRelancer: (moyen: MoyenRelance, commentaire: string) => Promise<boolean>;
  onFermer: () => void;
}

// Une ligne du parcours déjà vécu : constat, relance, correction, vérification, réouverture
function LigneEvenement({ e }: { e: Evenement }) {
  const titre = e.moyen_libelle ? `${e.type_libelle} · ${e.moyen_libelle}` : e.type_libelle;
  return (
    <li className={e.type === "ROUVERTE" ? "retard" : "fait"}>
      <span className="nc-etape-point" aria-hidden="true" />
      <div>
        <strong>{titre}</strong>
        <span>
          {formaterDateHeure(e.date)}
          {e.auteur_nom ? ` · ${e.auteur_nom}` : ""}
        </span>
        {e.commentaire && <em className="nc-etape-note">{e.commentaire}</em>}
      </div>
    </li>
  );
}

/** Contenu du panneau : le parcours d'une non-conformité, du constat à la vérification. */
export default function DetailNonConformite({
  nc,
  estDirecteur,
  enCours,
  onCorriger,
  onRelancer,
  onFermer,
}: Props) {
  const [moyen, setMoyen] = useState<MoyenRelance>("TELEPHONE");
  const [commentaire, setCommentaire] = useState("");

  const ouverte = nc.statut === "OUVERTE";
  const peutAgir = estDirecteur && ouverte;
  const verifiee = nc.statut === "VERIFIEE";

  async function relancer(evenement: FormEvent) {
    evenement.preventDefault();
    const reussi = await onRelancer(moyen, commentaire.trim());
    if (reussi) setCommentaire("");
  }

  return (
    <div>
      <div className="nc-badges">
        <span className={`nc-gravite ${nc.gravite}`}>
          <i aria-hidden="true" />
          {GRAVITES[nc.gravite]}
        </span>
        <span className={`nc-statut ${nc.statut}`}>{libelleStatut(nc, estDirecteur)}</span>
        {nc.en_retard && <span className="nc-retard">{retardTexte(nc.jours_de_retard)}</span>}
        {nc.nombre_reouvertures > 0 && (
          <span className="nc-retard" title="La correction annoncée n'a pas été confirmée sur place">
            Récidive ×{nc.nombre_reouvertures}
          </span>
        )}
      </div>

      <div className="nc-constat-detail">
        <strong>Constat</strong>
        <p>{nc.description}</p>
      </div>

      {nc.photos.length > 0 && (
        <div className="nc-photos-bloc">
          <strong>
            {nc.photos.length > 1 ? `${nc.photos.length} photos du constat` : "Photo du constat"}
          </strong>
          <ul className="nc-photos">
            {nc.photos.map((photo) => (
              <li key={photo.id}>
                <a href={photo.url} target="_blank" rel="noopener noreferrer">
                  <img src={photo.url} alt={photo.legende || "Photo du constat"} loading="lazy" />
                </a>
                {photo.legende && <span>{photo.legende}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Le parcours réel, ligne par ligne, puis ce qui reste à faire */}
      <ol className="nc-etapes" aria-label="Parcours de la non-conformité">
        {nc.historique.length === 0 && (
          // Non-conformités créées avant l'historique : on garde la ligne du constat
          <li className="fait">
            <span className="nc-etape-point" aria-hidden="true" />
            <div>
              <strong>Constatée</strong>
              <span>
                {formaterDate(nc.date_detection)} · par {nc.detecte_par}
              </span>
            </div>
          </li>
        )}

        {nc.historique.map((e) => (
          <LigneEvenement key={e.id} e={e} />
        ))}

        {ouverte && (
          <li className={nc.en_retard ? "retard" : "attente"}>
            <span className="nc-etape-point" aria-hidden="true" />
            <div>
              <strong>Réparation par le partenaire</strong>
              <span>À réparer avant le {formaterDate(nc.date_limite_correction)}</span>
            </div>
          </li>
        )}

        {!verifiee && (
          <li className={ouverte ? "futur" : "attente"}>
            <span className="nc-etape-point" aria-hidden="true" />
            <div>
              <strong>Vérification sur place</strong>
              <span>
                {nc.prochain_controle
                  ? `Au prochain contrôle, prévu le ${formaterDate(nc.prochain_controle)}`
                  : "Au prochain contrôle du site (aucun n'est encore planifié)"}
              </span>
            </div>
          </li>
        )}
      </ol>

      <dl className="nc-infos">
        <div className="nc-info">
          <dt>Site</dt>
          <dd>
            {nc.site_nom}
            <small>{nc.site_localisation}</small>
          </dd>
        </div>
        <div className="nc-info">
          <dt>Critère de la grille</dt>
          <dd>{nc.critere_libelle}</dd>
        </div>
        {estDirecteur && (
          <div className="nc-info large">
            <dt>Partenaire à contacter</dt>
            <dd>
              {nc.partenaire_nom ? (
                <>
                  {nc.partenaire_nom}
                  {nc.partenaire_contact && <small>{nc.partenaire_contact}</small>}
                  {nc.partenaire_telephone && (
                    <a href={`tel:${nc.partenaire_telephone.replace(/\s/g, "")}`}>
                      {nc.partenaire_telephone}
                    </a>
                  )}
                  {nc.partenaire_email && (
                    <a href={`mailto:${nc.partenaire_email}`}>{nc.partenaire_email}</a>
                  )}
                </>
              ) : (
                <small>Aucun partenaire n'est associé à ce site.</small>
              )}
            </dd>
          </div>
        )}
      </dl>

      {/* Le Directeur note chaque contact avec le partenaire */}
      {peutAgir && (
        <form className="nc-relance" onSubmit={relancer}>
          <strong>Noter une relance du partenaire</strong>
          <p>
            {nc.nb_relances === 0
              ? "Aucune relance enregistrée pour l'instant."
              : `${nc.nb_relances} relance${nc.nb_relances > 1 ? "s" : ""} enregistrée${
                  nc.nb_relances > 1 ? "s" : ""
                }, la dernière le ${formaterDate(nc.derniere_relance)}.`}
          </p>
          <div className="nc-relance-champs">
            <label>
              <span>Moyen</span>
              <select
                value={moyen}
                onChange={(e) => setMoyen(e.target.value as MoyenRelance)}
                disabled={enCours}
              >
                {MOYENS.map((m) => (
                  <option key={m.valeur} value={m.valeur}>
                    {m.libelle}
                  </option>
                ))}
              </select>
            </label>
            <label className="nc-relance-large">
              <span>Ce qui a été dit</span>
              <input
                type="text"
                maxLength={500}
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Ex. Appelé le responsable, il promet une réparation sous 8 jours"
                disabled={enCours}
              />
            </label>
          </div>
          <button type="submit" className="bouton nc-secondaire" disabled={enCours}>
            {enCours ? "Enregistrement…" : "Enregistrer la relance"}
          </button>
        </form>
      )}

      {nc.statut === "CORRIGEE" && (
        <p className="nc-note">
          {estDirecteur
            ? "Elle passera à « Vérifiée » quand le rapport du prochain contrôle sera validé, si le critère est alors conforme. Sinon, elle redeviendra « Ouverte »."
            : "Contrôlez ce point sur place : répondez au critère dans la grille. Il sera vérifié à la validation de votre rapport."}
        </p>
      )}
      {peutAgir && (
        <p className="nc-note">
          Quand le partenaire confirme avoir réparé, marquez la non-conformité comme corrigée : le
          contrôleur en sera prévenu.
        </p>
      )}

      <div className="nc-actions">
        {nc.rapport_pdf && (
          <a
            className="bouton nc-secondaire nc-pdf"
            href={nc.rapport_pdf}
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir le rapport PDF
          </a>
        )}
        {peutAgir && (
          <button type="button" className="bouton" disabled={enCours} onClick={onCorriger}>
            {enCours ? "Enregistrement…" : "Marquer comme corrigée"}
          </button>
        )}
        <button type="button" className="bouton nc-secondaire" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </div>
  );
}