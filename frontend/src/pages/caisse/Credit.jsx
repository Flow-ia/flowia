// Caisse > Crédit — correctifs commit 7b.
// - 3 KPIs header : Total octroyé / Utilisé (mois) / Clients avec solde.
// - Layout desktop 2 colonnes : liste clients (gauche) | form Accorder (droite).
// - Avatar rond coloré (hash email → palette stable).
// - Bouton « Voir détail » par client → modale historique grant/repay
//   via creditsApi.getClient(clientId) qui renvoie { credit, history, client }.
// Contrat préservé : grant enforce can_grant_credit côté back ; repay = via
// l'étape Paiement de l'encaissement (crée transaction revenue source='credit'
// + décrément balance + audit trail — ne pas dupliquer ici).
import { useEffect, useState } from 'react';
import { creditsApi } from '../../utils/api';
import { Icon } from '../../components/Icon';

const AVATAR_PALETTE = [
  '#f59e0b', // orange
  '#10b981', // vert
  '#8b5cf6', // violet
  '#ef4444', // rouge
  '#3b82f6', // bleu
  '#f97316', // ambre
  '#14b8a6', // teal
  '#ec4899', // rose
];

function avatarColorFor(str) {
  if (!str) return '#9ca3af';
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function fmt(n) {
  const v = Number(n || 0);
  return v.toFixed(2).replace('.', ',') + ' €';
}

function initialsOf(name, email) {
  const src = (name && name.trim()) || (email && email.trim()) || '';
  if (!src) return '?';
  const parts = src.split(/\s+|@/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] + (parts[0][1] || '')).toUpperCase();
}

// ── Modale détail historique crédit d'un client ───────────────────────────
function ClientDetailModal({ clientId, theme: t, onClose }) {
  const [state, setState] = useState({ loading: true, data: null, err: null });

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    creditsApi.getClient(clientId)
      .then(r => { if (!cancelled) setState({ loading: false, data: r, err: null }); })
      .catch(e => { if (!cancelled) setState({ loading: false, data: null, err: e.message || 'Erreur' }); });
    return () => { cancelled = true; };
  }, [clientId]);

  const { loading, data, err } = state;
  const client  = data?.client || null;
  const credit  = data?.credit || null;
  const history = data?.history || [];

  // Reconstruction du solde évolutif : on parcourt l'historique DESC donc on
  // ré-accumule à partir de la balance finale en remontant (balance - delta).
  const rows = [];
  let running = credit ? parseFloat(credit.balance || 0) : 0;
  for (const h of history) {
    const amt = parseFloat(h.amount || 0);
    rows.push({ ...h, solde_apres: running });
    running = (h.type === 'grant') ? running - amt : running + amt;
  }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
         style={{ position:'fixed', inset:0, zIndex:1000, padding:20,
                  background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth:560, maxHeight:'90vh',
                    overflowY:'auto', borderRadius:16, padding:20,
                    background:t.card, color:t.text,
                    border:`0.5px solid ${t.border}`,
                    boxShadow: t.shadowModal || '0 10px 30px rgba(0,0,0,0.25)',
                    display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
          <div style={{ display:'flex', gap:10, alignItems:'center', minWidth:0 }}>
            <div style={{ width:40, height:40, borderRadius:99,
                          background: avatarColorFor(client?.email || ''),
                          color:'#fff', display:'flex',
                          alignItems:'center', justifyContent:'center',
                          fontSize:14, fontWeight:500 }}>
              {initialsOf(
                [client?.first_name, client?.last_name].filter(Boolean).join(' '),
                client?.email
              )}
            </div>
            <div style={{ minWidth:0 }}>
              <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {[client?.first_name, client?.last_name].filter(Boolean).join(' ') || client?.email || 'Client'}
              </p>
              {client?.email && (
                <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {client.email}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose}
                  style={{ padding:6, border:'none', background:'transparent',
                           cursor:'pointer', color:t.muted, fontFamily:'inherit' }}>
            <Icon name="x" size={15} color={t.muted}/>
          </button>
        </div>

        {loading ? (
          <p style={{ margin:0, fontSize:12, color:t.muted }}>{"Chargement…"}</p>
        ) : err ? (
          <p style={{ margin:0, fontSize:12, color:'#991b1b' }}>{err}</p>
        ) : (
          <>
            <div style={{ padding:12, borderRadius:10, background:t.cardAlt,
                          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, color:t.muted, fontWeight:500 }}>{"Solde actuel"}</span>
              <span style={{ fontSize:18, fontWeight:500, color:'#065f46',
                             fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {fmt(credit?.balance)}
              </span>
            </div>

            {rows.length === 0 ? (
              <p style={{ margin:0, fontSize:12, color:t.muted, textAlign:'center', padding:16 }}>
                {"Aucun mouvement enregistré."}
              </p>
            ) : (
              <div>
                <div style={{ display:'grid',
                              gridTemplateColumns:'90px 70px 1fr 80px 90px',
                              gap:8, padding:'6px 4px', fontSize:10,
                              color:t.muted, textTransform:'uppercase',
                              letterSpacing:'0.04em', fontWeight:500,
                              borderBottom:`0.5px solid ${t.separator}` }}>
                  <div>{"Date"}</div>
                  <div>{"Type"}</div>
                  <div>{"Détail"}</div>
                  <div style={{ textAlign:'right' }}>{"Montant"}</div>
                  <div style={{ textAlign:'right' }}>{"Solde"}</div>
                </div>
                {rows.map((h, i) => {
                  const isGrant = h.type === 'grant';
                  return (
                    <div key={i}
                         style={{ display:'grid',
                                  gridTemplateColumns:'90px 70px 1fr 80px 90px',
                                  gap:8, padding:'10px 4px',
                                  borderBottom:`0.5px solid ${t.separator}`,
                                  alignItems:'center' }}>
                      <div style={{ fontSize:11, color:t.muted,
                                    fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                        {(h.created_at || '').substring(0, 10)}
                      </div>
                      <span style={{ fontSize:10, fontWeight:500,
                                     padding:'2px 8px', borderRadius:99,
                                     width:'fit-content', textTransform:'uppercase',
                                     letterSpacing:'0.04em',
                                     background: isGrant ? '#f0fdf4' : '#eef2ff',
                                     color:     isGrant ? '#065f46' : '#4338ca' }}>
                        {isGrant ? 'Grant' : 'Repay'}
                      </span>
                      <div style={{ fontSize:11, color:t.muted,
                                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {h.note || (h.tx_payment_method ? 'Tx ' + h.tx_payment_method : '—')}
                        {h.employee_name ? ' · ' + h.employee_name : ''}
                      </div>
                      <div style={{ fontSize:12, fontWeight:500, textAlign:'right',
                                    color: isGrant ? '#065f46' : '#991b1b',
                                    fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                        {(isGrant ? '+' : '−') + fmt(Math.abs(parseFloat(h.amount || 0))).replace(' €', '')} €
                      </div>
                      <div style={{ fontSize:11, color:t.muted, textAlign:'right',
                                    fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                        {fmt(h.solde_apres)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Form Accorder ─────────────────────────────────────────────────────────
function GrantForm({ employees, theme: t, onGranted, showToast }) {
  const [email, setEmail]   = useState('');
  const [name,  setName]    = useState('');
  const [amount, setAmount] = useState('');
  const [note,  setNote]    = useState('');
  const [empId, setEmpId]   = useState('');
  const [busy,  setBusy]    = useState(false);

  const reset = () => { setEmail(''); setName(''); setAmount(''); setNote(''); setEmpId(''); };

  const submit = async () => {
    const val = parseFloat(amount);
    if (!email.trim())    return showToast && showToast("Email client requis", 'error');
    if (!val || val <= 0) return showToast && showToast('Montant invalide', 'error');
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
      try { window.dispatchEvent(new Event('ff-tx-refresh')); } catch { /* noop */ }
      reset();
      if (onGranted) onGranted();
    } catch (e) {
      if (showToast) showToast(e.message || 'Erreur', 'error');
    } finally { setBusy(false); }
  };

  const canGrantList = employees.filter(e => e.is_active !== false && e.can_grant_credit === true);

  const inp = {
    width:'100%', padding:'9px 12px', borderRadius:8,
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit',
    boxSizing:'border-box', outline:'none',
  };

  return (
    <div style={{ padding:14, borderRadius:12, background:t.card,
                  border:`0.5px solid ${t.border}`,
                  display:'flex', flexDirection:'column', gap:10 }}>
      <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>
        {"Accorder un crédit"}
      </p>

      <div>
        <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Client (email) *"}</p>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
               placeholder="client@exemple.fr" style={inp}/>
      </div>
      <div>
        <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Nom (facultatif)"}</p>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
               placeholder="Prénom Nom" style={inp}/>
      </div>
      <div>
        <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Montant (€) *"}</p>
        <input type="number" step="0.01" min="0.01" value={amount}
               onChange={e => setAmount(e.target.value)} placeholder="50"
               style={{ ...inp, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                        textAlign:'right' }}/>
      </div>
      <div>
        <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Employé signataire"}</p>
        <select value={empId} onChange={e => setEmpId(e.target.value)} style={inp}>
          <option value="">{"Aucun (merchant admin)"}</option>
          {canGrantList.map(e => (
            <option key={e.id} value={e.id}>{e.name + " (can_grant)"}</option>
          ))}
        </select>
      </div>
      <div>
        <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Note"}</p>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder="Raison du crédit…"
                  style={{ ...inp, resize:'vertical' }}/>
      </div>

      <button onClick={submit} disabled={busy}
              style={{ padding:'11px 14px', borderRadius:8, border:'none',
                       background: busy ? t.cardAlt : '#10b981',
                       color: busy ? t.muted : '#fff',
                       cursor: busy ? 'wait' : 'pointer',
                       fontFamily:'inherit', fontSize:13, fontWeight:500 }}>
        {busy ? 'Envoi…' : 'Accorder le crédit'}
      </button>

      <p style={{ margin:0, fontSize:10, color:t.muted }}>
        {"Seuls les employés avec la permission can_grant_credit apparaissent dans la liste."}
      </p>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────
export default function Credit({ employees = [], theme, showToast, transactions = [] }) {
  const t = theme;
  const [q, setQ] = useState('');
  const [list, setList]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [detailId, setDetailId] = useState(null);

  // BUG FIX commit 7c : la recherche passe désormais par le back
  // (GET /api/credits?search=...). Debounce 350 ms sur q. Vide =
  // liste complète (only_active=true). Le back gère le LIKE sur
  // client_email / client_name / first_name+last_name / phone (routes/credits.js).
  const load = (searchQ) => {
    setLoading(true);
    const params = {};
    const qt = (searchQ ?? '').trim();
    if (qt) params.search = qt;
    else    params.only_active = 'true';
    return creditsApi.list(params)
      .then(r => { setList(Array.isArray(r) ? r : []); setLoading(false); })
      .catch(e => {
        setList([]); setLoading(false);
        if (showToast) showToast(e.message || 'Erreur chargement crédits', 'error');
      });
  };

  // Debounce 350 ms sur q. Chargement initial = q vide → only_active.
  useEffect(() => {
    const tm = setTimeout(() => { load(q); }, q.trim() ? 350 : 0);
    return () => clearTimeout(tm);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onRefresh = () => load(q);
    window.addEventListener('ff-tx-refresh', onRefresh);
    return () => window.removeEventListener('ff-tx-refresh', onRefresh);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quand une recherche est active, on affiche aussi les clients au solde 0
  // (pour retrouver un ancien bénéficiaire). KPIs se calculent uniquement
  // sur les crédits actifs (balance > 0).
  const activeList = list.filter(c => parseFloat(c.balance || 0) > 0);
  const filtered   = q.trim() ? list : activeList;

  const kpiTotalGranted = activeList.reduce((s, c) => s + parseFloat(c.balance || 0), 0);
  const kpiClientsActive = activeList.length;

  // Crédit utilisé ce mois : transactions revenue source='credit' créées ce mois.
  const now = new Date();
  const monthKey = now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');
  const kpiUsedMonth = (transactions || [])
    .filter(tx => tx.source === 'credit' && typeof tx.date === 'string' && tx.date.startsWith(monthKey))
    .reduce((s, tx) => s + (parseFloat(tx.amount) || 0), 0);

  const card = {
    padding: 14, borderRadius: 12, background: t.card,
    border: `0.5px solid ${t.border}`,
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* ── 3 KPIs header ── */}
      <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',
                    gap:10 }}>
        <div style={{ ...card, borderLeft:'2px solid #065f46' }}>
          <p style={{ margin:0, fontSize:10, color:'#065f46', textTransform:'uppercase',
                      letterSpacing:'0.04em', fontWeight:500 }}>{"Total crédit octroyé"}</p>
          <p style={{ margin:'6px 0 0', fontSize:20, fontWeight:500, color:t.text,
                      fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {fmt(kpiTotalGranted)}
          </p>
          <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
            {kpiClientsActive + (kpiClientsActive > 1 ? ' clients' : ' client')}
          </p>
        </div>
        <div style={{ ...card, borderLeft:'2px solid #4338ca' }}>
          <p style={{ margin:0, fontSize:10, color:'#4338ca', textTransform:'uppercase',
                      letterSpacing:'0.04em', fontWeight:500 }}>{"Crédit utilisé (mois)"}</p>
          <p style={{ margin:'6px 0 0', fontSize:20, fontWeight:500, color:t.text,
                      fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {fmt(kpiUsedMonth)}
          </p>
        </div>
        <div style={{ ...card, borderLeft:'2px solid #8b5cf6' }}>
          <p style={{ margin:0, fontSize:10, color:'#3c3489', textTransform:'uppercase',
                      letterSpacing:'0.04em', fontWeight:500 }}>{"Clients avec solde"}</p>
          <p style={{ margin:'6px 0 0', fontSize:20, fontWeight:500, color:t.text,
                      fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {kpiClientsActive}
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ ...card, display:'flex', gap:10, alignItems:'center', padding:'10px 14px' }}>
        <Icon name="more" size={14} color={t.muted} style={{ transform:'rotate(90deg)' }}/>
        <input value={q} onChange={e => setQ(e.target.value)}
               placeholder="Rechercher un client…"
               style={{ flex:1, padding:0, border:'none', background:'transparent',
                        outline:'none', fontFamily:'inherit', fontSize:13, color:t.text }}/>
      </div>

      {/* ── Layout 2 colonnes : liste | form grant ── */}
      <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))',
                    gap:14 }}>
        <div style={{ ...card, display:'flex', flexDirection:'column', gap:4 }}>
          <p style={{ margin:'0 0 6px', fontSize:13, fontWeight:500, color:t.text }}>
            {"Clients avec crédit actif"}
          </p>

          {loading ? (
            <p style={{ margin:0, fontSize:12, color:t.muted }}>{"Chargement…"}</p>
          ) : filtered.length === 0 ? (
            <p style={{ margin:0, fontSize:12, color:t.muted }}>
              {q.trim() ? "Aucun résultat." : "Aucun crédit actif pour l'instant."}
            </p>
          ) : filtered.map(c => {
            const email = c.client_email || '';
            const displayName = c.full_name || c.client_name || email || 'Client';
            const isAnonymous = !email; // RGPD anonymisation
            const nbGrants = parseFloat(c.total_granted || 0) > 0 ? 1 : 0;
            const nbRepays = parseFloat(c.total_repaid  || 0) > 0 ? 1 : 0;
            const summary = [
              nbGrants ? 'accordé ' + fmt(c.total_granted) : null,
              nbRepays ? 'remboursé ' + fmt(c.total_repaid) : null,
            ].filter(Boolean).join(' · ') || '—';
            return (
              <div key={c.id}
                   style={{ display:'flex', gap:10, alignItems:'center',
                            padding:'10px 0',
                            borderBottom:`0.5px solid ${t.separator}` }}>
                <div style={{ width:36, height:36, borderRadius:99,
                              background: isAnonymous ? '#9ca3af' : avatarColorFor(email),
                              color:'#fff', display:'flex',
                              alignItems:'center', justifyContent:'center',
                              fontSize:13, fontWeight:500, flexShrink:0 }}>
                  {isAnonymous ? '?' : initialsOf(displayName, email)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:500,
                              color: isAnonymous ? t.muted : t.text,
                              fontStyle: isAnonymous ? 'italic' : 'normal',
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {isAnonymous ? 'Client anonyme' : displayName}
                  </p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {isAnonymous ? 'Email anonymisé RGPD' : (email || summary)}
                  </p>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:500, color:'#065f46',
                              fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {fmt(c.balance)}
                  </p>
                  <button onClick={() => setDetailId(c.client_id || c.id)}
                          disabled={!c.client_id}
                          style={{ marginTop:3, padding:0, border:'none',
                                   background:'transparent', cursor: c.client_id ? 'pointer' : 'not-allowed',
                                   color: c.client_id ? t.muted : t.dim || t.muted,
                                   fontFamily:'inherit', fontSize:11 }}>
                    {c.client_id ? 'Voir détail →' : '—'}
                  </button>
                </div>
              </div>
            );
          })}

          <p style={{ margin:'10px 0 0', fontSize:10, color:t.muted }}>
            {"L'utilisation d'un crédit se fait via l'étape Paiement de l'encaissement (crée une transaction revenue source='credit' + décrément du solde + audit trail)."}
          </p>
        </div>

        <GrantForm employees={employees} theme={t}
                   showToast={showToast}
                   onGranted={load}/>
      </div>

      {detailId && (
        <ClientDetailModal
          clientId={detailId}
          theme={t}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
