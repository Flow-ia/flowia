// src/components/ErrorBoundary.jsx
// Filet de securite global : capture toute erreur de rendu React qui, sans lui,
// laisserait l'utilisateur sur une page entierement blanche (ex: violation
// d'ordre des hooks, acces a une prop undefined dans un render). Au lieu du
// blanc muet, on affiche un ecran neutre avec un bouton "Recharger" — le geste
// que l'utilisateur fait deja manuellement (F5) rendu visible et explicite.
//
// Class component obligatoire : getDerivedStateFromError / componentDidCatch
// n'ont pas d'equivalent hooks. Pas de console.* (regle 8) — on ne logge pas,
// on degrade proprement. La cle `resetKey` (pathname) remonte automatiquement
// le boundary a chaque navigation pour ne pas figer l'app sur l'erreur.
import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps) {
    // Navigation → on retente un rendu propre (sinon l'ecran d'erreur
    // resterait colle apres que l'utilisateur a change d'URL).
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '24px 16px',
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        background: '#f7f7f7',
      }}>
        <div style={{
          width: '100%', maxWidth: 380, background: '#ffffff',
          border: '0.5px solid #e5e7eb', borderRadius: 14,
          padding: 28, textAlign: 'center',
        }}>
          <h1 style={{
            margin: '0 0 8px', fontSize: 18, fontWeight: 500,
            color: '#1a1a1a', letterSpacing: '-0.01em',
          }}>
            {"Une erreur est survenue"}
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
            {"Rechargez la page pour continuer. Vos informations ne sont pas perdues."}
          </p>
          <button
            type="button"
            onClick={() => { try { window.location.reload(); } catch {} }}
            style={{
              width: '100%', padding: '13px', borderRadius: 11, border: 'none',
              background: '#1a1a1a', color: '#ffffff', fontWeight: 500,
              fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
            }}>
            {"Recharger la page"}
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
