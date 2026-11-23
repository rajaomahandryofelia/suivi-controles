import type { KeyboardEvent } from "react";
import { formaterAr, formaterDate } from "./typesConventions";
import type { Convention } from "./typesConventions";

type Onglet = "details" | "echeances";

interface Props {
  conventions: Convention[];
  // Nombre total de conventions (pour choisir le message quand la liste est vide)
  total: number;
  pdfEnCours: number | null;
  onOuvrir: (id: number, onglet: Onglet) => void;
  onEtat: (convention: Convention) => void;
}

export default function TableauConventions({
  conventions,
  total,
  pdfEnCours,
  onOuvrir,
  onEtat,
}: Props) {
  function surTouche(e: KeyboardEvent<HTMLTableRowElement>, id: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOuvrir(id, "details");
    }
  }

  return (
    <div className="lst-tableau-cadre">
      {conventions.length === 0 ? (
        <p className="lst-vide">
          {total === 0
            ? "Aucune convention pour l'instant. Cliquez sur « Nouvelle convention »."
            : "Aucune convention ne correspond à ces critères."}
        </p>
      ) : (
        <table className="lst-tableau">
          <thead>
            <tr>
              <th>Convention</th>
              <th>Partenaire</th>
              <th>Statut</th>
              <th>Période</th>
              <th className="cv-droite">Montant</th>
              <th className="cv-droite">Payé</th>
              <th className="cv-droite">Arriérés</th>
              <th aria-label="Paiements et état PDF" />
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {conventions.map((c) => {
              const arrieres = Number(c.arrieres) || 0;
              const paye = Number(c.total_paye) || 0;
              return (
                <tr
                  key={c.id}
                  className={`cliquable${arrieres > 0 ? " attention" : ""}`}
                  tabIndex={0}
                  onClick={() => onOuvrir(c.id, "details")}
                  onKeyDown={(e) => surTouche(e, c.id)}
                >
                  <td className="lst-nom">
                    <strong>{c.reference}</strong>
                    <span>{c.site_nom}</span>
                  </td>
                  <td>{c.partenaire_nom}</td>
                  <td>
                    <span className={`conv-badge ${c.statut.toLowerCase()}`}>{c.statut_libelle}</span>
                  </td>
                  <td className="cv-periode">
                    {formaterDate(c.date_debut)} → {formaterDate(c.date_fin)}
                  </td>
                  <td className="cv-droite">
                    {formaterAr(c.montant_periodique)}
                    <small>{c.periodicite_libelle.toLowerCase()}</small>
                  </td>
                  <td className={`cv-droite${paye > 0 ? " paye" : ""}`}>
                    {paye > 0 ? formaterAr(c.total_paye) : <span className="lst-absent">—</span>}
                  </td>
                  <td className={`cv-droite${arrieres > 0 ? " du" : ""}`}>
                    {arrieres > 0 ? formaterAr(c.arrieres) : <span className="lst-absent">—</span>}
                  </td>
                  <td className="cv-droite">
                    <div className="cv-actions">
                      <button
                        type="button"
                        className="conv-pdf"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOuvrir(c.id, "echeances");
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        title="Voir les échéances et enregistrer un paiement"
                      >
                        Paiements
                      </button>
                      <button
                        type="button"
                        className="conv-pdf"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEtat(c);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        disabled={pdfEnCours === c.id}
                        title="Ouvrir l'état de paiement en PDF"
                      >
                        {pdfEnCours === c.id ? "…" : "État PDF"}
                      </button>
                    </div>
                  </td>
                  <td className="lst-chevron" aria-hidden="true">
                    ›
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}