import type { ReactNode } from "react";

interface PropsIcone {
  taille?: number;
  className?: string;
}

function Base({
  taille = 18,
  className,
  children,
}: PropsIcone & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={taille}
      height={taille}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconeUtilisateur(props: PropsIcone) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </Base>
  );
}

export function IconeCadenas(props: PropsIcone) {
  return (
    <Base {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Base>
  );
}

export function IconeOeil({ barre, ...props }: PropsIcone & { barre: boolean }) {
  return (
    <Base {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {barre && <path d="M3 3l18 18" />}
    </Base>
  );
}

export function IconeBouclier(props: PropsIcone) {
  return (
    <Base {...props}>
      <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" />
      <path d="M9 12l2.2 2.2L15 10.4" />
    </Base>
  );
}

export function IconeFleche(props: PropsIcone) {
  return (
    <Base {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </Base>
  );
}

export function IconeCourrier(props: PropsIcone) {
  return (
    <Base {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </Base>
  );
}

export function IconeTelephone(props: PropsIcone) {
  return (
    <Base {...props}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
    </Base>
  );
}

export function IconeBadge(props: PropsIcone) {
  return (
    <Base {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6.5 16c.5-1.5 1.7-2 2.5-2s2 .5 2.5 2" />
      <path d="M14 10h4" />
      <path d="M14 14h3" />
    </Base>
  );
}

export function IconeMission(props: PropsIcone) {
  return (
    <Base {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v2H9z" />
      <path d="M9 13l2 2 4-4" />
    </Base>
  );
}

export function IconePosition(props: PropsIcone) {
  return (
    <Base {...props}>
      <path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Base>
  );
}

export function IconeDocument(props: PropsIcone) {
  return (
    <Base {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </Base>
  );
}

export function IconeAlerte(props: PropsIcone) {
  return (
    <Base {...props}>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4" />
      <path d="M12 17.5v.01" />
    </Base>
  );
}