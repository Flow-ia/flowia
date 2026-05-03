// src/pages/booking/my-appointments/tabs/ReferralTab.jsx
// Onglet "Parrainage" : code perso + réductions disponibles/utilisées + historique filleuls.

export function ReferralTab({
  th,
  refInfo,
  refHistory,
  refRewards,
  refCopied,
  onCopyReferralLink,
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, animation:'fadeIn .2s ease' }}>

      {/* Code perso + partage */}
      <div style={{ background:th.card, border: `1px solid ${th.border}`, borderRadius:16, padding:20 }}>
        <p style={{ fontSize:11, fontWeight: 500, color:th.muted, margin:'0 0 8px' }}>Mon code de parrainage</p>
        {/* Cadre voucher : tirets fins théme-aware (clair vs sombre) au lieu
            d'un purple hardcodé qui jurait en dark mode et ne respectait pas
            les FDS-2026. */}
        <div style={{ background:th.cardAlt,
          border:`1px dashed ${th.mode==='dark' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)'}`,
          borderRadius:14,
          padding:'18px 16px', textAlign:'center', marginBottom:12 }}>
          <p style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:24, fontWeight: 500, color:th.text,
            letterSpacing:3, margin:0 }}>{refInfo.code}</p>
          <p style={{ fontSize:11, color:th.muted, margin:'6px 0 0' }}>
            {refInfo.uses_count || 0} filleul{(refInfo.uses_count||0) > 1 ? 's' : ''} enregistré{(refInfo.uses_count||0) > 1 ? 's' : ''}
          </p>
        </div>
        {/* Bouton primaire : aligné sur th.accent / th.accentText (= noir/blanc
            en clair, blanc/noir en sombre), comme les autres CTA booking. */}
        <button onClick={onCopyReferralLink} style={{ width:'100%', padding:'12px',
          borderRadius:11, cursor:'pointer', border:'none',
          background: refCopied ? '#10b981' : th.accent,
          color: refCopied ? 'white' : th.accentText,
          fontWeight: 500, fontSize:13 }}>
          {refCopied ? 'Lien copié' : 'Copier mon lien de parrainage'}
        </button>
        {refInfo.program && (
          <p style={{ fontSize:12, color:th.muted, margin:'12px 0 0', lineHeight:1.5, textAlign:'center' }}>
            Chaque ami qui vient grâce à vous vous fait gagner{' '}
            <strong style={{ color:th.text }}>
              {refInfo.program.parrain_type === 'percent'
                ? `${refInfo.program.parrain_value}%`
                : `${Number(refInfo.program.parrain_value).toFixed(2)} €`}
            </strong>{' '}
            de réduction à valider lors du rendez-vous de votre filleul.
          </p>
        )}
      </div>

      {/* Mes réductions — séparées en 2 sections :
           (1) Disponibles : utilisables maintenant
           (2) Historique utilisées : traçabilité de consommation */}
      {(() => {
        const available = refRewards.filter(r => r.status !== 'used');
        const used      = refRewards.filter(r => r.status === 'used')
          .sort((a, b) => new Date(b.used_at || 0) - new Date(a.used_at || 0));
        const renderCard = (r, opts = {}) => {
          const isBday = r.reward_type === 'birthday';
          const accent = isBday ? '#ec4899' : '#8b5cf6';
          const valStr = r.type === 'percent' ? `-${r.value}%` : `-${Number(r.value).toFixed(2)} €`;
          const isUsed = opts.isUsed;
          const expStr = r.expires_at ? new Date(r.expires_at).toLocaleDateString('fr-FR') : null;
          return (
            <div key={r.id} style={{
              padding:'12px 14px', borderRadius:11,
              border: `1px solid ${isUsed ? th.border : accent + '40'}`,
              background:isUsed ? th.cardAlt : accent + '0f',
              opacity:isUsed ? 0.65 : 1,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:22, filter: isUsed ? 'grayscale(0.3)' : 'none' }}>{isBday ? '🎂' : '🤝'}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight: 500, color:th.text }}>
                    {valStr} <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:11, color:accent }}>· {r.code}</span>
                  </p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:th.muted }}>
                    {isBday ? 'Anniversaire' : 'Parrainage'}
                    {isUsed ? ` · utilisée le ${r.used_at ? new Date(r.used_at).toLocaleDateString('fr-FR') : ''}`
                            : expStr ? ` · expire le ${expStr}` : ''}
                  </p>
                </div>
                <span style={{
                  fontSize:10, fontWeight: 500,
                  padding:'3px 8px', borderRadius:99,
                  background:isUsed ? '#e5e7eb' : accent + '20',
                  color:isUsed ? '#6b7280' : accent,
                }}>{isUsed ? 'Utilisée' : 'Disponible'}</span>
              </div>
            </div>
          );
        };
        return (
          <>
            {available.length > 0 && (
              <div style={{ background:th.card, border: `1px solid ${th.border}`, borderRadius:16, padding:20 }}>
                <p style={{ fontSize:13, fontWeight: 500, color:th.text, margin:'0 0 12px' }}>
                  Mes réductions disponibles
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {available.map(r => renderCard(r, { isUsed: false }))}
                </div>
              </div>
            )}
            {used.length > 0 && (
              <div style={{ background:th.card, border: `1px solid ${th.border}`, borderRadius:16, padding:20 }}>
                <p style={{ fontSize:13, fontWeight: 500, color:th.text, margin:'0 0 4px' }}>
                  Historique des récompenses utilisées
                </p>
                <p style={{ fontSize:11, color:th.muted, margin:'0 0 12px' }}>
                  Récompenses déjà consommées, triées de la plus récente à la plus ancienne.
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {used.map(r => renderCard(r, { isUsed: true }))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* Historique filleuls */}
      <div style={{ background:th.card, border: `1px solid ${th.border}`, borderRadius:16, padding:20 }}>
        <p style={{ fontSize:13, fontWeight: 500, color:th.text, margin:'0 0 12px' }}>
          Mes filleuls
        </p>
        {refHistory.length === 0 ? (
          <p style={{ fontSize:12, color:th.muted, margin:0, textAlign:'center', padding:'12px 0' }}>
            Aucun filleul pour le moment. Partagez votre code !
          </p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {refHistory.map(h => {
              const name = [h.filleul_first_name, h.filleul_last_name].filter(Boolean).join(' ') || h.filleul_email;
              const statusColor = h.status === 'validated' ? '#10b981'
                                : h.status === 'cancelled' ? '#ef4444' : '#f59e0b';
              const statusLabel = h.status === 'validated' ? 'Récompensé'
                                : h.status === 'cancelled' ? 'Annulé' : 'En attente';
              return (
                <div key={h.id} style={{ padding:'10px 12px', borderRadius:10,
                  background:th.cardAlt, border: `1px solid ${th.border}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    {/* Avatar filleul : couleurs theme-aware au lieu du
                        purple hardcodé (illisible en dark mode). */}
                    <div style={{ width:32, height:32, borderRadius:10,
                      background:th.cardAlt, border:`1px solid ${th.border}`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:13, fontWeight: 500, color:th.text, flexShrink:0 }}>
                      {(name.charAt(0) || '?').toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:13, fontWeight: 500, color:th.text,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</p>
                      <p style={{ margin:0, fontSize:11, color:th.muted }}>
                        {new Date(h.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <span style={{ fontSize:10, fontWeight: 500,
                      padding:'3px 9px', borderRadius:99,
                      background:statusColor + '18', color:statusColor,
                      flexShrink:0 }}>{statusLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
