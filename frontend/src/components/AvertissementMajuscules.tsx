import "./AideSaisie.css";

/** La zone annonçante existe toujours : le message est lu quand il apparaît. */
export default function AvertissementMajuscules({ visible }: { visible: boolean }) {
  return (
    <div className="aide-verrmaj-zone" aria-live="polite">
      {visible && (
        <p className="aide-verrmaj">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 4-8 9h5v3h6v-3h5z" />
            <path d="M9 20h6" />
          </svg>
          Verr. Maj. activé : les majuscules seront saisies.
        </p>
      )}
    </div>
  );
}