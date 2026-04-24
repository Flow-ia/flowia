// Caisse > Crédit — vue liste des crédits clients + formulaire Accorder.
//
// Contrat métier préservé :
// - creditsApi.grant enforce can_grant_credit côté back via employeePinOptional
//   (employé) ou accepte merchant PIN admin directement. La page ne gate pas
//   côté UI ; un 403 remonte via showToast si permissions insuffisantes.
// - L'usage/remboursement d'un crédit (repay) passe par l'étape Paiement
//   d'Encaisser : il crée une transaction revenue source='credit' +
//   décrément balance + audit trail. On ne duplique pas ce flow ici.
// - Event `ff-tx-refresh` dispatché après grant pour rafraîchir le dashboard.
import { useEffect, useState } from 'react';
import { creditsApi } from '../../utils/api';
import { Icon } from '../../components/Icon';

function fmtEur(n) {
  const v = Number(n || 0);
  return v.toFixed(2).replace('.', ',') + ' €';
}

const CARD = (t) => ({
  padding: 16, borderRadius: 12, background: t.card,
  border: `0.5px solid ${t.border}`,
});

const INPUT = (t) => ({
  width: '100%', padding: '9px 12px', borderRadius: 8,
  background: t.inputBg, border: `0.5px solid ${t.borderInput}`,
  color: t.text, fontSize: 14, fontFamily: 'inherit',
  boxSizing: 'border-box', outline: 'none',
});

function GrantForm({ employees, theme: t, onGranted, showToast }) {
  const [email, setEmail]   = useState('');
  const [name,  setName]    = useState('');
  const [amount, setAmount] = useState('');
  const [note,  setNote]    = useState('');
  const [empId, setEmpId]   = useState('');
  const [busy,  setBusy]    = useState(false);
  const [open,  setOpen]    = useState(false);

  const reset = () => { setEmail(''); setName(''); setAmount(''); setNote(''); setEmpId(''); };

  const submit = async () => {
    const val = parseFloat(amount);
    if (!email.trim())        return showToast && showToast("Email client requis", 'error');
    if (!val || val <= 0)     return showToast && showToast('Montant invalide', 'error');
    setBusy(true);
    try {
      await creditsApi.grant({
        client_email: email.trim().toLowerCase(),
        client_name:  name.trim() || undefined,
        amount:       val,
        note:         note.trim() || undefined,
        employee_id:  empId || undefined,
      });
      if (showToast) showToast("Crédit accordé", 'ok');
      try { window.dispatchEvent(new Event('ff-tx-refresh')); } catch {}
      reset(); setOpen(false);
      if (onGranted) onGranted();
    } catch (e) {
      if (showToast) showToast(e.message || 'Erreur', 'error');
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
              style={{ alignSelf:'flex-start', padding:'10px 14px', borderRadius:8,
                       border:'none', background: t.text, color: t.bg,
                       fontSize:13, fontWeight:500, fontFamily:'inherit', cursor:'pointer',
                       display:'inline-flex', alignItems:'center', gap:8 }}>
        <Icon name="plus" size={13} color={t.bg}/>
        {"Accorder un crédit"}
      </button>
    );
  }

  return (
    <div style={{ ...CARD(t), display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
          {"Accorder un crédit"}
        </p>
        <button onClick={() => { reset(); setOpen(false); }}
                style={{ border:'none', background:'transparent', cursor:'pointer',
                         padding:6, color:t.muted, fontFamily:'inherit' }}>
          <Icon name="x" size={14} color={t.muted}/>
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div>
          <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Email client *"}</p>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                 placeholder="client@exemple.fr" style={INPUT(t)}/>
        </div>
        <div>
          <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Nom (facultatif)"}</p>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
                 placeholder="Prénom Nom" style={INPUT(t)}/>
        </div>
        <div>
          <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Montant (€) *"}</p>
          <input type="number" step="0.01" min="0.01" value={amount}
                 onChange={e => setAmount(e.target.value)} placeholder="0.00"
                 style={{ ...INPUT(t), fontFamily:'monospace', textAlign:'right' }}/>
        </div>
        <div>
          <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Employé"}</p>
          <select value={empId} onChange={e => setEmpId(e.target.value)} style={INPUT(t)}>
            <option value="">{"Aucun (admin)"}</option>
            {employees.filter(e => e.is_active !== false).map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Note (facultatif)"}</p>
        <textarea value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Raison de ce crédit..." rows={2}
                  style={{ ...INPUT(t), resize:'vertical' }}/>
      </div>

      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button onClick={() => { reset(); setOpen(false); }}
                style={{ padding:'8px 14px', borderRadius:8, border:`0.5px solid ${t.border}`,
                         background:t.cardAlt, color:t.text,
                         fontSize:12, fontWeight:500, fontFamily:'inherit', cursor:'pointer' }}>
          {"Annuler"}
        </button>
        <button onClick={submit} disabled={busy}
                style={{ padding:'8px 14px', borderRadius:8, border:'none',
                         background: busy ? t.cardAlt : '#10b981',
                         color: busy ? t.muted : '#fff',
                         fontSize:12, fontWeight:500, fontFamily:'inherit',
                         cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Envoi...' : 'Accorder'}
        </button>
      </div>
    </div>
  );
}

export default function Credit({ employees = [], theme, showToast }) {
  const t = theme;
  const [q, setQ]         = useState('');
  const [list, setList]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    creditsApi.list({ only_active: 'true' })
      .then(r => { setList(Array.isArray(r) ? r : []); setLoading(false); })
      .catch(e => {
        setList([]); setLoading(false);
        if (showToast) showToast(e.message || 'Erreur chargement crédits', 'error');
      });
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rafraîchir si une écriture se produit ailleurs (transaction crédit, repay).
  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener('ff-tx-refresh', onRefresh);
    return () => window.removeEventListener('ff-tx-refresh', onRefresh);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = q.trim()
    ? list.filter(c => {
        const s = q.trim().toLowerCase();
        return (c.full_name || '').toLowerCase().includes(s)
            || (c.client_email || '').toLowerCase().includes(s)
            || (c.client_name  || '').toLowerCase().includes(s);
      })
    : list;

  const totalBalance = filtered.reduce((s, c) => s + (parseFloat(c.balance) || 0), 0);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <GrantForm employees={employees} theme={t} onGranted={load} showToast={showToast}/>

      <div style={{ ...CARD(t), display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                      gap:10, flexWrap:'wrap' }}>
          <div>
            <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
              {"Crédits actifs"}
            </p>
            <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
              {filtered.length + (filtered.length > 1 ? ' clients · ' : ' client · ') + fmtEur(totalBalance) + " en circulation"}
            </p>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)}
                 placeholder="Rechercher un client..."
                 style={{ ...INPUT(t), maxWidth:260, fontSize:12, padding:'7px 10px' }}/>
        </div>

        {loading ? (
          <p style={{ fontSize:12, color:t.muted, margin:0 }}>{"Chargement…"}</p>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize:12, color:t.muted, margin:0 }}>
            {q.trim() ? "Aucun résultat." : "Aucun crédit actif pour l'instant."}
          </p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column' }}>
            <div style={{ display:'grid',
                          gridTemplateColumns:'1.2fr 1fr auto auto auto',
                          gap:10, paddingBottom:6, fontSize:10,
                          color:t.muted, textTransform:'uppercase',
                          letterSpacing:'0.04em', fontWeight:500,
                          borderBottom:`0.5px solid ${t.separator}` }}>
              <div>{"Client"}</div>
              <div>{"Email"}</div>
              <div style={{ textAlign:'right' }}>{"Accordé"}</div>
              <div style={{ textAlign:'right' }}>{"Remboursé"}</div>
              <div style={{ textAlign:'right' }}>{"Solde"}</div>
            </div>
            {filtered.map(c => (
              <div key={c.id}
                   style={{ display:'grid',
                            gridTemplateColumns:'1.2fr 1fr auto auto auto',
                            gap:10, padding:'10px 0',
                            borderBottom:`0.5px solid ${t.separator}`,
                            alignItems:'center' }}>
                <div style={{ fontSize:13, color:t.text,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.full_name || c.client_name || c.client_email || '—'}
                </div>
                <div style={{ fontSize:12, color:t.muted,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.client_email || '—'}
                </div>
                <div style={{ fontSize:12, color:t.muted, textAlign:'right', fontFamily:'monospace' }}>
                  {fmtEur(c.total_granted)}
                </div>
                <div style={{ fontSize:12, color:t.muted, textAlign:'right', fontFamily:'monospace' }}>
                  {fmtEur(c.total_repaid)}
                </div>
                <div style={{ fontSize:13, color:'#065f46', textAlign:'right',
                              fontFamily:'monospace', fontWeight:500 }}>
                  {fmtEur(c.balance)}
                </div>
              </div>
            ))}
          </div>
        )}

        <p style={{ margin:0, fontSize:11, color:t.muted }}>
          {"L'utilisation d'un crédit se fait via l'étape paiement de l'encaissement (crée une transaction revenue source='credit' + décrément du solde + audit trail)."}
        </p>
      </div>
    </div>
  );
}
