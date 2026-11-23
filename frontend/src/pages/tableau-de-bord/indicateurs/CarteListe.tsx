import { IconeListe } from "../icones/Icones";
import { libelle, texteElement } from "../outils";
import "./Indicateurs.css";

// Carte d'une liste d'indicateurs (sites à risque, missions du jour…)
export default function CarteListe({ cle, elements }: { cle: string; elements: unknown[] }) {
  return (
    <section className="tdb-carte">
      <div className="tdb-carte-tete">
        <div className="tdb-icone"><IconeListe /></div>
        <div>
          <h2>{libelle(cle)}</h2>
        </div>
      </div>
      {elements.length === 0 ? (
        <p className="tdb-vide">Rien à signaler.</p>
      ) : (
        <ul className="tdb-liste">
          {elements.map((el, i) => (
            <li key={i}>{texteElement(el)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}