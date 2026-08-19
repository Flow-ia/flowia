import { useState, useEffect } from 'react';
import { clientsApi, promoApi } from '../../../../utils/api';
import { I } from '../../../../utils/icons';
import { Button } from '../../../../components/primitives';

export default function SendPromoEmailModal({ promo, theme, onClose, showToast }) {
  const t = theme;
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
      showToast(`${res.sent} email${res.sent > 1 ? 's' : ''} envoye${res.sent > 1 ? 's' : ''}`);
    } catch (e) {
      showToast(e.message || "Erreur lors de l'envoi", 'error');
    } finally { setSending(false); }
  };

  const discountLabel = promo.type === 'percent'
    ? `-${promo.value}%`
    : `-${Number(promo.value).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DA`;

  const inp = {
    width:'100%', padding:'9px 12px', borderRadius:8,
    border:`0.5px solid ${t.borderInput}`,
    background:t.inputBg, color:t.text,
    fontSize:13, outline:'none', boxSizing:'border-box',
    fontFamily:'inherit',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose}
           style={{ position:'absolute', inset:0,
                    background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}/>
      <div style={{ position:'relative', width:'100%', maxWidth:480, maxHeight:'88vh',
                    display:'flex', flexDirection:'column',
                    background:t.elevated, borderRadius:16,
                    border:`0.5px solid ${t.border}`,
                    boxShadow:t.shadowModal, overflow:'hidden' }}>

        <div style={{ padding:'18px 22px 14px', borderBottom:`0.5px solid ${t.separator}`,
                      background:'#ecfeff' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:8,
                            background:'rgba(14,116,144,0.15)',
                            display:'flex', alignItems:'center', justifyContent:'center' }}>
                <I.Mail style={{ width:17, height:17, color:'#0e7490' }}/>
              </div>
              <div>
                <p style={{ fontSize:14, fontWeight:500, color:'#0e7490', margin:0 }}>
                  Envoyer la promo par email
                </p>
                <p style={{ fontSize:12, color:'#0e7490', opacity:0.8, margin:0 }}>
                  Prevenez vos clients de cette offre
                </p>
              </div>
            </div>
            <button onClick={onClose}
                    style={{ width:28, height:28, borderRadius:8, border:'none', cursor:'pointer',
                             background:t.cardAlt, color:t.muted, fontSize:15,
                             display:'flex', alignItems:'center', justifyContent:'center',
                             fontFamily:'inherit' }}>×</button>
          </div>

          <div style={{ padding:'10px 14px', borderRadius:8,
                        background:t.card, border:`0.5px solid ${t.border}`,
                        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily:'monospace', fontWeight:500, fontSize:16,
                           color:t.text, letterSpacing:'0.1em' }}>
              {promo.code}
            </span>
            <span style={{ padding:'4px 10px', borderRadius:8, background:t.cardAlt,
                           color:t.text, fontWeight:500, fontSize:13 }}>
              {discountLabel}
            </span>
          </div>
        </div>

        {result && (
          <div style={{ padding:'14px 22px', background:'#f0fdf4',
                        borderBottom:`0.5px solid ${t.separator}` }}>
            <p style={{ fontSize:13, fontWeight:500, color:'#065f46', margin:'0 0 4px' }}>
              Envoi termine
            </p>
            <p style={{ fontSize:12, color:'#065f46', opacity:0.85, margin:0 }}>
              {result.sent} envoye{result.sent > 1 ? 's' : ''} · {result.failed} echec{result.failed > 1 ? 's' : ''}
              {result.failed > 0 && ' (adresses invalides ou SMTP non configure)'}
            </p>
          </div>
        )}

        <div style={{ padding:'12px 22px 8px', borderBottom:`0.5px solid ${t.separator}` }}>
          <input placeholder="Rechercher un client…"
                 value={searchQ} onChange={e => setSearchQ(e.target.value)}
                 style={{ ...inp, marginBottom:10 }}/>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                            fontSize:13, color:t.text, fontWeight:500 }}>
              <input type="checkbox" checked={selectAll} onChange={handleSelectAll}
                     style={{ width:14, height:14, accentColor:t.text, cursor:'pointer' }}/>
              Tous les clients ({clients.length} avec email)
            </label>
            <span style={{ fontSize:12, color:t.muted }}>
              {selected.size} selectionne{selected.size > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
          {loading ? (
            <div style={{ padding:32, textAlign:'center', color:t.muted }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:t.muted }}>
              {clients.length === 0 ? 'Aucun client avec email enregistre' : 'Aucun resultat'}
            </div>
          ) : filtered.map(c => (
            <label key={c.id}
                   style={{ display:'flex', alignItems:'center', gap:12,
                            padding:'9px 22px', cursor:'pointer',
                            background: selected.has(c.id) ? t.cardAlt : 'transparent',
                            transition:'background 0.1s' }}>
              <input type="checkbox" checked={selected.has(c.id)}
                     onChange={() => toggleClient(c.id)}
                     style={{ width:14, height:14, accentColor:t.text, cursor:'pointer', flexShrink:0 }}/>
              <div style={{ width:30, height:30, borderRadius:8,
                            background: c.avatar_color || t.text, flexShrink:0,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color:'white', fontWeight:500, fontSize:12 }}>
                {(c.first_name || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:500, fontSize:13, color:t.text, margin:0,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.first_name} {c.last_name}
                </p>
                <p style={{ fontSize:11, color:t.muted, margin:0,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.email}
                </p>
              </div>
            </label>
          ))}
        </div>

        <div style={{ padding:'14px 22px', borderTop:`0.5px solid ${t.separator}`,
                      display:'flex', gap:10 }}>
          <Button variant="secondary" type="button" onClick={onClose} style={{ flex:1 }}>
            Fermer
          </Button>
          <Button variant="primary" type="button"
                  onClick={handleSend} disabled={sending || selected.size === 0}
                  style={{ flex:2 }}>
            {sending
              ? 'Envoi en cours...'
              : `Envoyer a ${selected.size} client${selected.size > 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
