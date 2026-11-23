import { ATTENTION } from "../constantes";
import { classeNiveau, libelle, texteValeur } from "../outils";
import "./Indicateurs.css";

export default function Tuile({ cle, valeur }: { cle: string; valeur: unknown }) {
  const nombre = typeof valeur === "number" ? valeur : null;
  const attention = ATTENTION.has(cle) && nombre !== null && nombre > 0;

  let contenu;
  if (valeur && typeof valeur === "object") {
    contenu = (
      <ul className="tdb-lignes">
        {Object.entries(valeur as Record<string, unknown>).map(([k, v]) => (
          <li key={k}>
            <span>
              <span className={`tdb-point ${classeNiveau(k)}`} />
              {libelle(k)}
            </span>
            <strong>{texteValeur(v)}</strong>
          </li>
        ))}
      </ul>
    );
  } else {
    contenu = <div className="tdb-grand">{texteValeur(valeur)}</div>;
  }

  return (
    <div className={`tdb-tuile${attention ? " attention" : ""}`}>
      <h3>{libelle(cle)}</h3>
      {contenu}
    </div>
  );
}