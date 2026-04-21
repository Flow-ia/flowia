// src/pages/employee-agenda/modals/NewApptModal.jsx
import { useState } from 'react';
import { Modal } from '../../../components/UI';
import { Button, Label } from '../../../components/primitives';
import { svLocal, toMin, fromMin } from '../helpers';
import Spin from '../components/Spin';

export default function NewApptModal({ empId, services, onSave, onClose, theme: t }) {
  const [client, setClient] = useState({
    name: '', email: '', phone: '',
    date: svLocal(new Date()), start_time: '09:00', notes: '',
  });
  const setC = (k,v) => setClient(p=>({...p,[k]:v}));
  const [cart, setCart] = useState([]);
  const [customDuration, setCustomDuration] = useState('');
  const [saving, setSaving] = useState(false);

  const actSvcs    = (services||[]).filter(s => s.is_active !== false);
  const autoTotal    = cart.reduce((s,it)=>s+it.unit_price*it.qty, 0);
  const autoDuration = cart.reduce((s,it)=>s+it.duration_minutes*it.qty, 0);
  const totalDuration = customDuration !== '' ? parseInt(customDuration)||0 : autoDuration;
  const endTime = client.start_time && totalDuration > 0 ? fromMin(toMin(client.start_time) + totalDuration) : '';

  const addSvc = svc => setCart(p => {
    const i = p.findIndex(x => x.service_id === svc.id);
    if (i >= 0) { const n = [...p]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
    return [...p, {
      service_id: svc.id,
      service_name: svc.name,
      qty: 1,
      unit_price: parseFloat(svc.price) || 0,
      duration_minutes: svc.duration_minutes || 0,
      color: svc.color || t.text,
    }];
  });
  const changeQty = (i, d) => setCart(p => {
    const n = [...p]; const q = (n[i].qty || 1) + d;
    if (q <= 0) return p.filter((_, j) => j !== i);
    n[i] = { ...n[i], qty: q };
    return n;
  });
  const setPrice = (i, v) => setCart(p => {
    const n = [...p]; n[i] = { ...n[i], unit_price: parseFloat(v) || 0 }; return n;
  });

  const handleSave = async () => {
    if (!client.name.trim() || !client.date || !client.start_time) return;
    setSaving(true);
    try {
      await onSave({
        employee_id: empId,
        client_name: client.name,
        client_email: client.email || null,
        client_phone: client.phone || null,
        date: client.date,
        start_time: client.start_time,
        notes: client.notes || null,
        items: cart,
        total_amount: autoTotal,
        total_duration: totalDuration,
        custom_duration: customDuration !== '' ? parseInt(customDuration) || 0 : null,
      });
      onClose();
    } catch(e) { alert(e.message || 'Une erreur est survenue.'); } finally { setSaving(false); }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 14,
    background: t.inputBg,
    border: `0.5px solid ${t.borderInput}`,
    color: t.text,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const sectionCard = {
    background: t.card,
    border: `0.5px solid ${t.border}`,
    borderRadius: 12,
    overflow: 'hidden',
  };

  const sectionHeader = (label, color = t.muted) => ({
    padding: '10px 16px',
    background: t.cardAlt,
    borderBottom: `0.5px solid ${t.border}`,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  });

  return (
    <Modal open={true} onClose={onClose} title="Nouveau rendez-vous" theme={t}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {/* Client */}
        <div style={sectionCard}>
          <div style={sectionHeader('Client')}>
            <p style={{ margin:0, fontSize:12, fontWeight:500, color:t.muted }}>Client</p>
          </div>
          <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
            <input
              value={client.name}
              onChange={e=>setC('name',e.target.value)}
              placeholder="Prenom Nom *"
              style={inputStyle}
            />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <input
                value={client.phone}
                onChange={e=>setC('phone',e.target.value)}
                placeholder="Telephone"
                style={inputStyle}
              />
              <input
                type="email"
                value={client.email}
                onChange={e=>setC('email',e.target.value)}
                placeholder="Email"
                style={inputStyle}
              />
            </div>
            {client.email && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background: '#f0fdf4',
                borderLeft: '2px solid #10b981',
              }}>
                <p style={{ margin:0, fontSize:12, color:'#065f46' }}>
                  Confirmation envoyee automatiquement
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Services */}
        <div style={sectionCard}>
          <div style={sectionHeader('Services')}>
            <p style={{ margin:0, fontSize:12, fontWeight:500, color:t.muted }}>Services / produits</p>
          </div>
          {actSvcs.length > 0 ? (
            <div style={{ padding:12 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {actSvcs.map(svc => {
                  const inCart = cart.find(it => it.service_id === svc.id);
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => addSvc(svc)}
                      style={{
                        borderRadius: 8,
                        padding: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                        background: inCart ? t.cardAlt : 'transparent',
                        border: `0.5px solid ${inCart ? t.borderStrong : t.border}`,
                        fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <div style={{ width:20, height:20, borderRadius:6, background:svc.color||t.text, flexShrink:0 }} />
                        <p style={{
                          margin: 0,
                          fontSize: 12,
                          fontWeight: 500,
                          color: t.text,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>{svc.name}</p>
                        {inCart && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 500,
                            padding: '1px 6px',
                            borderRadius: 8,
                            background: t.card,
                            color: t.text,
                            flexShrink: 0,
                            border: `0.5px solid ${t.border}`,
                          }}>×{inCart.qty}</span>
                        )}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <span style={{ fontSize:11, color:t.muted }}>{svc.duration_minutes}min</span>
                        {parseFloat(svc.price) > 0 && (
                          <span style={{ fontSize:11, fontWeight:500, color:'#065f46' }}>
                            {parseFloat(svc.price).toFixed(2)} €
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ padding:'16px', textAlign:'center' }}>
              <p style={{ margin:0, fontSize:13, color:t.muted }}>Aucun service actif configure.</p>
            </div>
          )}

          {cart.length > 0 && (
            <div style={{ padding:'0 12px 12px', display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ height:1, background:t.border, margin:'4px 0' }} />
              {cart.map((it, idx) => (
                <div key={idx} style={{
                  background: t.card,
                  border: `0.5px solid ${t.border}`,
                  borderRadius: 12,
                  padding: 12,
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:2, height:32, borderRadius:99, background:it.color||t.text, flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{
                        margin: 0,
                        fontSize: 12,
                        fontWeight: 500,
                        color: t.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>{it.service_name}</p>
                      <p style={{ margin:'1px 0 0', fontSize:10, color:t.muted }}>
                        {it.duration_minutes}min/unite
                      </p>
                    </div>
                    <div style={{ position:'relative', width:80 }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={it.unit_price}
                        onChange={e=>setPrice(idx, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 20px 6px 8px',
                          borderRadius: 8,
                          textAlign: 'right',
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#065f46',
                          background: '#f0fdf4',
                          border: '0.5px solid rgba(16,185,129,0.25)',
                          outline: 'none',
                          fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      />
                      <span style={{
                        position: 'absolute',
                        right: 6,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: 10,
                        color: t.muted,
                        pointerEvents: 'none',
                      }}>€</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                      <button
                        type="button"
                        onClick={() => changeQty(idx, -1)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: 'transparent',
                          color: '#991b1b',
                          border: '0.5px solid rgba(239,68,68,0.3)',
                          cursor: 'pointer',
                          fontWeight: 500,
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'inherit',
                        }}
                      >−</button>
                      <span style={{ width:20, textAlign:'center', fontSize:13, fontWeight:500, color:t.text }}>{it.qty}</span>
                      <button
                        type="button"
                        onClick={() => changeQty(idx, 1)}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: 'transparent',
                          color: t.text,
                          border: `0.5px solid ${t.borderStrong}`,
                          cursor: 'pointer',
                          fontWeight: 500,
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'inherit',
                        }}
                      >+</button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCart(p => p.filter((_, i) => i !== idx))}
                      aria-label="Supprimer"
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: 'transparent',
                        border: '0.5px solid rgba(239,68,68,0.3)',
                        cursor: 'pointer',
                        color: '#991b1b',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontFamily: 'inherit',
                      }}
                    >✕</button>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: `0.5px solid ${t.border}`,
                  }}>
                    <span style={{ fontSize:11, color:t.muted }}>{it.duration_minutes * it.qty}min total</span>
                    <span style={{ fontSize:12, fontWeight:500, color:'#065f46' }}>
                      {(it.unit_price * it.qty).toFixed(2)} €
                    </span>
                  </div>
                </div>
              ))}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 12,
                background: '#f0fdf4',
                borderLeft: '2px solid #10b981',
              }}>
                <p style={{ margin:0, fontSize:11, fontWeight:500, color:'#065f46' }}>TOTAL</p>
                <p style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 500,
                  color: '#065f46',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>{autoTotal.toFixed(2)} €</p>
              </div>
            </div>
          )}
        </div>

        {/* Horaire */}
        <div style={sectionCard}>
          <div style={sectionHeader('Horaire')}>
            <p style={{ margin:0, fontSize:12, fontWeight:500, color:t.muted }}>Horaire</p>
          </div>
          <div style={{ padding:12, display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              <div>
                <Label>Date *</Label>
                <input type="date" value={client.date} onChange={e=>setC('date',e.target.value)} style={inputStyle} />
              </div>
              <div>
                <Label>Debut *</Label>
                <input type="time" value={client.start_time} onChange={e=>setC('start_time',e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <Label style={{ marginBottom:0 }}>
                  Duree
                  {autoDuration > 0 && customDuration === '' && (
                    <span style={{ fontWeight:400, color:'#065f46', marginLeft:6 }}>(auto : {autoDuration}min)</span>
                  )}
                </Label>
                {customDuration !== '' && (
                  <button
                    type="button"
                    onClick={() => setCustomDuration('')}
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 10px',
                      borderRadius: 8,
                      background: 'transparent',
                      color: t.text,
                      border: `0.5px solid ${t.borderStrong}`,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >Auto ({autoDuration}min)</button>
                )}
              </div>
              <div style={{ position:'relative' }}>
                <input
                  type="number"
                  min="1"
                  step="5"
                  value={customDuration !== '' ? customDuration : (autoDuration > 0 ? String(autoDuration) : '')}
                  onChange={e=>setCustomDuration(e.target.value)}
                  placeholder={autoDuration > 0 ? String(autoDuration) : '30'}
                  style={{ ...inputStyle, paddingRight:42 }}
                />
                <span style={{
                  position: 'absolute',
                  right: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 12,
                  color: t.muted,
                  pointerEvents: 'none',
                }}>min</span>
              </div>
            </div>
            {endTime && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background: t.cardAlt,
                border: `0.5px solid ${t.border}`,
              }}>
                <p style={{ margin:0, fontSize:12, fontWeight:500, color:t.text }}>
                  Fin prevue a <span style={{ fontWeight:500 }}>{endTime}</span> ({totalDuration}min)
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label>Notes</Label>
          <textarea
            value={client.notes}
            onChange={e=>setC('notes',e.target.value)}
            rows={2}
            placeholder="Informations…"
            style={{ ...inputStyle, resize:'none' }}
          />
        </div>

        <Button
          fullWidth
          size="large"
          disabled={!client.name.trim() || !client.date || !client.start_time || saving}
          onClick={handleSave}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
        >
          {saving ? (<><Spin size={18}/>Enregistrement…</>) : `Creer${autoTotal > 0 ? ' - ' + autoTotal.toFixed(2) + ' €' : ''}`}
        </Button>
        {cart.length === 0 && (
          <p style={{ margin:'-6px 0 0', fontSize:11, textAlign:'center', color:t.muted }}>
            Aucun service selectionne (facultatif)
          </p>
        )}
      </div>
    </Modal>
  );
}
