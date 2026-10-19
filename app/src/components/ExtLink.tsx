import type { ReactNode } from 'react';

/** Lien externe : nouvel onglet (le quiz reste ouvert), sans transmission du référent. */
export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={className}>
      {children}
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}
