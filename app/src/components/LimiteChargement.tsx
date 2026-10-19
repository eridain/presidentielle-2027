import { Component, type ReactNode } from 'react';

/**
 * Périmètre d'erreur des pages chargées à la demande (mode approfondi) : si leur fichier ne peut pas être téléchargé
 * (connexion coupée, ou onglet resté ouvert pendant une mise à jour du site — l'ancien fichier n'existe plus), le reste
 * du site reste affiché et un rechargement est proposé (React garde l'échec en mémoire : réessayer sans recharger
 * échouerait de nouveau).
 */
export class LimiteChargement extends Component<{ children: ReactNode }, { erreur: boolean }> {
  override state = { erreur: false };

  static getDerivedStateFromError(): { erreur: boolean } {
    return { erreur: true };
  }

  override render() {
    if (!this.state.erreur) return this.props.children;
    return <ErreurChargement />;
  }
}

/** Message commun : fichier du site non chargé, rechargement de la page. */
export function ErreurChargement({ children }: { children?: ReactNode }) {
  return (
    <div role="alert" className="card note">
      <p>
        Cette partie du site n’a pas pu être chargée (connexion interrompue, ou le site a été mis à jour depuis l’ouverture de
        la page).
      </p>
      <p className="actions">
        {children}
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Recharger la page
        </button>
      </p>
    </div>
  );
}
