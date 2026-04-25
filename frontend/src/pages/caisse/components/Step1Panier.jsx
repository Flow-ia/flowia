// Caisse > Encaisser > Step 1 · Panier.
// Layout 2 colonnes desktop : catégories hiérarchiques pliables (parent
// replié par défaut, ouverture montre ses produits en grille 3 colonnes)
// + panier à droite avec +/− qty + total + bouton Continuer.
// Logique et structure du cart alignées sur EncaisserSheet (App.jsx inline)
// pour que la payload finale reste 100% compatible avec POST /api/transactions.
import { useState } from 'react';
import { Icon } from '../../../components/Icon';

// ── Modale montant libre (FreePriceModal simplifiée, même UX qu'App.jsx) ──
function FreePriceModal({ catName, isCustom, theme: t, onCancel, onConfirm }) {
  const [amount, setAmount] = useState('');
  const [name, setName]     = useState(catName || '');
  const [err, setErr]       = useState('');
  const confirm = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { setErr('Entrez un montant valide.'); return; }
    onConfirm(isCustom ? (name.trim() || 'Autre') : catName, val);
  };
  const inp = {
    width: '100%', padding: '10px 12px', borderRadius: 8, outline: 'none',
    background: t.inputBg, border: `0.5px solid ${t.borderInput}`,
    color: t.text, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
  };
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
         style={{ position:'fixed', inset:0, zIndex:1000, padding:20,
                  background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth:360, borderRadius:16, padding:22,
                    background:t.card, border:`0.5px solid ${t.border}`,
                    boxShadow: t.shadowModal || '0 10px 30px rgba(0,0,0,0.2)' }}>
        <p style={{ margin:0, fontSize:14, fontWeight:500, color:t.text }}>
          {isCustom ? 'Montant libre' : catName}
        </p>
        <p style={{ margin:'3px 0 12px', fontSize:11, color:t.muted }}>
          {isCustom ? "Saisie libre — aucun produit associé" : "Produit à prix libre"}
        </p>
        {isCustom && (
          <div style={{ marginBottom:8 }}>
            <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Libellé *"}</p>
            <input value={name} onChange={e => { setName(e.target.value); setErr(''); }}
                   placeholder="Ex : Pourboire, autre…" style={inp}/>
          </div>
        )}
        <div>
          <p style={{ margin:'0 0 4px', fontSize:11, color:t.muted, fontWeight:500 }}>{"Montant (€) *"}</p>
          <input type="number" step="0.01" min="0.01" value={amount}
                 onChange={e => { setAmount(e.target.value); setErr(''); }}
                 onKeyDown={e => e.key === 'Enter' && confirm()}
                 placeholder="0.00"
                 style={{ ...inp, paddingRight:32, fontSize:18, fontWeight:500,
                          fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
                          textAlign:'right', color:'#92400e' }}/>
        </div>
        {err && <p style={{ margin:'6px 0 0', fontSize:11, color:'#991b1b' }}>{err}</p>}
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <button onClick={onCancel}
                  style={{ flex:1, padding:'9px 12px', borderRadius:8,
                           border:`0.5px solid ${t.border}`, background:t.cardAlt,
                           color:t.text, cursor:'pointer', fontFamily:'inherit',
                           fontSize:12, fontWeight:500 }}>
            {"Annuler"}
          </button>
          <button onClick={confirm}
                  style={{ flex:2, padding:'9px 12px', borderRadius:8, border:'none',
                           background:t.text, color:t.bg, cursor:'pointer',
                           fontFamily:'inherit', fontSize:12, fontWeight:500 }}>
            {"Ajouter au panier"}
          </button>
        </div>
      </div>
    </div>
  );
}

function fmt(n) { return Number(n || 0).toFixed(2); }

export default function Step1Panier({
  categories = [], cart, setCart, theme: t, onContinue,
}) {
  const [openCat,   setOpenCat]   = useState(null);
  const [editPrice, setEditPrice] = useState(null);

  // Hiérarchie : parents (parent_id null) + enfants (parent_id = parent.id).
  // Seules les catégories `type='revenue'` côté caisse sont affichées.
  const revCats  = categories.filter(c => c.type === 'revenue' || !c.type);
  const parents  = revCats.filter(c => !c.parent_id);
  const childrenOf = (pid) => revCats.filter(c => c.parent_id === pid);

  const addToCart = (cat, explicitPrice) => {
    const price = (explicitPrice != null) ? parseFloat(explicitPrice)
                                          : parseFloat(cat.price || 0);
    if (!price || price <= 0) {
      setEditPrice({ catName: cat.name, category_id: cat.id, icon: cat.icon, color: cat.color });
      return;
    }
    setCart(prev => {
      const idx = prev.findIndex(it => it.category_id === cat.id && !it.is_free_price);
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, {
        category_id: cat.id, name: cat.name, price, qty: 1,
        icon: cat.icon, color: cat.color,
      }];
    });
  };

  const addCustom = () => setEditPrice({ isCustom: true });

  const changeQty  = (idx, delta) => setCart(prev => {
    const next = [...prev]; const nq = next[idx].qty + delta;
    if (nq <= 0) return prev.filter((_, i) => i !== idx);
    next[idx] = { ...next[idx], qty: nq };
    return next;
  });
  const clearCart  = () => setCart([]);

  const total = cart.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);

  const card = {
    padding: 14, borderRadius: 12, background: t.card,
    border: `0.5px solid ${t.border}`,
    display: 'flex', flexDirection: 'column', gap: 10,
  };
  const cardTitle = { margin: 0, fontSize: 13, fontWeight: 500, color: t.text };

  return (
    <>
      <div style={{ display:'grid',
                    gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 14 }}>
        {/* ── Colonne gauche : catégories ── */}
        <div style={card}>
          <p style={cardTitle}>{"Catégories"}</p>
          {parents.length === 0 ? (
            <p style={{ margin:0, fontSize:12, color:t.muted }}>
              {"Aucune catégorie. Créez-les dans Réglages > Caisse · Config."}
            </p>
          ) : parents.map(parent => {
            const kids = childrenOf(parent.id);
            const isOpen = openCat === parent.id;
            return (
              <div key={parent.id}
                   style={{ padding:10, border:`0.5px solid ${t.border}`,
                            borderRadius:8, background: isOpen ? t.cardAlt : 'transparent' }}>
                <button onClick={() => setOpenCat(isOpen ? null : parent.id)}
                        style={{ width:'100%', border:'none', background:'transparent',
                                 cursor:'pointer', display:'flex', alignItems:'center',
                                 justifyContent:'space-between', fontFamily:'inherit',
                                 color:t.text, padding:0 }}>
                  <span style={{ display:'flex', alignItems:'center', gap:8,
                                 fontSize:13, fontWeight:500 }}>
                    <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} color={t.muted}/>
                    {parent.name}
                  </span>
                  <span style={{ fontSize:11, color:t.muted }}>
                    {kids.length + (kids.length > 1 ? ' prestations' : ' prestation')}
                  </span>
                </button>
                {isOpen && kids.length > 0 && (
                  <div style={{ display:'grid',
                                gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',
                                gap: 8, marginTop: 10 }}>
                    {kids.map(k => (
                      <button key={k.id} onClick={() => addToCart(k)}
                              style={{ padding:12, borderRadius:8,
                                       minHeight: 72,
                                       border:`0.5px solid ${t.border}`,
                                       background:t.card, color:t.text,
                                       cursor:'pointer', fontFamily:'inherit',
                                       display:'flex', flexDirection:'column',
                                       justifyContent:'space-between',
                                       alignItems:'center', gap:6 }}>
                        <span style={{ textAlign:'center', fontSize:13, fontWeight:500,
                                       color:t.text,
                                       overflow:'hidden', textOverflow:'ellipsis',
                                       whiteSpace:'nowrap', width:'100%' }}>
                          {k.name}
                        </span>
                        <strong style={{ fontSize:15, fontWeight:500, color:t.text,
                                         fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                          {k.is_free_price || !k.price ? 'Libre' : fmt(k.price) + ' €'}
                        </strong>
                      </button>
                    ))}
                  </div>
                )}
                {isOpen && kids.length === 0 && (
                  <p style={{ margin:'8px 0 0', fontSize:11, color:t.muted, textAlign:'center' }}>
                    {"Pas de sous-catégorie."}
                  </p>
                )}
              </div>
            );
          })}
          <button onClick={addCustom}
                  style={{ width:'100%', minHeight:42,
                           padding:'11px 16px', borderRadius:8,
                           border:`0.5px solid ${t.border}`,
                           background:t.cardAlt, color:t.text,
                           cursor:'pointer', fontFamily:'inherit',
                           fontSize:13, fontWeight:500,
                           display:'inline-flex', alignItems:'center',
                           justifyContent:'center', gap:6 }}>
            <Icon name="plus" size={14} color={t.text}/>
            {"Montant libre"}
          </button>
        </div>

        {/* ── Colonne droite : panier ── */}
        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <p style={cardTitle}>{"Panier"}</p>
            {cart.length > 0 && (
              <button onClick={clearCart}
                      style={{ fontSize:11, color:'#991b1b',
                               background:'transparent', border:'none', cursor:'pointer',
                               fontFamily:'inherit', fontWeight:500 }}>
                {"Vider"}
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <p style={{ margin:'8px 0', fontSize:12, color:t.muted, textAlign:'center' }}>
              {"Sélectionnez une prestation ou saisissez un montant libre."}
            </p>
          ) : cart.map((it, idx) => (
            <div key={idx}
                 style={{ display:'flex', justifyContent:'space-between',
                          alignItems:'center', padding:'10px 0', gap:10,
                          borderBottom:`0.5px solid ${t.separator}` }}>
              <div style={{ minWidth:0, flex:1 }}>
                <p style={{ margin:0, fontSize:13, fontWeight:500, color:t.text,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {it.name}
                </p>
                <p style={{ margin:'2px 0 0', fontSize:11, color:t.muted }}>
                  {fmt(it.price)} €
                </p>
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                <button onClick={() => changeQty(idx, -1)}
                        style={{ width:32, height:32, borderRadius:6,
                                 border:`0.5px solid ${t.border}`,
                                 background:t.cardAlt, color:t.text,
                                 cursor:'pointer', fontFamily:'inherit',
                                 fontSize:15, fontWeight:500 }}>
                  {"−"}
                </button>
                <span style={{ fontWeight:500, fontSize:15, color:t.text,
                               minWidth:24, textAlign:'center' }}>
                  {it.qty}
                </span>
                <button onClick={() => changeQty(idx, +1)}
                        style={{ width:32, height:32, borderRadius:6,
                                 border:`0.5px solid ${t.border}`,
                                 background:t.cardAlt, color:t.text,
                                 cursor:'pointer', fontFamily:'inherit',
                                 fontSize:15, fontWeight:500 }}>
                  {"+"}
                </button>
                <div style={{ minWidth:68, textAlign:'right', fontWeight:500, fontSize:13, color:t.text,
                              fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {fmt(it.price * it.qty)} €
                </div>
              </div>
            </div>
          ))}

          {cart.length > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between',
                          padding:'10px 0 0', fontSize:17, fontWeight:500,
                          color:t.text, borderTop:`0.5px solid ${t.separator}` }}>
              <span>{"Total"}</span>
              <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {fmt(total)} €
              </span>
            </div>
          )}

          <button onClick={onContinue}
                  disabled={cart.length === 0}
                  style={{ width:'100%', minHeight:48,
                           padding:'13px 18px', borderRadius:8, border:'none',
                           background: cart.length === 0 ? t.cardAlt : '#10b981',
                           color: cart.length === 0 ? t.muted : '#fff',
                           cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                           fontFamily:'inherit', fontSize:14, fontWeight:500,
                           display:'inline-flex', alignItems:'center',
                           justifyContent:'center', gap:6 }}>
            {"Continuer"}
            <Icon name="chevronRight" size={14} color={cart.length === 0 ? t.muted : '#fff'}/>
          </button>
        </div>
      </div>

      {editPrice && (
        <FreePriceModal
          catName={editPrice.catName}
          isCustom={!!editPrice.isCustom}
          theme={t}
          onCancel={() => setEditPrice(null)}
          onConfirm={(name, price) => {
            setCart(prev => [...prev, {
              category_id: editPrice.category_id || null,
              name, price, qty: 1,
              is_free_price: true,
              icon: editPrice.icon, color: editPrice.color,
            }]);
            setEditPrice(null);
          }}
        />
      )}
    </>
  );
}
