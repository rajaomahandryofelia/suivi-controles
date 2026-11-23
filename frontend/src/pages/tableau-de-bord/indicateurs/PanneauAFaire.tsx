import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Nombre from "./Nombre";
import "./PanneauAFaire.css";

// Une ligne « à traiter » : un sujet, un nombre, un clic qui mène à l'action
export interface ElementAFaire {
  cle: string;
  libelle: string;
  nombre: number;
  // Couleur du point et du survol
  ton: "attention" | "danger" | "succes" | "info";
  // Gardée pour ne rien casser chez l'appelant ; le nouveau style utilise un point de couleur
  icone?: ReactNode;
  // Soit une page à ouvrir, soit une action à lancer
  vers?: string;
  action?: () => void;
}

// Une pastille du résumé (ex. « Planifiées 4 »)
export interface PuceResume {
  cle: string;
  libelle: string;
  nombre: number;
  vers: string;
}

interface Props {
  elements: ElementAFaire[];
  resume?: { titre: string; puces: PuceResume[] };
  // Rang d'apparition (les blocs arrivent l'un après l'autre)
  rang?: number;
}

// Le panneau « À traiter » : quelques notes sur ce qui attend une décision, du plus urgent au moins urgent.
// Les lignes à zéro disparaissent : s'il n'y a rien à faire, on le dit simplement.
export default function PanneauAFaire({ elements, resume, rang = 0 }: Props) {
  const navigate = useNavigate();
  const visibles = elements.filter((e) => e.nombre > 0);
  const total = visibles.reduce((somme, e) => somme + e.nombre, 0);

  function ouvrir(e: ElementAFaire) {
    if (e.action) e.action();
    else if (e.vers) navigate(e.vers);
  }

  return (
    <section
      className="ind-panneau ind-entree ind-afaire-note"
      style={{ "--i": rang } as CSSProperties}
      aria-labelledby="ind-afaire"
    >
      <div className="ind-panneau-tete">
        <h2 className="ind-titre" id="ind-afaire">
          À traiter
        </h2>
        {total > 0 && <span className="ind-total">{total}</span>}
      </div>

      {visibles.length === 0 ? (
        <p className="ind-rien-note">
          <span className="ind-rien-point" aria-hidden="true" />
          Rien à traiter
        </p>
      ) : (
        <ul className="ind-notes">
          {visibles.map((e) => (
            <li key={e.cle}>
              <button type="button" className={`ind-note ${e.ton}`} onClick={() => ouvrir(e)}>
                <span className="ind-note-point" aria-hidden="true" />
                <span className="ind-note-libelle">{e.libelle}</span>
                <strong className="ind-note-nombre">
                  <Nombre valeur={e.nombre} />
                </strong>
                <span className="ind-note-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {resume && (
        <div className="ind-resume">
          <span className="ind-resume-titre">{resume.titre}</span>
          {resume.puces.map((p) => (
            <button key={p.cle} type="button" className="ind-puce" onClick={() => navigate(p.vers)}>
              <strong>{p.nombre}</strong>
              <span>{p.libelle}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}