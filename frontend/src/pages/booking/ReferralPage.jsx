// src/pages/booking/ReferralPage.jsx
// Page "Parrainer un ami" — vue dédiée /book/:slug/parrain (3 états :
// programme inexistant → onglet absent ; désactivé → "fermé" ;
// actif non connecté → conditions + login ; actif connecté → code + partage).
import { useState } from 'react';

export function ReferralPage({ th, slug, business, refProgram, gcConnected, refMyCode, refMyHistory, refMyRewards, onLogin, onBack }) {
  const [copied, setCopied] = useState(false);
  const hasProgram = refProgram && refProgram !== 'none';
  const isActive   = hasProgram && refProgram.is_enabled === true;

  const valueStr = (type, value) => type === 'percent'
    ? `${value}%` : `${Number(value).toFixed(2)} €`;

  const shareUrl = refMyCode?.code
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/book/${slug}?ref=${refMyCode.code}`
    : null;

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {/* ignore */}
  };

  const share = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Parrainage ${business?.business_name || ''}`,
          text: `Utilise mon code ${refMyCode.code} chez ${business?.business_name || 'ce commerce'} !`,
          url: shareUrl,
        });
      } catch {/* user cancelled */}
    } else {
      copyLink();
    }
  };

  // Réductions déjà gagnées (pour l'état désactivé on affiche uniquement celles-ci)
  const earnedRewards = (refMyRewards || []).filter(r => r.status === 'available' || r.status === 'used');

  return (
    <div style={{ maxWidth:680, margin:'0 auto', padding:'32px 20px 80px', animation:'fadeIn .2s ease' }}>
      <button onClick={onBack}
        style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px',
          background:'none', border:'none', cursor:'pointer',
          fontSize:13, color:th.muted, marginBottom:16 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ width:14, height:14 }}><polyline points="15 18 9 12 15 6"/></svg>
        Retour à l'accueil
      </button>

      <h1 style={{ fontSize:26, fontWeight:900, color:th.text, margin:'0 0 8px',
        letterSpacing:'-0.02em' }}>
        Parrainer un ami
      </h1>
      {business?.business_name && (
        <p style={{ fontSize:14, color:th.muted, margin:'0 0 24px' }}>
          Programme de parrainage de {business.business_name}
        </p>
      )}

      {/* ── État : programme désactivé ─────────────────────────────────── */}
      {hasProgram && !isActive && (
        <div style={{ background:th.card, border:`1px solid ${th.border}`,
          borderRadius:16, padding:24, marginBottom:16 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🔒</div>
          <h2 style={{ fontSize:18, fontWeight:800, color:th.text, margin:'0 0 8px' }}>
            Programme temporairement fermé
          </h2>
          <p style={{ fontSize:14, color:th.muted, margin:0, lineHeight:1.6 }}>
            Le programme de parrainage est temporairement fermé.
            {earnedRewards.length > 0 ? ' Vos réductions déjà gagnées restent utilisables jusqu\'à leur date d\'expiration.' : ''}
          </p>
        </div>
      )}

      {/* ── État : programme actif ─────────────────────────────────────── */}
      {isActive && (
        <>
          {/* Conditions du programme */}
          <div style={{ background:th.card, border:`1px solid ${th.border}`,
            borderRadius:16, padding:24, marginBottom:16 }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🤝</div>
            <h2 style={{ fontSize:18, fontWeight:800, color:th.text, margin:'0 0 10px' }}>
              Comment ça marche ?
            </h2>
            <ol style={{ fontSize:14, color:th.text, margin:0, paddingLeft:20, lineHeight:1.8 }}>
              <li>Partagez votre code personnel à vos amis.</li>
              <li>Ils prennent rendez-vous et saisissent votre code.</li>
              <li>Après leur visite, vous recevez{' '}
                <strong>{valueStr(refProgram.parrain_type, refProgram.parrain_value)} de réduction</strong>{' '}
                par email.
              </li>
            </ol>
          </div>

          {/* Non connecté : bouton Voir mon code */}
          {!gcConnected && (
            <div style={{ background:th.card, border:`1px solid ${th.border}`,
              borderRadius:16, padding:24, marginBottom:16, textAlign:'center' }}>
              <p style={{ fontSize:14, color:th.muted, margin:'0 0 14px' }}>
                Connectez-vous pour obtenir votre code de parrainage personnel.
              </p>
              <button onClick={onLogin}
                style={{ padding:'12px 24px', borderRadius:11, cursor:'pointer',
                  background:th.accent, color:th.accentText, border:'none',
                  fontWeight:800, fontSize:14 }}>
                Voir mon code
              </button>
            </div>
          )}

          {/* Connecté : code + partage */}
          {gcConnected && refMyCode?.code && (
            <div style={{ background:th.card, border:`1px solid ${th.border}`,
              borderRadius:16, padding:24, marginBottom:16 }}>
              <p style={{ fontSize:11, fontWeight:700, color:th.muted,
                textTransform:'uppercase', letterSpacing:'0.05em', margin:'0 0 10px' }}>
                Votre code
              </p>
              <div style={{ background:th.cardAlt, border:'2px dashed #8b5cf6',
                borderRadius:14, padding:'18px 16px', textAlign:'center', marginBottom:14 }}>
                <p style={{ fontFamily:'monospace', fontSize:24, fontWeight:900,
                  color:'#6d28d9', letterSpacing:3, margin:0 }}>{refMyCode.code}</p>
                <p style={{ fontSize:11, color:th.muted, margin:'6px 0 0' }}>
                  {refMyCode.uses_count || 0} filleul{(refMyCode.uses_count||0) > 1 ? 's' : ''}
                </p>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={copyLink}
                  style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
                    background:copied ? '#10b981' : '#8b5cf6', color:'white',
                    border:'none', fontWeight:800, fontSize:13 }}>
                  {copied ? '✓ Copié' : 'Copier'}
                </button>
                <button onClick={share}
                  style={{ flex:1, padding:'12px', borderRadius:11, cursor:'pointer',
                    background:th.cardAlt, color:th.text,
                    border:`1px solid ${th.border}`, fontWeight:700, fontSize:13 }}>
                  Partager le lien
                </button>
              </div>
            </div>
          )}

          {/* Historique filleuls (connecté) */}
          {gcConnected && refMyHistory && refMyHistory.length > 0 && (
            <div style={{ background:th.card, border:`1px solid ${th.border}`,
              borderRadius:16, padding:20, marginBottom:16 }}>
              <p style={{ fontSize:13, fontWeight:800, color:th.text, margin:'0 0 12px' }}>
                Mes filleuls
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {refMyHistory.map(h => {
                  const name = [h.filleul_first_name, h.filleul_last_name].filter(Boolean).join(' ') || h.filleul_email;
                  const color = h.status === 'validated' ? '#10b981'
                              : h.status === 'cancelled' ? '#ef4444' : '#f59e0b';
                  const label = h.status === 'validated' ? 'Validé ✅'
                              : h.status === 'cancelled' ? 'Annulé' : 'En attente';
                  return (
                    <div key={h.id} style={{ display:'flex', alignItems:'center', gap:12,
                      padding:'10px 12px', borderRadius:10,
                      background:th.cardAlt, border:`1px solid ${th.border}` }}>
                      <div style={{ width:32, height:32, borderRadius:10, background:'#8b5cf620',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:13, fontWeight:900, color:'#6d28d9', flexShrink:0 }}>
                        {(name.charAt(0) || '?').toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ margin:0, fontSize:13, fontWeight:700, color:th.text,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</p>
                        <p style={{ margin:0, fontSize:11, color:th.muted }}>
                          {new Date(h.created_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <span style={{ fontSize:11, fontWeight:800,
                        padding:'3px 10px', borderRadius:99,
                        background:color + '18', color, flexShrink:0 }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Réductions gagnées (affichées dans tous les cas si présentes) */}
      {earnedRewards.length > 0 && (
        <div style={{ background:th.card, border:`1px solid ${th.border}`,
          borderRadius:16, padding:20 }}>
          <p style={{ fontSize:13, fontWeight:800, color:th.text, margin:'0 0 12px' }}>
            Mes réductions
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {earnedRewards.map(r => {
              const isBday = r.reward_type === 'birthday';
              const accent = isBday ? '#ec4899' : '#8b5cf6';
              const valStr = r.type === 'percent' ? `-${r.value}%` : `-${Number(r.value).toFixed(2)} €`;
              const isUsed = r.status === 'used';
              const expStr = r.expires_at ? new Date(r.expires_at).toLocaleDateString('fr-FR') : null;
              return (
                <div key={r.id} style={{
                  padding:'12px 14px', borderRadius:11,
                  border:`1px solid ${isUsed ? th.border : accent + '40'}`,
                  background:isUsed ? th.cardAlt : accent + '0f',
                  opacity:isUsed ? 0.6 : 1,
                  display:'flex', alignItems:'center', gap:10,
                }}>
                  <span style={{ fontSize:22 }}>{isBday ? '🎂' : '🤝'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontSize:13, fontWeight:800, color:th.text }}>
                      {valStr} <span style={{ fontFamily:'monospace', fontSize:11, color:accent }}>· {r.code}</span>
                    </p>
                    <p style={{ margin:'2px 0 0', fontSize:11, color:th.muted }}>
                      {isBday ? 'Anniversaire' : 'Parrainage'}
                      {isUsed ? ' · utilisée' : expStr ? ` · expire le ${expStr}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
