import "./ServiceBadge.css";

interface Props {
  // RADIO, TELEVISION ou RADIO_TELEVISION (absent : rien ne s'affiche)
  service?: string | null;
}

const ICONE_RADIO = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="2" />
    <path d="M16.2 7.8a6 6 0 0 1 0 8.4" />
    <path d="M7.8 16.2a6 6 0 0 1 0-8.4" />
    <path d="M19.1 4.9a10 10 0 0 1 0 14.2" />
    <path d="M4.9 19.1a10 10 0 0 1 0-14.2" />
  </svg>
);

const ICONE_TELEVISION = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="12" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
  </svg>
);

// La pastille du service d'un site : « Radio », « Télévision », ou les deux
export default function ServiceBadge({ service }: Props) {
  if (!service) return null;
  const radio = service === "RADIO" || service === "RADIO_TELEVISION";
  const television = service === "TELEVISION" || service === "RADIO_TELEVISION";

  return (
    <span className="svc-groupe">
      {radio && (
        <span className="svc radio">
          {ICONE_RADIO}
          Radio
        </span>
      )}
      {television && (
        <span className="svc television">
          {ICONE_TELEVISION}
          Télévision
        </span>
      )}
    </span>
  );
}