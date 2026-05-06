// Reglages > Reservations > Synchronisation Google Agenda
//
// Permet au merchant de connecter son compte Google pour que les RDV
// (publics et internes) apparaissent automatiquement dans son agenda Google.
// Sync v1 = sortant uniquement (FlowIA → Google). V2 future : aussi lire
// Google pour bloquer les slots cote FlowIA.

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../../hooks/useTheme';
import { Toast, useToast } from '../../../components/UI';
import { api } from '../../../utils/api';

export default function GoogleCalendarSync() {
  const { theme: t } = useTheme();
  const [toast, showToast] = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(null); // 'connect' | 'disconnect' | 'toggle'

  const load = async () => {
    try {
      const d = await api.calendarSyncStatus();
      setData(d);
    } catch (e) {
      showToast(e?.message || 'Erreur chargement', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Lecture du retour callback OAuth (?gcal=connected|error&reason=...)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('gcal');
    if (status === 'connected') {
      showToast('Google Agenda connecte avec succes.', 'ok');
      navigate('/reglages/reservations/agenda-google', { replace: true });
      setTimeout(load, 400);
    } else if (status === 'error') {
      const reason = params.get('reason') || 'unknown';
      showToast(`Connexion Google echouee : ${reason}`, 'error');
      navigate('/reglages/reservations/agenda-google', { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setBusy('connect');
    try {
      const { url } = await api.calendarSyncConnect();
      if (url) window.location.href = url;
      else throw new Error('URL manquante');
    } catch (e) {
      showToast(e?.message || 'Erreur connexion', 'error');
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Deconnecter votre Google Agenda ?\n\nLes nouveaux RDV ne seront plus synchronises automatiquement. Les events deja crees dans Google restent en place (suppression manuelle possible cote Google).')) {
      return;
    }
    setBusy('disconnect');
    try {
      await api.calendarSyncDisconnect();
      showToast('Google Agenda deconnecte.', 'ok');
      await load();
    } catch (e) {
      showToast(e?.message || 'Erreur deconnexion', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleToggle = async (enabled) => {
    setBusy('toggle');
    try {
      await api.calendarSyncToggle(enabled);
      showToast(enabled ? 'Sync activee.' : 'Sync mise en pause.', 'ok');
      await load();
    } catch (e) {
      showToast(e?.message || 'Erreur', 'error');
    } finally {
      setBusy(null);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toast msg={toast?.msg} type={toast?.type}/>

      {loading ? (
        <div style={{ ...cardStyle(t), height: 180 }}/>
      ) : !data?.connected ? (
        // ── Etat : non connecte ─────────────────────────────────────────
        <section style={cardStyle(t)}>
          <div style={panelHeader}>
            <span style={dot('#94a3b8')}/>
            <span style={panelLabel(t)}>{"Google Agenda"}</span>
            <span style={pill('#475569', '#f1f5f9')}>Non connecte</span>
          </div>
          <p style={paragraph(t)}>
            {"Connectez votre compte Google pour que vos rendez-vous FlowIA apparaissent automatiquement dans votre agenda Google. Pratique pour les notifications mobiles, le partage avec votre equipe, ou pour avoir tous vos RDV au meme endroit."}
          </p>
          <ul style={bulletList(t)}>
            <li>{"FlowIA ne lit PAS votre agenda — il ne fait qu'y ajouter vos RDV (scope minimal calendar.events)."}</li>
            <li>{"Annulation/modification d'un RDV → l'event Google est mis a jour automatiquement."}</li>
            <li>{"Vous pouvez deconnecter ou mettre en pause a tout moment."}</li>
          </ul>
          <button onClick={handleConnect} disabled={busy === 'connect'}
                  style={btnPrimary(t, busy === 'connect')}>
            {busy === 'connect' ? 'Redirection vers Google…' : 'Connecter mon Google Agenda'}
          </button>
        </section>
      ) : (
        // ── Etat : connecte ─────────────────────────────────────────────
        <section style={cardStyle(t)}>
          <div style={panelHeader}>
            <span style={dot(data.sync_enabled ? '#10b981' : '#f59e0b')}/>
            <span style={panelLabel(t)}>{"Google Agenda"}</span>
            <span style={pill(
              data.sync_enabled ? '#10b981' : '#f59e0b',
              data.sync_enabled ? '#ecfdf5' : '#fffbeb'
            )}>
              {data.sync_enabled ? 'Connecte · Sync active' : 'Connecte · En pause'}
            </span>
          </div>
          <p style={paragraph(t)}>
            {data.sync_enabled
              ? "Vos nouveaux RDV sont automatiquement ajoutes a votre agenda Google."
              : "La synchronisation est en pause. Les nouveaux RDV ne seront pas ajoutes a Google jusqu'a ce que vous la reactiviez."}
          </p>

          <div style={detailsGrid}>
            <div style={detailRow}>
              <span style={detailKey(t)}>{"Compte Google"}</span>
              <span style={detailVal(t)}>{data.email || '—'}</span>
            </div>
            <div style={detailRow}>
              <span style={detailKey(t)}>{"Calendrier cible"}</span>
              <span style={detailVal(t)}>
                {data.calendar_id === 'primary' ? 'Agenda principal' : data.calendar_id}
              </span>
            </div>
            <div style={detailRow}>
              <span style={detailKey(t)}>{"Connecte depuis"}</span>
              <span style={detailVal(t)}>{formatDate(data.connected_at)}</span>
            </div>
            <div style={detailRow}>
              <span style={detailKey(t)}>{"Derniere synchro"}</span>
              <span style={detailVal(t)}>{formatDate(data.last_sync_at)}</span>
            </div>
          </div>

          {data.last_sync_error && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: '#fffbeb', border: '1px solid #fde68a',
              margin: '12px 0',
            }}>
              <p style={{ fontSize: 11, color: '#92400e', fontWeight: 600, margin: 0,
                          textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {"Derniere erreur"}
              </p>
              <p style={{ fontSize: 12, color: '#78350f', margin: '4px 0 0' }}>
                {data.last_sync_error}
              </p>
              <p style={{ fontSize: 11, color: '#92400e', margin: '6px 0 0', fontStyle: 'italic' }}>
                {"Si l'erreur persiste, deconnectez puis reconnectez Google Agenda."}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16,
                        paddingTop: 14, borderTop: `1px solid ${t.separator}` }}>
            <button onClick={() => handleToggle(!data.sync_enabled)} disabled={!!busy}
                    style={btnGhost(t, busy === 'toggle')}>
              {data.sync_enabled ? 'Mettre en pause' : 'Reactiver la sync'}
            </button>
            <button onClick={handleDisconnect} disabled={!!busy}
                    style={btnDanger(t, busy === 'disconnect')}>
              {busy === 'disconnect' ? '…' : 'Deconnecter'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Styles (copies de paiements/index.jsx pour coherence visuelle) ───────
const cardStyle = (t) => ({
  padding: 22, borderRadius: 12,
  background: t.card, border: `0.5px solid ${t.border}`,
  boxShadow: t.shadowSm,
});
const panelHeader = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  marginBottom: 14,
};
const panelLabel = (t) => ({
  fontSize: 11, fontWeight: 600, color: t.muted,
  textTransform: 'uppercase', letterSpacing: 0.5,
  margin: 0,
});
const paragraph = (t) => ({
  fontSize: 14, color: t.text, lineHeight: 1.55, margin: 0,
});
const bulletList = (t) => ({
  listStyle: 'none', padding: 0, margin: '12px 0 18px',
  display: 'flex', flexDirection: 'column', gap: 6,
  fontSize: 13, color: t.textSub, lineHeight: 1.5,
});
const detailsGrid = {
  display: 'grid', gap: 8,
  gridTemplateColumns: 'minmax(160px, max-content) 1fr',
  alignItems: 'baseline', marginTop: 14,
};
const detailRow = { display: 'contents' };
const detailKey = (t) => ({ fontSize: 12, color: t.muted });
const detailVal = (t) => ({ fontSize: 13, color: t.text, fontWeight: 500 });

function dot(color) {
  return { width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 };
}
function pill(color, bg) {
  return {
    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99,
    color, background: bg, border: `1px solid ${color}33`, whiteSpace: 'nowrap',
  };
}
function btnPrimary(t, busy) {
  return {
    padding: '10px 18px', fontSize: 14, fontWeight: 500,
    background: t.text, color: t.canvas,
    border: 'none', borderRadius: 8,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.7 : 1, fontFamily: 'inherit',
  };
}
function btnGhost(t, busy) {
  return {
    padding: '10px 18px', fontSize: 14, fontWeight: 500,
    background: 'transparent', color: t.text,
    border: `1px solid ${t.border}`, borderRadius: 8,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.7 : 1, fontFamily: 'inherit',
  };
}
function btnDanger(t, busy) {
  return {
    padding: '10px 18px', fontSize: 14, fontWeight: 500,
    background: 'transparent', color: '#991b1b',
    border: '1px solid #fecaca', borderRadius: 8,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.7 : 1, fontFamily: 'inherit',
  };
}
