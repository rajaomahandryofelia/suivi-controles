import { formaterAr } from "./typesConventions";
import type { Convention } from "./typesConventions";

// Synthèse en haut de l'onglet : total dû, payé, reste, arriérés
export default function SyntheseEcheances({ convention }: { convention: Convention }) {
  const totalDu = Number(convention.total_du) || 0;
  const totalPaye = Number(convention.total_paye) || 0;
  const resteTotal = Math.max(totalDu - totalPaye, 0);
  const pourcentage = totalDu > 0 ? Math.min(100, Math.round((totalPaye / totalDu) * 100)) : 0;
  const arrieres = Number(convention.arrieres) || 0;

  return (
    <div className="ech-synthese">
      <div className="ech-synthese-chiffres">
        <div>
          <span>Total dû</span>
          <strong>{formaterAr(totalDu)}</strong>
        </div>
        <div>
          <span>Total payé</span>
          <strong className="vert">{formaterAr(totalPaye)}</strong>
        </div>
        <div>
          <span>Reste à payer</span>
          <strong className={resteTotal > 0 ? "du" : ""}>{formaterAr(resteTotal)}</strong>
        </div>
        <div>
          <span>Dont arriérés</span>
          <strong className={arrieres > 0 ? "du" : ""}>{arrieres > 0 ? formaterAr(arrieres) : "—"}</strong>
        </div>
      </div>
      <div
        className="ech-progression"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pourcentage}
        aria-label="Part payée du total dû"
      >
        <span style={{ width: `${pourcentage}%` }} />
      </div>
      <small>{pourcentage} % du total dû est payé</small>
    </div>
  );
}