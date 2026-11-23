interface Props {
  texte: string;
  /** false : le texte reste affiché mais n'est pas annoncé par les lecteurs d'écran. */
  annoncer?: boolean;
}

/** Bulle de dialogue. Le texte est rendu comme texte React (aucun HTML injecté). */
export default function BulleMaki({ texte, annoncer = true }: Props) {
  return (
    <div className="maki-bulle" role="status" aria-live={annoncer ? "polite" : "off"}>
      {texte}
    </div>
  );
}