// Caisse > Crédit — correctifs commit 7b.
// - 3 KPIs header : Total octroyé / Utilisé (mois) / Clients avec solde.
// - Layout desktop 2 colonnes : liste clients (gauche) | form Accorder (droite).
// - Avatar rond coloré (hash email → palette stable).
// - Bouton « Voir détail » par client → modale historique grant/repay
//   via creditsApi.getClient(clientId) qui renvoie { credit, history, client }.
// Contrat préservé : grant enforce can_grant_credit côté back ; repay = via
// l'étape Paiement de l'encaissement (crée transaction revenue source='credit'
// + décrément balance + audit trail — ne pas dupliquer ici).
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { creditsApi, clientsApi, api } from '../../utils/api';
import { useEmployeePinGate } from '../../components/EmployeePinModal';
import { Icon } from '../../components/Icon';

const PAGE_SIZE = 5;

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
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' DA';
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
                        {(isGrant ? '+' : '−') + fmt(Math.abs(parseFloat(h.amount || 0))).replace(' DA', '')} DA
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
// Sécurité : un crédit est sensible côté commerçant. On impose donc :
//   - sélection d'un client via la recherche unique (nom/prénom/email/tél)
//     pour éviter une saisie email libre qui créerait une fiche orpheline ;
//   - employé signataire obligatoire — uniquement ceux avec PIN actif ET
//     can_grant_credit=true sont proposés ;
//   - montant > 0 ;
//   - PIN employé exigé via useEmployeePinGate (sessionStorage TTL 5 min,
//     header x-employee-pin envoyé à POST /credits/grant).
// Le backend re-valide tout (defense-in-depth).
function GrantForm({ employees, theme: t, onGranted, showToast }) {
  const { requestPin, PinModalNode } = useEmployeePinGate();

  const [q, setQ]               = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearch]  = useState(false);
  const [openDrop, setOpenDrop] = useState(false);
  const [client, setClient]     = useState(null); // { id, first_name, last_name, email, phone }

  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');
  const [empId,  setEmpId]  = useState('');
  const [busy,   setBusy]   = useState(false);

  // Liste des employés disponibles : actifs + can_grant_credit + PIN actif.
  // On charge l'état PIN une fois au mount pour filtrer correctement.
  const [pinByEmp, setPinByEmp] = useState({}); // { [employeeId]: { has_pin, is_active } }
  useEffect(() => {
    let cancelled = false;
    api.getEmployeePins()
      .then(rows => {
        if (cancelled) return;
        const map = {};
        (rows || []).forEach(r => { map[r.employee_id] = { has_pin: !!r.has_pin, is_active: !!r.is_active }; });
        setPinByEmp(map);
      })
      .catch(() => { if (!cancelled) setPinByEmp({}); });
    return () => { cancelled = true; };
  }, []);

  const eligibleEmployees = employees.filter(e =>
    e.is_active !== false &&
    e.can_grant_credit === true &&
    pinByEmp[e.id]?.has_pin === true &&
    pinByEmp[e.id]?.is_active === true
  );

  // Recherche client debounced 350 ms (1 input → first_name+last_name, email, phone côté back).
  const reqIdRef = useRef(0);
  useEffect(() => {
    if (client) return; // pas de recherche tant qu'un client est sélectionné
    const term = q.trim();
    if (term.length < 2) { setResults([]); setSearch(false); return; }
    setSearch(true);
    const myId = ++reqIdRef.current;
    const tm = setTimeout(() => {
      clientsApi.search(term)
        .then(rows => {
          if (myId !== reqIdRef.current) return;
          setResults(Array.isArray(rows) ? rows : []);
          setSearch(false);
        })
        .catch(() => {
          if (myId !== reqIdRef.current) return;
          setResults([]); setSearch(false);
        });
    }, 350);
    return () => clearTimeout(tm);
  }, [q, client]);

  const reset = () => {
    setQ(''); setResults([]); setOpenDrop(false); setClient(null);
    setAmount(''); setNote(''); setEmpId('');
  };

  const pickClient = (c) => {
    setClient(c);
    setQ(''); setResults([]); setOpenDrop(false);
  };

  const submit = async () => {
    if (!client?.id)        return showToast && showToast('Sélectionnez un client.', 'error');
    if (!empId)             return showToast && showToast('Sélectionnez un employé signataire.', 'error');
    const val = parseFloat(amount);
    if (!Number.isFinite(val) || val <= 0)
      return showToast && showToast('Le montant doit être positif.', 'error');

    const emp = employees.find(e => e.id === empId) || null;
    if (!emp)               return showToast && showToast('Employé introuvable.', 'error');
    if (!pinByEmp[emp.id]?.has_pin || !pinByEmp[emp.id]?.is_active)
      return showToast && showToast("Cet employé n'a pas de PIN actif.", 'error');

    await requestPin(emp, "Accorder un crédit", async () => {
      setBusy(true);
      try {
        await creditsApi.grant({
          client_id:   client.id,
          amount:      val,
          note:        note.trim() || undefined,
          employee_id: emp.id,
        }, emp.id);
        if (showToast) showToast("Crédit accordé", 'ok');
        try { window.dispatchEvent(new Event('ff-tx-refresh')); } catch { /* noop */ }
        reset();
        if (onGranted) onGranted();
      } catch (e) {
        if (showToast) showToast(e.message || 'Erreur', 'error');
      } finally { setBusy(false); }
    });
  };

  const inp = {
    width:'100%', padding:'9px 12px', borderRadius:8,
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:13, fontFamily:'inherit',
    boxSizing:'border-box', outline:'none',
  };

  const clientLabel = client
    ? `${[client.first_name, client.last_name].filter(Boolean).join(' ').trim() || client.email || 'Client'}${client.email ? ' · ' + client.email : ''}${client.phone ? ' · ' + client.phone : ''}`
    : '';

  return (
    <div style={{ padding:14, borderRadius:12, background:t.card,
                  border:`0.5px solid ${t.border}`,
                  display:'flex', flexDirection:'column', gap:10 }}>
      <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text }}>
        {"Accorder un crédit"}
      </p>

      <div style={{ position:'relative' }}>
        <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>
          {"Client * (nom, prénom, email ou téléphone)"}
        </p>
        {client ? (
          <div style={{ display:'flex', alignItems:'center', gap:8,
                        padding:'9px 12px', borderRadius:8,
                        background:t.cardAlt, border:`0.5px solid ${t.borderInput}` }}>
            <div style={{ flex:1, minWidth:0, fontSize:13, color:t.text,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {clientLabel}
            </div>
            <button type="button" onClick={() => setClient(null)}
                    style={{ padding:'4px 8px', border:'none', background:'transparent',
                             cursor:'pointer', color:t.muted, fontSize:12, fontFamily:'inherit' }}>
              {"Changer"}
            </button>
          </div>
        ) : (
          <>
            <input type="text" value={q}
                   onChange={e => { setQ(e.target.value); setOpenDrop(true); }}
                   onFocus={() => setOpenDrop(true)}
                   onBlur={() => setTimeout(() => setOpenDrop(false), 150)}
                   placeholder="Rechercher un client…"
                   style={inp}/>
            {openDrop && q.trim().length >= 2 && (
              <div style={{ position:'absolute', left:0, right:0, top:'100%',
                            marginTop:4, zIndex:20, maxHeight:240, overflowY:'auto',
                            background:t.card, border:`0.5px solid ${t.border}`,
                            borderRadius:8,
                            boxShadow:t.shadowModal || '0 8px 24px rgba(0,0,0,0.12)' }}>
                {searching ? (
                  <p style={{ margin:0, padding:'10px 12px', fontSize:12, color:t.muted }}>
                    {"Recherche…"}
                  </p>
                ) : results.length === 0 ? (
                  <p style={{ margin:0, padding:'10px 12px', fontSize:12, color:t.muted }}>
                    {"Aucun client trouvé."}
                  </p>
                ) : results.map(r => {
                  const nm = `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || 'Client';
                  return (
                    <button key={r.id} type="button"
                            onMouseDown={(e) => { e.preventDefault(); pickClient(r); }}
                            style={{ display:'block', width:'100%', textAlign:'left',
                                     padding:'9px 12px', border:'none',
                                     borderBottom:`0.5px solid ${t.separator}`,
                                     background:'transparent', cursor:'pointer',
                                     fontFamily:'inherit', color:t.text, fontSize:13 }}>
                      <div style={{ fontWeight:500 }}>{nm}</div>
                      <div style={{ fontSize:11, color:t.muted, marginTop:2 }}>
                        {[r.email, r.phone].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Montant (DA) *"}</p>
        <input type="number" step="0.01" min="0.01" value={amount}
               onChange={e => setAmount(e.target.value)} placeholder="5 000"
               style={{ ...inp, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                        textAlign:'right' }}/>
      </div>
      <div>
        <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Employé signataire *"}</p>
        <select value={empId} onChange={e => setEmpId(e.target.value)} style={inp}>
          <option value="">{"— Sélectionner —"}</option>
          {eligibleEmployees.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        {eligibleEmployees.length === 0 && (
          <p style={{ margin:'4px 0 0', fontSize:10, color:'#991b1b' }}>
            {"Aucun employé éligible : il faut un employé actif avec can_grant_credit ET un PIN actif."}
          </p>
        )}
      </div>
      <div>
        <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Note"}</p>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder="Raison du crédit…"
                  style={{ ...inp, resize:'vertical' }}/>
      </div>

      {(() => {
        const valNum   = parseFloat(amount);
        const amountOk = Number.isFinite(valNum) && valNum > 0;
        const formOk   = !!client?.id && !!empId && amountOk;
        const disabled = busy || !formOk;
        return (
          <button onClick={submit} disabled={disabled}
                  style={{ padding:'11px 14px', borderRadius:8, border:'none',
                           background: disabled ? t.cardAlt : '#10b981',
                           color: disabled ? t.muted : '#fff',
                           cursor: busy ? 'wait' : (disabled ? 'not-allowed' : 'pointer'),
                           fontFamily:'inherit', fontSize:13, fontWeight:500,
                           transition:'background 0.15s, color 0.15s' }}>
            {busy ? 'Envoi…' : 'Accorder le crédit'}
          </button>
        );
      })()}

      <p style={{ margin:0, fontSize:10, color:t.muted }}>
        {"Le PIN de l'employé signataire est exigé pour valider le crédit."}
      </p>

      {PinModalNode}
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────
export default function Credit({ employees = [], theme, showToast, transactions = [] }) {
  const t = theme;
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [page, setPage]         = useState(0); // 0-indexed
  const [list, setList]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [kpiTotalGranted, setKpiTotalGranted]   = useState(0);
  const [kpiClientsActive, setKpiClientsActive] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [detailId, setDetailId] = useState(null);

  // GET /credits?search&only_active&limit&offset → { rows, total, total_balance, active_clients_count }.
  // Pagination 5 / page côté serveur pour ne pas charger toute la base
  // d'un coup. Les KPI viennent du backend (toujours merchant-wide actifs)
  // et restent stables pendant une recherche.
  const load = (searchQ, pageIdx) => {
    setLoading(true);
    const params = { limit: PAGE_SIZE, offset: pageIdx * PAGE_SIZE };
    const qt = (searchQ ?? '').trim();
    if (qt) params.search = qt;
    else    params.only_active = 'true';
    return creditsApi.list(params)
      .then(r => {
        const rows = Array.isArray(r?.rows) ? r.rows : [];
        setList(rows);
        setTotal(Number(r?.total) || 0);
        setKpiTotalGranted(Number(r?.total_balance) || 0);
        setKpiClientsActive(Number(r?.active_clients_count) || 0);
        setLoading(false);
      })
      .catch(e => {
        setList([]); setTotal(0); setLoading(false);
        if (showToast) showToast(e.message || 'Erreur chargement crédits', 'error');
      });
  };

  // Debounce 350 ms sur q. Reset à la page 0 quand la recherche change.
  useEffect(() => {
    setPage(0);
  }, [q]);

  useEffect(() => {
    const tm = setTimeout(() => { load(q, page); }, q.trim() && page === 0 ? 350 : 0);
    return () => clearTimeout(tm);
  }, [q, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onRefresh = () => load(q, page);
    window.addEventListener('ff-tx-refresh', onRefresh);
    return () => window.removeEventListener('ff-tx-refresh', onRefresh);
  }, [q, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = list;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
      <div style={{ ...card, display:'flex', gap:10, alignItems:'center',
                    padding:'10px 14px', minHeight:46 }}>
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
            // Si la ligne est anonymisee MAIS qu'un snapshot debt_record existe
            // (le client a ete supprime APRES la mise en place du registre),
            // on recupere ses coordonnees pour permettre le recouvrement legal.
            const hasDebtRecord = !!c.debt_record_id;
            const debtFullName = hasDebtRecord
              ? [c.debt_first_name, c.debt_last_name].filter(Boolean).join(' ') || 'Client supprimé'
              : null;
            const balanceNum = parseFloat(c.balance || 0);
            const isDebt = balanceNum < 0;
            const nbGrants = parseFloat(c.total_granted || 0) > 0 ? 1 : 0;
            const nbRepays = parseFloat(c.total_repaid  || 0) > 0 ? 1 : 0;
            const summary = [
              nbGrants ? 'accordé ' + fmt(c.total_granted) : null,
              nbRepays ? 'remboursé ' + fmt(c.total_repaid) : null,
            ].filter(Boolean).join(' · ') || '—';
            return (
              <div key={c.id}
                   style={{ display:'flex', gap:12, alignItems:'center',
                            padding:'11px 12px', minHeight:48,
                            borderBottom:`0.5px solid ${t.separator}` }}>
                <div style={{ width:36, height:36, borderRadius:99,
                              background: isAnonymous && !hasDebtRecord ? '#9ca3af'
                                        : isAnonymous && hasDebtRecord ? '#fb923c'
                                        : avatarColorFor(email),
                              color:'#fff', display:'flex',
                              alignItems:'center', justifyContent:'center',
                              fontSize:13, fontWeight:500, flexShrink:0 }}>
                  {isAnonymous
                    ? (hasDebtRecord ? initialsOf(debtFullName, c.debt_email || '') : '?')
                    : initialsOf(displayName, email)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:500,
                              color: isAnonymous && !hasDebtRecord ? t.muted : t.text,
                              fontStyle: isAnonymous && !hasDebtRecord ? 'italic' : 'normal',
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {isAnonymous
                      ? (hasDebtRecord ? debtFullName : 'Client anonyme')
                      : displayName}
                    {hasDebtRecord && (
                      <span title="Compte client supprimé — coordonnées du registre Créances (dettes)"
                            style={{ marginLeft:6, fontSize:9, fontWeight:500,
                                     padding:'1px 6px', borderRadius:8,
                                     background:'#fff7ed', color:'#9a3412',
                                     verticalAlign:'middle' }}>
                        Compte supprimé
                      </span>
                    )}
                  </p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {isAnonymous
                      ? (hasDebtRecord
                          ? `${c.debt_email || ''}${c.debt_email && c.debt_phone ? ' · ' : ''}${c.debt_phone || ''}`
                          : "Email anonymisé (loi 18-07) — coordonnées non récupérables (compte supprimé avant mise en place du registre)")
                      : (email || summary)}
                  </p>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:500,
                              color: isDebt ? '#991b1b' : '#065f46',
                              fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {fmt(c.balance)}
                  </p>
                  {hasDebtRecord ? (
                    <button onClick={() => navigate('/clients?view=debts')}
                            style={{ marginTop:3, minHeight:30, padding:'3px 6px',
                                     border:'none', background:'transparent',
                                     cursor:'pointer', color:'#9a3412',
                                     fontFamily:'inherit', fontSize:11, fontWeight:500 }}>
                      Voir dans Créances (dettes) →
                    </button>
                  ) : (
                    <button onClick={() => setDetailId(c.client_id || c.id)}
                            disabled={!c.client_id}
                            style={{ marginTop:3, minHeight:30, padding:'3px 6px',
                                     border:'none',
                                     background:'transparent', cursor: c.client_id ? 'pointer' : 'not-allowed',
                                     color: c.client_id ? t.muted : t.dim || t.muted,
                                     fontFamily:'inherit', fontSize:11 }}>
                      {c.client_id ? 'Voir détail →' : '—'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination 5 / page — la base ne renvoie que la page courante. */}
          {!loading && total > PAGE_SIZE && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                          gap:10, paddingTop:10, marginTop:6,
                          borderTop:`0.5px solid ${t.separator}` }}>
              <button type="button"
                      disabled={page <= 0}
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      style={{ padding:'6px 10px', borderRadius:8,
                               border:`0.5px solid ${t.border}`,
                               background:'transparent',
                               color: page <= 0 ? t.muted : t.text,
                               cursor: page <= 0 ? 'not-allowed' : 'pointer',
                               fontFamily:'inherit', fontSize:12 }}>
                {"← Précédent"}
              </button>
              <span style={{ fontSize:11, color:t.muted }}>
                {`Page ${page + 1} / ${totalPages} — ${total} client${total > 1 ? 's' : ''}`}
              </span>
              <button type="button"
                      disabled={page + 1 >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                      style={{ padding:'6px 10px', borderRadius:8,
                               border:`0.5px solid ${t.border}`,
                               background:'transparent',
                               color: page + 1 >= totalPages ? t.muted : t.text,
                               cursor: page + 1 >= totalPages ? 'not-allowed' : 'pointer',
                               fontFamily:'inherit', fontSize:12 }}>
                {"Suivant →"}
              </button>
            </div>
          )}

          <p style={{ margin:'10px 0 0', fontSize:10, color:t.muted }}>
            {"L'utilisation d'un crédit se fait via l'étape Paiement de l'encaissement (crée une transaction revenue source='credit' + décrément du solde + audit trail)."}
          </p>
        </div>

        <GrantForm employees={employees} theme={t}
                   showToast={showToast}
                   onGranted={() => load(q, page)}/>
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
