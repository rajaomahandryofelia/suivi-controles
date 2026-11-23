import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as EvenementClavier } from "react";
import { IconeConsulter, IconePlusVertical, IconeRefuser, IconeValider } from "../icones/Icones";
import "./Demandes.css";

// Menu kebab (⋮) : actions d'une demande d'inscription
export default function MenuDemande({
  nom,
  desactive,
  onConsulter,
  onAccepter,
  onRefuser,
}: {
  nom: string;
  desactive: boolean;
  onConsulter: () => void;
  onAccepter: () => void;
  onRefuser: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const declencheur = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ouvert) return;

    // À l'ouverture, le focus va sur la première action
    conteneur.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();

    function clicExterieur(e: MouseEvent) {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    function toucheEchap(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOuvert(false);
        declencheur.current?.focus();
      }
    }

    document.addEventListener("mousedown", clicExterieur);
    document.addEventListener("keydown", toucheEchap);
    return () => {
      document.removeEventListener("mousedown", clicExterieur);
      document.removeEventListener("keydown", toucheEchap);
    };
  }, [ouvert]);

  // Si la demande est en cours de traitement, le menu se referme
  useEffect(() => {
    if (desactive) setOuvert(false);
  }, [desactive]);

  function choisir(action: () => void) {
    setOuvert(false);
    action();
  }

  function naviguer(e: EvenementClavier<HTMLUListElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const elements = Array.from(
      conteneur.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    );
    if (elements.length === 0) return;
    const courant = elements.indexOf(document.activeElement as HTMLButtonElement);
    const suivant =
      e.key === "ArrowDown"
        ? (courant + 1) % elements.length
        : (courant - 1 + elements.length) % elements.length;
    elements[suivant]?.focus();
  }

  return (
    <div className="tdb-menu" ref={conteneur}>
      <button
        type="button"
        ref={declencheur}
        className="tdb-menu-declencheur"
        aria-label={`Actions pour ${nom}`}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        disabled={desactive}
        onClick={() => setOuvert((v) => !v)}
      >
        <IconePlusVertical />
      </button>

      {ouvert && (
        <ul className="tdb-menu-liste" role="menu" onKeyDown={naviguer}>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="tdb-menu-item consulter"
              onClick={() => choisir(onConsulter)}
            >
              <IconeConsulter />
              Consulter
            </button>
          </li>
          <li role="separator" className="tdb-menu-separateur" />
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="tdb-menu-item accepter"
              onClick={() => choisir(onAccepter)}
            >
              <IconeValider />
              Accepter
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="tdb-menu-item refuser"
              onClick={() => choisir(onRefuser)}
            >
              <IconeRefuser />
              Refuser
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}