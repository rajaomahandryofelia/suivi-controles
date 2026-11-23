import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Utilisateur } from "../../types";
import { messagesErreur, nomComplet } from "./outils";
import type { Modele, Site } from "./types";
import "./Attribution.css";

export interface DonneesAttribution {
  controleur: number;
  date_prevue: string;
  heure_prevue: string;
  date_fin_prevue: string;
  heure_fin_prevue: string;
  etapes: { site: number; modele_grille?: number }[];
  depart: string;
  transport: string;
  derogation_convention: boolean;
  motif_derogation: string;
}

interface Props {
  sites: Site[];
  modeles: Modele[];
  controleurs: Utilisateur[];
  aujourdhui: string;
  onEnvoyer: (donnees: DonneesAttribution) => Promise<void>;
  onAnnuler: () => void;
}

// Un site choisi pour la mission ; modeleId vide = grille choisie automatiquement
interface EtapeChoisie {
  siteId: number;
  modeleId: string;
}

export default function FormulaireAttribution({
  sites,
  modeles,
  controleurs,
  aujourdhui,
  onEnvoyer,
  onAnnuler,
}: Props) {
  const [controleurId, setControleurId] = useState("");
  const [datePrevue, setDatePrevue] = useState("");
  const [heurePrevue, setHeurePrevue] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [heureFin, setHeureFin] = useState("");
  const [etapes, setEtapes] = useState<EtapeChoisie[]>([]);
  const [depart, setDepart] = useState("");
  const [transport, setTransport] = useState("");
  const [derogation, setDerogation] = useState(false);
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");

  const sitesDisponibles = useMemo(
    () => sites.filter((s) => !etapes.some((e) => e.siteId === s.id)),
    [sites, etapes]
  );

  function ajouterSite(valeur: string) {
    if (!valeur) return;
    setEtapes((liste) => [...liste, { siteId: Number(valeur), modeleId: "" }]);
  }

  function retirerSite(siteId: number) {
    setEtapes((liste) => liste.filter((e) => e.siteId !== siteId));
  }

  function choisirModele(siteId: number, modeleId: string) {
    setEtapes((liste) => liste.map((e) => (e.siteId === siteId ? { ...e, modeleId } : e)));
  }

  // La date de fin suit la date de début tant qu'elle n'est pas cohérente
  function choisirDateDebut(valeur: string) {
    setDatePrevue(valeur);
    if (!dateFin || dateFin < valeur) setDateFin(valeur);
  }

  // Aujourd'hui : l'heure de début ne peut pas être déjà passée
  const heureMinimum =
    datePrevue === aujourdhui ? new Date().toTimeString().slice(0, 5) : undefined;

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur("");

    if (etapes.length === 0) {
      setErreur("Ajoutez au moins un site à contrôler.");
      return;
    }
    if (dateFin < datePrevue) {
      setErreur("La date de fin ne peut pas précéder la date de début.");
      return;
    }
    if (dateFin === datePrevue && heureFin <= heurePrevue) {
      setErreur("L'heure de fin doit être après l'heure de début.");
      return;
    }
    if (derogation && !motif.trim()) {
      setErreur("Indiquez le motif de la dérogation.");
      return;
    }

    setEnvoi(true);
    try {
      await onEnvoyer({
        controleur: Number(controleurId),
        date_prevue: datePrevue,
        heure_prevue: heurePrevue,
        date_fin_prevue: dateFin,
        heure_fin_prevue: heureFin,
        etapes: etapes.map((e) => ({
          site: e.siteId,
          ...(e.modeleId ? { modele_grille: Number(e.modeleId) } : {}),
        })),
        depart: depart.trim(),
        transport: transport.trim(),
        derogation_convention: derogation,
        motif_derogation: derogation ? motif.trim() : "",
      });
      // Succès : le panneau se ferme, le bouton reste bloqué d'ici là
    } catch (e) {
      setErreur(messagesErreur(e, "La mission n'a pas pu être attribuée."));
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      {erreur && (
        <div className="ile-erreur" role="alert">
          {erreur}
        </div>
      )}

      <div className="mis-grille">
        <div className="champ mis-champ-large">
          <label htmlFor="att-controleur">Contrôleur chargé de la mission</label>
          <select
            id="att-controleur"
            value={controleurId}
            onChange={(e) => setControleurId(e.target.value)}
            required
          >
            <option value="">— Choisir un contrôleur —</option>
            {controleurs.map((c) => (
              <option key={c.id} value={c.id}>
                {nomComplet(c)}
              </option>
            ))}
          </select>
          {controleurs.length === 0 ? (
            <p className="mis-aide alerte">
              Aucun contrôleur actif. Acceptez d'abord une demande d'inscription.
            </p>
          ) : (
            <p className="mis-aide">
              Le contrôleur reçoit une notification, avec son ordre de mission et son ordre de
              route.
            </p>
          )}
        </div>

        <p className="mis-groupe">Début prévu</p>

        <div className="champ">
          <label htmlFor="att-date">Date</label>
          <input
            id="att-date"
            type="date"
            min={aujourdhui}
            value={datePrevue}
            onChange={(e) => choisirDateDebut(e.target.value)}
            required
          />
        </div>

        <div className="champ">
          <label htmlFor="att-heure">Heure</label>
          <input
            id="att-heure"
            type="time"
            min={heureMinimum}
            value={heurePrevue}
            onChange={(e) => setHeurePrevue(e.target.value)}
            required
          />
        </div>

        <p className="mis-groupe fin">Fin prévue</p>

        <div className="champ">
          <label htmlFor="att-date-fin">Date</label>
          <input
            id="att-date-fin"
            type="date"
            min={datePrevue || aujourdhui}
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            required
          />
        </div>

        <div className="champ">
          <label htmlFor="att-heure-fin">Heure</label>
          <input
            id="att-heure-fin"
            type="time"
            min={dateFin === datePrevue && heurePrevue ? heurePrevue : undefined}
            value={heureFin}
            onChange={(e) => setHeureFin(e.target.value)}
            required
          />
        </div>

        <p className="mis-groupe">Déplacement</p>

        <div className="champ">
          <label htmlFor="att-depart">Lieu de départ</label>
          <input
            id="att-depart"
            type="text"
            maxLength={255}
            placeholder="Ex. ORTM Anosy"
            value={depart}
            onChange={(e) => setDepart(e.target.value)}
            required
          />
        </div>

        <div className="champ">
          <label htmlFor="att-transport">Moyen de transport</label>
          <input
            id="att-transport"
            type="text"
            maxLength={100}
            placeholder="Ex. Véhicule de service"
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
            required
          />
        </div>

        <div className="champ mis-champ-large">
          <label htmlFor="att-ajout-site">Sites à contrôler</label>

          {etapes.length > 0 && (
            <ul className="att-liste">
              {etapes.map((etape) => {
                const site = sites.find((s) => s.id === etape.siteId);
                if (!site) return null;
                const possibles = modeles.filter((m) => m.type_site === site.type_site);
                return (
                  <li key={site.id} className="att-etape">
                    <div className="att-etape-site">
                      <strong>{site.nom}</strong>
                      <span>{site.type_site_libelle}</span>
                    </div>
                    <select
                      aria-label={`Grille de contrôle pour ${site.nom}`}
                      value={etape.modeleId}
                      onChange={(e) => choisirModele(site.id, e.target.value)}
                    >
                      <option value="">Grille automatique</option>
                      {possibles.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nom}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="att-retirer"
                      onClick={() => retirerSite(site.id)}
                      aria-label={`Retirer ${site.nom}`}
                      title="Retirer ce site"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <select
            id="att-ajout-site"
            value=""
            onChange={(e) => ajouterSite(e.target.value)}
            disabled={sitesDisponibles.length === 0}
          >
            <option value="">
              {sitesDisponibles.length === 0
                ? sites.length === 0
                  ? "Aucun site actif"
                  : "Tous les sites sont déjà ajoutés"
                : "+ Ajouter un site"}
            </option>
            {sitesDisponibles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom} ({s.type_site_libelle})
              </option>
            ))}
          </select>
          <p className="mis-aide">
            L'ordre de passage est calculé automatiquement : sites les plus risqués d'abord, sans
            rallonger inutilement le trajet.
          </p>
        </div>

        <div className="champ mis-champ-large">
          <label className="att-case">
            <input
              type="checkbox"
              checked={derogation}
              onChange={(e) => setDerogation(e.target.checked)}
            />
            Passer outre l'absence de convention active (dérogation du Directeur)
          </label>
          {derogation && (
            <>
              <label htmlFor="att-motif">Motif de la dérogation</label>
              <input
                id="att-motif"
                type="text"
                maxLength={500}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                required
              />
            </>
          )}
        </div>
      </div>

      <div className="ile-actions">
        <button type="button" className="bouton secondaire" onClick={onAnnuler} disabled={envoi}>
          Annuler
        </button>
        <button type="submit" className="bouton" disabled={envoi || etapes.length === 0}>
          {envoi ? "Attribution…" : "Attribuer la mission"}
        </button>
      </div>
    </form>
  );
}