import { useState, useEffect, useRef, useCallback } from 'react';
import { referralsApi } from '../../../../utils/api';
import { Button, Label } from '../../../../components/primitives';

const REF_PAGE_SIZE = 5;

export default function TabReferral({ theme, showToast }) {
  const t = theme;
  const [cfg, setCfg] = useState({
    is_enabled:false,
    parrain_type:'percent', parrain_value:10,
    filleul_type:'percent', filleul_value:10,
    limit_count: null, limit_period: 'unlimited',
  });
  const [codes, setCodes]     = useState([]);
  const [codesTotal, setCodesTotal] = useState(0);
  const [codesLoading, setCodesLoading] = useState(false);
  const [refSearch, setRefSearch] = useState('');
  const [refPage,   setRefPage]   = useState(0);
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // Charge le programme + stats une fois au mount
  useEffect(() => {
    Promise.all([
      referralsApi.getProgram(),
      referralsApi.getStats().catch(() => null),
    ]).then(([prog, st]) => {
      setCfg({
        is_enabled: !!prog.is_enabled,
        parrain_type: prog.parrain_type || 'percent',
        parrain_value: Number(prog.parrain_value || 0),
        filleul_type: prog.filleul_type || 'percent',
        filleul_value: Number(prog.filleul_value || 0),
        limit_period: prog.limit_period || 'unlimited',
        limit_count:  prog.limit_count != null ? Number(prog.limit_count) : null,
      });
      setStats(st);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Charge les codes paginés (5/page) avec recherche serveur. seqRef pour
  // ignorer les reponses perimees si l'user tape vite.
  const codesSeqRef = useRef(0);
  const loadCodes = useCallback(async (search, page) => {
    const seq = ++codesSeqRef.current;
    setCodesLoading(true);
    try {
      const trimmed = String(search || '').trim();
      const sendSearch = trimmed.length >= 2 ? trimmed : '';
      const r = await referralsApi.listCodes({
        search: sendSearch,
        limit: REF_PAGE_SIZE,
        offset: page * REF_PAGE_SIZE,
      });
      if (seq !== codesSeqRef.current) return;
      // Backwards-compat : si l'ancien backend renvoie un tableau direct
      const rows  = Array.isArray(r) ? r : (r.rows || []);
      const total = Array.isArray(r) ? rows.length : (r.total || 0);
      setCodes(rows);
      setCodesTotal(total);
    } catch {
      if (seq === codesSeqRef.current) { setCodes([]); setCodesTotal(0); }
    } finally {
      if (seq === codesSeqRef.current) setCodesLoading(false);
    }
  }, []);

  // Reset page quand recherche change
  useEffect(() => { setRefPage(0); }, [refSearch]);

  // Debounce 350ms si recherche >= 2 chars, sinon load immediat
  useEffect(() => {
    const trimmed = refSearch.trim();
    const needsDebounce = trimmed.length >= 2;
    const tm = setTimeout(() => loadCodes(refSearch, refPage), needsDebounce ? 350 : 0);
    return () => clearTimeout(tm);
  }, [refSearch, refPage, loadCodes]);

  const save = async () => {
    setSaving(true);
    try {
      await referralsApi.updateProgram(cfg);
      showToast('Programme de parrainage enregistre');
    } catch (e) { showToast(e.message || 'Erreur', 'err'); }
    finally { setSaving(false); }
  };

  const toggleEnabled = async () => {
    const next = { ...cfg, is_enabled: !cfg.is_enabled };
    setCfg(next);
    try {
      await referralsApi.updateProgram(next);
      showToast(next.is_enabled ? 'Programme active' : 'Programme desactive');
    } catch (e) {
      setCfg(cfg);
      showToast(e.message || 'Erreur', 'err');
    }
  };

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:14, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  const Tog = ({ on, onChange, colorOn }) => (
    <button onClick={onChange}
            style={{ width:40, height:22, borderRadius:99, border:'none', cursor:'pointer',
                     position:'relative', flexShrink:0,
                     background: on ? (colorOn || t.text) : t.cardAlt,
                     transition:'background 0.2s', fontFamily:'inherit' }}>
      <div style={{ width:18, height:18, borderRadius:'50%', background:'white',
                    position:'absolute', top:2, left: on ? 20 : 2,
                    transition:'left 0.15s', boxShadow:t.shadowSm }}/>
    </button>
  );

  if (loading) return <p style={{ fontSize:13, color:t.muted, margin:0 }}>Chargement…</p>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Stats agregees */}
      {stats && (stats.uses_pending + stats.uses_validated + stats.uses_cancelled) > 0 && (
        <div style={{ padding:16, borderRadius:12,
                      background:t.card, border:`0.5px solid ${t.border}` }}>
          <p style={{ fontSize:12, color:t.muted, margin:'0 0 14px' }}>
            Stats parrainage
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))',
                        gap:10, marginBottom:14 }}>
            {[
              ['Codes actifs', stats.total_codes,      '#3c3489', '#eeedfe'],
              ['En attente',   stats.uses_pending,     '#92400e', '#fffbeb'],
              ['Valides',      stats.uses_validated,   '#065f46', '#f0fdf4'],
              ['Refuses',      stats.uses_cancelled,   '#991b1b', '#fef2f2'],
            ].map(([lbl, val, col, bg]) => (
              <div key={lbl} style={{ padding:'10px 12px', borderRadius:8, background:bg }}>
                <p style={{ fontSize:10, color:col, opacity:0.75, margin:0 }}>{lbl}</p>
                <p style={{ fontSize:18, fontWeight:500, color:col,
                            margin:'4px 0 0', fontFamily:'var(--mono)' }}>
                  {val}
                </p>
              </div>
            ))}
          </div>
          <div style={{ padding:'10px 12px', borderRadius:8,
                        background:'#eef2ff', marginBottom:14 }}>
            <p style={{ fontSize:11, color:'#4338ca', margin:0 }}>
              Total des remises filleul accordees :{' '}
              <strong style={{ fontWeight:500, fontFamily:'var(--mono)' }}>
                {stats.filleul_discount_total.toFixed(2)} €
              </strong>
            </p>
          </div>
          {stats.top_parrains && stats.top_parrains.length > 0 && (
            <>
              <p style={{ fontSize:11, color:t.muted, margin:'0 0 8px' }}>Top parrains</p>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {stats.top_parrains.map((p, i) => {
                  const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email;
                  return (
                    <div key={p.email}
                         style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                  padding:'8px 12px', borderRadius:8,
                                  background:t.cardAlt,
                                  border:`0.5px solid ${t.border}` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                        <span style={{ fontSize:11, fontWeight:500, color:t.muted, width:20 }}>
                          #{i + 1}
                        </span>
                        <span style={{ fontSize:13, fontWeight:500, color:t.text,
                                       overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {name}
                        </span>
                      </div>
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <span style={{ fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:99,
                                       background:'#f0fdf4', color:'#065f46' }}>
                          {p.validated}
                        </span>
                        {p.pending > 0 && (
                          <span style={{ fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:99,
                                         background:'#fffbeb', color:'#92400e' }}>
                            {p.pending}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ padding:16, borderRadius:12,
                    background:t.card, border:`0.5px solid ${t.border}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div>
            <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0 }}>
              Programme de parrainage active
            </p>
            <p style={{ fontSize:11, color:t.muted, margin:'2px 0 0' }}>
              {"Chaque client connecte dispose d'un lien unique a partager."}
            </p>
          </div>
          <Tog on={cfg.is_enabled} onChange={toggleEnabled} colorOn="#4338ca"/>
        </div>

        <p style={{ fontSize:11, color:t.muted, margin:'0 0 8px' }}>Recompense parrain</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <select value={cfg.parrain_type}
                  onChange={e => setCfg(c => ({ ...c, parrain_type:e.target.value }))}
                  style={{ ...inp, cursor:'pointer' }}>
            <option value="percent">%</option>
            <option value="fixed">Montant fixe (€)</option>
          </select>
          <input type="number" min="0" step="0.01" value={cfg.parrain_value}
                 onChange={e => setCfg(c => ({ ...c, parrain_value:e.target.value }))} style={inp}/>
        </div>

        <p style={{ fontSize:11, color:t.muted, margin:'0 0 8px' }}>Recompense filleul</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <select value={cfg.filleul_type}
                  onChange={e => setCfg(c => ({ ...c, filleul_type:e.target.value }))}
                  style={{ ...inp, cursor:'pointer' }}>
            <option value="percent">%</option>
            <option value="fixed">Montant fixe (€)</option>
          </select>
          <input type="number" min="0" step="0.01" value={cfg.filleul_value}
                 onChange={e => setCfg(c => ({ ...c, filleul_value:e.target.value }))} style={inp}/>
        </div>

        <p style={{ fontSize:11, color:t.muted, margin:'0 0 8px' }}>Limite par parrain</p>
        <div style={{ display:'grid',
                      gridTemplateColumns: (cfg.limit_period === 'unlimited' || cfg.limit_period === 'lifetime') ? '1fr' : '1fr 1fr',
                      gap:10, marginBottom:14 }}>
          <select value={cfg.limit_period}
                  onChange={e => {
                    const lp = e.target.value;
                    setCfg(c => ({
                      ...c,
                      limit_period: lp,
                      limit_count: lp === 'lifetime' ? 1
                                : lp === 'unlimited' ? null
                                : (c.limit_count || 3),
                    }));
                  }}
                  style={{ ...inp, cursor:'pointer' }}>
            <option value="unlimited">Illimite</option>
            <option value="lifetime">Une seule fois a vie</option>
            <option value="month">X fois par mois</option>
            <option value="3months">X fois sur 3 mois</option>
            <option value="year">X fois par an</option>
          </select>
          {(cfg.limit_period !== 'unlimited' && cfg.limit_period !== 'lifetime') && (
            <input type="number" min="1" step="1" value={cfg.limit_count ?? ''}
                   onChange={e => setCfg(c => ({ ...c, limit_count: e.target.value ? Number(e.target.value) : null }))}
                   placeholder="Nombre" style={inp}/>
          )}
        </div>

        <Button variant="primary" fullWidth type="button" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      {(codesTotal > 0 || refSearch.trim().length >= 2) && (
        <div style={{ padding:16, borderRadius:12,
                      background:t.card, border:`0.5px solid ${t.border}` }}>
          <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:'0 0 10px' }}>
            Parrains actifs ({codesTotal})
          </p>

          {/* Recherche par nom / prenom / telephone / email */}
          <div style={{ position:'relative', marginBottom:10 }}>
            <input
              type="text"
              value={refSearch}
              onChange={e => setRefSearch(e.target.value)}
              placeholder="Rechercher par nom, prenom, telephone ou email…"
              style={{ ...inp, paddingRight: refSearch ? 34 : 12, fontSize:13 }}
            />
            {refSearch && (
              <button
                type="button"
                onClick={() => setRefSearch('')}
                aria-label="Effacer"
                style={{ position:'absolute', right:10, top:'50%',
                         transform:'translateY(-50%)', background:'none', border:'none',
                         cursor:'pointer', color:t.muted, fontSize:14,
                         padding:0, fontFamily:'inherit' }}
              >✕</button>
            )}
          </div>

          {codesLoading ? (
            <p style={{ fontSize:12, color:t.muted, margin:'12px 0', textAlign:'center' }}>
              Chargement…
            </p>
          ) : codes.length === 0 ? (
            <p style={{ fontSize:12, color:t.muted, margin:'12px 0', textAlign:'center' }}>
              {refSearch.trim().length >= 2
                ? `Aucun parrain trouve pour "${refSearch.trim()}".`
                : 'Aucun parrain actif pour le moment.'}
            </p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {codes.map(c => {
                const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
                const displayName = fullName || c.owner_client_email;
                return (
                  <div key={c.id}
                       style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                                padding:'10px 12px', borderRadius:8,
                                background:t.cardAlt }}>
                    <div style={{ minWidth:0, flex:1 }}>
                      <p style={{ fontSize:13, fontWeight:500, color:t.text, margin:0,
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {displayName}
                      </p>
                      <p style={{ fontSize:11, color:t.muted, margin:'2px 0 0',
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {fullName ? c.owner_client_email : ''}
                        {c.phone ? `${fullName ? ' · ' : ''}${c.phone}` : ''}
                      </p>
                      <p style={{ fontSize:10, color:t.dim, margin:'2px 0 0', fontFamily:'monospace' }}>
                        {c.code}
                      </p>
                    </div>
                    <span style={{ fontSize:11, fontWeight:500, color:'#4338ca',
                                   padding:'3px 10px', borderRadius:99, background:'#eef2ff',
                                   flexShrink:0, marginLeft:8 }}>
                      {c.uses_count} filleul{c.uses_count > 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination 5/page (server-side) */}
          {codesTotal > REF_PAGE_SIZE && (() => {
            const totalPages = Math.max(1, Math.ceil(codesTotal / REF_PAGE_SIZE));
            const cur  = Math.min(refPage, totalPages - 1);
            const from = cur * REF_PAGE_SIZE + 1;
            const to   = Math.min((cur + 1) * REF_PAGE_SIZE, codesTotal);
            return (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                            gap:10, marginTop:12, paddingTop:10,
                            borderTop:`0.5px solid ${t.separator}` }}>
                <p style={{ fontSize:11, color:t.muted, margin:0 }}>
                  {from}–{to} sur {codesTotal}
                </p>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <Button variant="secondary" size="small" type="button"
                          onClick={() => setRefPage(p => Math.max(0, p - 1))}
                          disabled={cur <= 0}>
                    ← Prec.
                  </Button>
                  <span style={{ padding:'6px 10px', fontSize:11, fontWeight:500, color:t.muted }}>
                    {cur + 1} / {totalPages}
                  </span>
                  <Button variant="secondary" size="small" type="button"
                          onClick={() => setRefPage(p => Math.min(totalPages - 1, p + 1))}
                          disabled={cur >= totalPages - 1}>
                    Suiv. →
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div style={{ padding:'10px 14px', borderRadius:8, background:'#eef2ff' }}>
        <p style={{ fontSize:12, color:'#4338ca', lineHeight:1.5, margin:0 }}>
          Quand un filleul reserve via <code style={{ fontFamily:'monospace' }}>?ref=CODE</code>, un code promo est cree automatiquement pour le parrain et le filleul (valable 60 jours).
        </p>
      </div>
    </div>
  );
}
