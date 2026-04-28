// AgendaLoader.jsx — Overlay centre dans la zone agenda pour le premier
// chargement des RDV. Style FDS-2026 austere (fw500, bordure 0.5px, pas
// d'emoji, pas de gradient). Volontairement plus visible que le petit Spin
// du header (14px) qui sert pour les refresh silencieux.

import { useTheme } from '../../../hooks/useTheme';

export default function AgendaLoader({ label = 'Chargement des rendez-vous…' }) {
  const { theme: t } = useTheme();
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      padding: '64px 20px',
      minHeight: 220,
      width: '100%',
      color: t.muted,
    }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: `0.5px solid ${t.border}`,
        borderTopColor: t.text,
        animation: 'agenda-spin 0.7s linear infinite',
      }} />
      <div style={{ fontSize: 13, fontWeight: 500, color: t.muted, letterSpacing: '0.01em' }}>
        {label}
      </div>
      <style>{`@keyframes agenda-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
