import { useState, useEffect } from 'react';
import { clientsApi, promoApi } from '../../../../utils/api';

export default function SendPromoEmailModal({ promo, theme, onClose, showToast }) {
  const isDark = theme.mode === 'dark';
  const [clients, setClients]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sending, setSending]         = useState(false);
  const [selected, setSelected]       = useState(new Set());
  const [selectAll, setSelectAll]     = useState(true);
  const [searchQ, setSearchQ]         = useState('');
  const [result, setResult]           = useState(null);

  useEffect(() => {
    clientsApi.list({ limit: 500 })
      .then(d => {
        const withEmail = (d.clients || []).filter(c => c.email);
        setClients(withEmail);
        setSelected(new Set(withEmail.map(c => c.id)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter(c =>
    !searchQ || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(searchQ.toLowerCase())
  );

  const toggleClient = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelectAll(next.size === clients.length);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectAll) { setSelected(new Set()); setSelectAll(false); }
    else { setSelected(new Set(clients.map(c => c.id))); setSelectAll(true); }
  };

  const handleSend = async () => {
    if (selected.size === 0) { showToast('Selectionnez au moins un client', 'error'); return; }
    setSending(true);
    try {
      const clientIds = selectAll ? [] : Array.from(selected);
      const res = await promoApi.sendEmails(promo.id, { client_ids: clientIds });
      setResult(res);
      showToast(`✉️ ${res.sent} email${res.sent > 1 ? 's' : ''} envoye${res.sent > 1 ? 's' : ''} !`);
    } catch(e) {
      showToast(e.message || 'Erreur lors de l\'envoi', 'error');
    } finally {
      setSending(false);
    }
  };

  const discountLabel = promo.type === 'percent'
    ? `-${promo.value}%`
    : `-${Number(promo.value).toFixed(2)} €`;

  const inp = { width:'100%', padding:'9px 12px', borderRadius:10, border:`1px solid ${theme.border}`,
    background:theme.inputBg, color:theme.text, fontSize:13, outline:'none', boxSizing:'border-box' };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:480, maxHeight:'88vh', display:'flex',
        flexDirection:'column', background:isDark?'#161622':'#fff',
        borderRadius:24, border:`1px solid ${theme.border}`, overflow:'hidden' }}>

        <div style={{ padding:'20px 22px 16px', borderBottom:`1px solid ${theme.border}`,
          background: isDark?'rgba(6,182,212,0.06)':'rgba(6,182,212,0.04)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:38, height:38, borderRadius:12, background:'rgba(6,182,212,0.12)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>✉️</div>
              <div>
                <p style={{ fontWeight:900, fontSize:15, color:theme.text, margin:0 }}>Envoyer la promo par email</p>
                <p style={{ fontSize:12, color:theme.muted, margin:0 }}>Prévenez vos clients de cette offre</p>
              </div>
            </div>
            <button onClick={onClose} style={{ width:28, height:28, borderRadius:8, border:'none',
              background:isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)', color:theme.muted, cursor:'pointer', fontSize:16 }}>✕</button>
          </div>

          <div style={{ padding:'10px 14px', borderRadius:12, background:isDark?'rgba(17,24,39,0.12)':'rgba(17,24,39,0.07)',
            border:'1px solid rgba(17,24,39,0.2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:18, color:theme.text, letterSpacing:'0.1em' }}>{promo.code}</span>
            <span style={{ padding:'4px 10px', borderRadius:8, background:theme.cardAlt, color:theme.text, fontWeight:700, fontSize:13 }}>{discountLabel}</span>
          </div>
        </div>

        {result && (
          <div style={{ padding:'14px 22px', background:'rgba(16,185,129,0.08)', borderBottom:`1px solid ${theme.border}` }}>
            <p style={{ fontWeight:800, fontSize:14, color:'#10b981', margin:'0 0 4px' }}>✅ Envoi terminé</p>
            <p style={{ fontSize:13, color:theme.muted, margin:0 }}>
              {result.sent} envoyé{result.sent>1?'s':''} · {result.failed} echec{result.failed>1?'s':''}
              {result.failed > 0 && ' (adresses invalides ou SMTP non configure)'}
            </p>
          </div>
        )}

        <div style={{ padding:'12px 22px 8px', borderBottom:`1px solid ${theme.border}` }}>
          <input placeholder="Rechercher un client…" value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{...inp, marginBottom:10}} />
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:theme.text, fontWeight:600 }}>
              <input type="checkbox" checked={selectAll} onChange={handleSelectAll}
                style={{ width:15, height:15, accentColor:'#111827', cursor:'pointer' }} />
              Tous les clients ({clients.length} avec email)
            </label>
            <span style={{ fontSize:12, color:theme.muted }}>{selected.size} sélectionné{selected.size>1?'s':''}</span>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
          {loading ? (
            <div style={{ padding:'32px', textAlign:'center', color:theme.muted }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:theme.muted }}>
              {clients.length === 0 ? 'Aucun client avec email enregistre' : 'Aucun resultat'}
            </div>
          ) : filtered.map(c => (
            <label key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 22px', cursor:'pointer',
              background: selected.has(c.id) ? (isDark?'rgba(17,24,39,0.06)':'rgba(17,24,39,0.04)') : 'transparent',
              transition:'background 0.1s' }}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggleClient(c.id)}
                style={{ width:15, height:15, accentColor:'#111827', cursor:'pointer', flexShrink:0 }} />
              <div style={{ width:32, height:32, borderRadius:9, background:c.avatar_color||'#111827', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:800, fontSize:13 }}>
                {(c.first_name||'?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:600, fontSize:13, color:theme.text, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.first_name} {c.last_name}
                </p>
                <p style={{ fontSize:11, color:theme.muted, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.email}
                </p>
              </div>
            </label>
          ))}
        </div>

        <div style={{ padding:'14px 22px', borderTop:`1px solid ${theme.border}`, display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:12, background:theme.inputBg,
            border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer', fontSize:13 }}>
            Fermer
          </button>
          <button onClick={handleSend} disabled={sending || selected.size === 0}
            style={{ flex:2, padding:'13px', borderRadius:12, fontWeight:800, fontSize:13, border:'none',
              cursor: selected.size===0 ? 'not-allowed' : 'pointer',
              background: selected.size===0 ? theme.inputBg : 'linear-gradient(135deg,#374151,#0891b2)',
              color: selected.size===0 ? theme.muted : 'white',
              opacity: sending ? 0.6 : 1,
              boxShadow: selected.size===0 ? 'none' : '0 4px 14px rgba(6,182,212,0.35)' }}>
            {sending
              ? 'Envoi en cours...'
              : `Envoyer a ${selected.size} client${selected.size>1?'s':''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
