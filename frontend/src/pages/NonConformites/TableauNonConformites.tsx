import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Origine } from "../../components/PanneauIle";
import { GRAVITES, echeanceTexte, libelleStatut, retardTexte } from "./outils";
import type { NonConformite } from "./types";
import "./ListeNC.css";

interface Props {
  lignes: NonConformite[];
  estDirecteur: boolean;
  enCoursId: number | null;
  onOuvrir: (nc: NonConformite, origine: Origine) => void;
  onCorriger: (nc: NonConformite) => void;
}

// Au-delà, les lignes d'un site se déplient à la demande
const LIMITE = 3;

// Ordre d'affichage dans une carte : ce qui reste à faire d'abord
const ORDRE_STATUT: Record<NonConformite["statut"], number> = {
  OUVERTE: 0,
  CORRIGEE: 1,
  VERIFIEE: 2,
};

/** Les non-conformités regroupées par site : une carte par site, lignes compactes. */
export default function TableauNonConformites({
  lignes,
  estDirecteur,
  enCoursId,
  onOuvrir,
  onCorriger,
}: Props) {
  const [deplies, setDeplies] = useState<Set<string>>(new Set());

  const groupes = useMemo(() => {
    const cle = (nc: NonConformite) => `${nc.site_nom}|${nc.site_localisation}`;

    const parSite = new Map<string, NonConformite[]>();
    for (const nc of lignes) {
      parSite.set(cle(nc), [...(parSite.get(cle(nc)) ?? []), nc]);
    }

    const liste = [...parSite.entries()].map(([k, items]) => {
      const verifiees = items.filter((i) => i.statut === "VERIFIEE").length;
      const corrigees = items.filter((i) => i.statut === "CORRIGEE").length;
      return {
        cle: k,
        nom: items[0].site_nom,
        localisation: items[0].site_localisation,
        // Ouvertes d'abord, puis en retard, puis la plus proche échéance
        items: items.slice().sort((a, b) => {
          if (a.statut !== b.statut) return ORDRE_STATUT[a.statut] - ORDRE_STATUT[b.statut];
          if (a.en_retard !== b.en_retard) return a.en_retard ? -1 : 1;
          return (a.date_limite_correction ?? "").localeCompare(b.date_limite_correction ?? "");
        }),
        retards: items.filter((i) => i.en_retard).length,
        ouvertes: items.length - verifiees - corrigees,
        verifiees,
        corrigees,
        total: items.length,
      };
    });

    // Les sites les plus urgents d'abord
    liste.sort(
      (a, b) =>
        b.retards - a.retards || b.ouvertes - a.ouvertes || a.nom.localeCompare(b.nom, "fr")
    );
    return liste;
  }, [lignes]);

  function basculer(cle: string) {
    setDeplies((avant) => {
      const apres = new Set(avant);
      if (apres.has(cle)) apres.delete(cle);
      else apres.add(cle);
      return apres;
    });
  }

  // Au clavier, le panneau s'ouvre depuis le centre de la ligne
  function surTouche(e: KeyboardEvent<HTMLLIElement>, nc: NonConformite) {
    // Seule la ligne elle-même réagit : Entrée sur le bouton d'action ne doit pas ouvrir le panneau
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      onOuvrir(nc, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
  }

  if (groupes.length === 0) {
    return (
      <div className="ncl">
        <p className="ncl-vide">Aucune non-conformité à afficher.</p>
      </div>
    );
  }

  return (
    <div className="ncl">
      {groupes.map((g, index) => {
        const ouvert = deplies.has(g.cle);
        const visibles = ouvert ? g.items : g.items.slice(0, LIMITE);
        const reglees = g.verifiees + g.corrigees;
        const pct = (n: number) => `${g.total ? (n / g.total) * 100 : 0}%`;

        return (
          <section
            key={g.cle}
            className="ncl-site"
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
          >
            <header className="ncl-site-tete">
              <div className="ncl-site-nom">
                <strong>{g.nom}</strong>
                <span>{g.localisation}</span>
              </div>
              <div className="ncl-progres">
                <div className="ncl-barre" aria-hidden="true">
                  <span className="ncl-barre-ok" style={{ width: pct(g.verifiees) }} />
                  <span className="ncl-barre-corr" style={{ width: pct(g.corrigees) }} />
                </div>
                <span className="ncl-progres-texte">
                  {reglees} / {g.total} réglées
                </span>
              </div>
            </header>

            <ul className="ncl-lignes">
              {visibles.map((nc) => {
                const peutCorriger = estDirecteur && nc.statut === "OUVERTE";
                return (
                  <li
                    key={nc.id}
                    className={nc.en_retard ? "ncl-ligne retard" : "ncl-ligne"}
                    tabIndex={0}
                    onClick={(e) => onOuvrir(nc, { x: e.clientX, y: e.clientY })}
                    onKeyDown={(e) => surTouche(e, nc)}
                  >
                    <span className={`nc-gravite ${nc.gravite}`}>
                      <i aria-hidden="true" />
                      {GRAVITES[nc.gravite]}
                    </span>

                    <div className="ncl-texte">
                      <span className="ncl-constat">{nc.description}</span>
                      <span className="ncl-meta">
                        {echeanceTexte(nc)}
                        {nc.en_retard && <span className="nc-retard">{retardTexte(nc.jours_de_retard)}</span>}
                      </span>
                    </div>

                    <div className="ncl-droite">
                      {peutCorriger ? (
                        <button
                          type="button"
                          className="bouton"
                          disabled={enCoursId === nc.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCorriger(nc);
                          }}
                        >
                          {enCoursId === nc.id ? "Enregistrement…" : "Marquer corrigée"}
                        </button>
                      ) : (
                        <span className={`nc-statut ${nc.statut}`}>{libelleStatut(nc, estDirecteur)}</span>
                      )}
                      <span className="ncl-chevron" aria-hidden="true" />
                    </div>
                  </li>
                );
              })}
            </ul>

            {g.items.length > LIMITE && (
              <button type="button" className="ncl-plus" onClick={() => basculer(g.cle)}>
                {ouvert ? "Réduire" : `Voir les ${g.items.length - LIMITE} autres`}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}