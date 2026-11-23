import { evaluerMotDePasse } from "../auth/forceMotDePasse";
import "./AideSaisie.css";

export default function IndicateurForce({ motDePasse }: { motDePasse: string }) {
  if (!motDePasse) return null;
  const force = evaluerMotDePasse(motDePasse);

  return (
    <div className="aide-force">
      <div className="aide-force-barres" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={n <= force.score ? `actif niveau-${force.score}` : ""} />
        ))}
      </div>
      <p className="aide-force-texte" aria-live="polite">
        Force du mot de passe : <strong>{force.libelle}</strong>
      </p>
      <ul className="aide-force-regles">
        <li className={force.longueurSuffisante ? "ok" : ""}>
          <span aria-hidden="true">{force.longueurSuffisante ? "✓" : "○"}</span>
          8 caractères minimum
          <span className="aide-sr">{force.longueurSuffisante ? " : respecté" : " : non respecté"}</span>
        </li>
        <li className={force.pasUniquementDesChiffres ? "ok" : ""}>
          <span aria-hidden="true">{force.pasUniquementDesChiffres ? "✓" : "○"}</span>
          Pas uniquement des chiffres
          <span className="aide-sr">
            {force.pasUniquementDesChiffres ? " : respecté" : " : non respecté"}
          </span>
        </li>
      </ul>
    </div>
  );
}