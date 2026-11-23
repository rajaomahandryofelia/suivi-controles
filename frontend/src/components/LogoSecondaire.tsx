/**
 * Deuxième logo, placé en haut à droite du panneau institutionnel
 * (symétrique du premier logo, qui est en haut à gauche).
 * L'image est dans `public/` : on la référence par son chemin, sans import.
 * Le positionnement est géré par `.cnx-logo-secondaire` dans Decor.css.
 */
export default function LogoSecondaire() {
    return (
      <img
        className="cnx-logo-secondaire"
        src={`${import.meta.env.BASE_URL}logo-ministere2.png`}
        alt="Logo du ministère"
      />
    );
  }