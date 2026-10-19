import { useEffect, useRef, type ReactNode } from 'react';

let firstPage = true;

/**
 * Titre principal de page : met à jour le titre du document et, lors d'une navigation
 * (pas au premier chargement), place le focus sur le titre pour les lecteurs d'écran.
 */
export function PageTitle({
  title,
  children,
  focusKey,
  className,
}: {
  title: string;
  children?: ReactNode;
  focusKey?: string;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} — Vote réel`;
  }, [title]);
  useEffect(() => {
    if (firstPage) {
      firstPage = false;
      return;
    }
    ref.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [focusKey, title]);
  return (
    <h1 ref={ref} tabIndex={-1} className={className}>
      {children ?? title}
    </h1>
  );
}
