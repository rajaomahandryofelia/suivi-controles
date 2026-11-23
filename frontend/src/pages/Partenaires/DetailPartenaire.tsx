import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import api from "../../api/client";
import { messagesErreur } from "../Missions/outils";
import { extraireListe, formaterDate } from "../outilsListe";
import { URL_SITES } from "./types";
import type { Partenaire, SitePartenaire } from "./types";

interface Props {
  partenaire: Partenaire;
  onModifier: () => void;
  onSupprimer: () => Promise<void>;
  onFermer: () => void;
}

function Info({ label, large, children }: { label: string; large?: boolean; children: ReactNode }) {
  return (
    <div className={`sit-info${large ? " large" : ""}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function DetailPartenaire({ partenaire, onModifier, onSupprimer, onFermer }: Props) {
  const [sites, setSites] = useState<SitePartenaire[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreurSites, setErreurSites] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const [erreur, setErreur] = useState("");

  // Les sites de ce partenaire
  useEffect(() => {
    let actif = true;
    async function charger() {
      try {
        const reponse = await api.get(URL_SITES, { params: { partenaire: partenaire.id } });
        if (!actif) return;
        // Filtre de sécurité côté interface, au cas où le serveur renverrait tous les sites
        setSites(
          extraireListe<SitePartenaire>(reponse.data).filter((s) => s.partenaire === partenaire.id)
        );
      } catch {
        if (actif) setErreurSites("Impossible de charger les sites de ce partenaire.");
      } finally {
        if (actif) setChargement(false);
      }
    }
    charger();
    return () => {
      actif = false;
    };
  }, [partenaire.id]);

  async function supprimer() {
    setErreur("");
    setSuppression(true);
    try {
      await onSupprimer();
      // Succès : le panneau se ferme
    } catch (e) {
      setErreur(messagesErreur(e, "Le partenaire n'a pas pu être supprimé."));
      setSuppression(false);
      setConfirmation(false);
    }
  }

  const nombreSites = partenaire.nombre_sites ?? sites.length;

  return (
    <div>
      {erreur && (
        <div className="ile-erreur" role="alert">
          {erreur}
        </div>
      )}

      <dl className="sit-infos">
        <Info label="Personne à contacter">
          {partenaire.contact || <span className="lst-absent">Non renseignée</span>}
        </Info>
        <Info label="Téléphone">
          {partenaire.telephone ? (
            <a className="pat-lien" href={`tel:${partenaire.telephone}`}>
              {partenaire.telephone}
            </a>
          ) : (
            <span className="lst-absent">Non renseigné</span>
          )}
        </Info>
        <Info label="E-mail" large>
          {partenaire.email ? (
            <a className="pat-lien" href={`mailto:${partenaire.email}`}>
              {partenaire.email}
            </a>
          ) : (
            <span className="lst-absent">Non renseigné</span>
          )}
        </Info>
      </dl>

      <section className="sit-section">
        <h3 className="sit-section-titre">
          Sites
          <span className="sit-nombre">{nombreSites}</span>
        </h3>

        {erreurSites ? (
          <div className="ile-erreur" role="alert">
            {erreurSites}
          </div>
        ) : chargement ? (
          <div className="lst-chargement">
            <span className="lst-spinner" aria-hidden="true" />
            Chargement des sites…
          </div>
        ) : sites.length === 0 ? (
          <p className="sit-vide">Aucun site n'est rattaché à ce partenaire.</p>
        ) : (
          <div className="sit-mini-cadre">
            <table className="sit-mini">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Type</th>
                  <th>Dernier contrôle</th>
                  <th className="centre">Non-conformités</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => {
                  const ouvertes = s.non_conformites_ouvertes ?? 0;
                  return (
                    <tr key={s.id}>
                      <td className="lst-nom">
                        <strong>{s.nom}</strong>
                        <span>{s.localisation}</span>
                      </td>
                      <td>{s.type_site_libelle}</td>
                      <td>
                        {s.dernier_controle ? (
                          formaterDate(s.dernier_controle)
                        ) : (
                          <span className="lst-absent">Jamais contrôlé</span>
                        )}
                      </td>
                      <td className="centre">
                        <span className={`lst-compteur ${ouvertes > 0 ? "alerte" : "zero"}`}>
                          {ouvertes}
                        </span>
                      </td>
                      <td>
                        <span className={`lst-statut ${s.est_actif ? "actif" : "inactif"}`}>
                          {s.est_actif ? "Suivi" : "Non suivi"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {nombreSites > 0 && (
        <p className="pat-note">
          Ce partenaire a {nombreSites} site{nombreSites > 1 ? "s" : ""} : il ne peut pas être
          supprimé tant qu'il en a. Modifiez d'abord le partenaire de ses sites.
        </p>
      )}

      {confirmation ? (
        <div className="ile-confirmation">
          <p>Supprimer définitivement ce partenaire ?</p>
          <div className="ile-actions">
            <button
              type="button"
              className="bouton secondaire"
              onClick={() => setConfirmation(false)}
              disabled={suppression}
            >
              Annuler
            </button>
            <button type="button" className="bouton danger" onClick={supprimer} disabled={suppression}>
              {suppression ? "Suppression…" : "Oui, supprimer"}
            </button>
          </div>
        </div>
      ) : (
        <div className="ile-actions">
          <button type="button" className="bouton secondaire" onClick={onFermer}>
            Fermer
          </button>
          {nombreSites === 0 && (
            <button
              type="button"
              className="bouton secondaire sit-bouton-suppression"
              onClick={() => setConfirmation(true)}
            >
              Supprimer
            </button>
          )}
          <button type="button" className="bouton" onClick={onModifier}>
            Modifier
          </button>
        </div>
      )}
    </div>
  );
}