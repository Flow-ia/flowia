import { useState } from 'react';
import { Modal } from '../../../components/UI';
import { Button, Field, Label } from '../../../components/primitives';
import { svLocal, toMin, fromMin } from '../helpers';

export default function AddApptModal({ employees, services, selectedDate, onSave, onClose, theme: t }) {
  const [client, setClient] = useState({
    name: '',
    email: '',
    phone: '',
    date: selectedDate ? svLocal(selectedDate) : svLocal(new Date()),
    start_time: '09:00',
    notes: '',
    employee_id: '',
  });
  const setC = (k, v) => setClient((p) => ({ ...p, [k]: v }));

  const [cart, setCart] = useState([]);
  const [customDuration, setCustomDuration] = useState('');
  const [saving, setSaving] = useState(false);
  // Commit 25 — modale de confirmation RDV passé. Friction supplémentaire
  // pour éviter les saisies erronées (ex: walk-in oublié vs erreur de doigt).
  const [confirmPast, setConfirmPast] = useState(false);

  const actSvcs = (services || []).filter((s) => s.is_active !== false);
  const actEmps = (employees || []).filter((e) => e.is_active !== false);

  const autoTotal = cart.reduce((s, it) => s + it.unit_price * it.qty, 0);
  const autoDuration = cart.reduce((s, it) => s + it.duration_minutes * it.qty, 0);
  const totalDuration = customDuration !== '' ? parseInt(customDuration, 10) || 0 : autoDuration;

  const endTime = (() => {
    if (!client.start_time || totalDuration <= 0) return '';
    return fromMin(toMin(client.start_time) + totalDuration);
  })();

  const addSvc = (svc) =>
    setCart((prev) => {
      const idx = prev.findIndex((it) => it.service_id === svc.id);
      if (idx >= 0) {
        const n = [...prev];
        n[idx] = { ...n[idx], qty: n[idx].qty + 1 };
        return n;
      }
      return [
        ...prev,
        {
          service_id: svc.id,
          service_name: svc.name,
          qty: 1,
          unit_price: parseFloat(svc.price) || 0,
          duration_minutes: svc.duration_minutes || 0,
          color: svc.color || t.text,
        },
      ];
    });

  const changeQty = (idx, delta) =>
    setCart((prev) => {
      const n = [...prev];
      const q = (n[idx].qty || 1) + delta;
      if (q <= 0) return prev.filter((_, i) => i !== idx);
      n[idx] = { ...n[idx], qty: q };
      return n;
    });

  const setPrice = (idx, val) =>
    setCart((prev) => {
      const n = [...prev];
      n[idx] = { ...n[idx], unit_price: parseFloat(val) || 0 };
      return n;
    });

  // Commit 25 — détecte un RDV daté avant aujourd'hui (cas walk-in
  // a posteriori OU erreur de saisie). Compare en local pour éviter les
  // pièges TZ : svLocal(today) en YYYY-MM-DD + comparaison string.
  const todayStr = svLocal(new Date());
  const isPast = client.date && client.date < todayStr;

  const doSave = async () => {
    setSaving(true);
    try {
      await onSave({
        employee_id: client.employee_id || null,
        client_name: client.name,
        client_email: client.email || null,
        client_phone: client.phone || null,
        date: client.date,
        start_time: client.start_time,
        notes: client.notes || null,
        items: cart,
        total_amount: autoTotal,
        total_duration: totalDuration,
        custom_duration: customDuration !== '' ? parseInt(customDuration, 10) || 0 : null,
      });
      onClose();
    } catch (e) {
      alert(e.message || 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!client.name.trim() || !client.date || !client.start_time) return;
    if (isPast) { setConfirmPast(true); return; }
    doSave();
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

  const cardBlock = {
    borderRadius: 12,
    border: `0.5px solid ${t.border}`,
    overflow: 'hidden',
  };
  const cardHeader = {
    padding: '10px 14px',
    background: t.cardAlt,
    borderBottom: `0.5px solid ${t.border}`,
  };
  const cardHeaderLabel = { fontSize: 11, color: t.muted, margin: 0, fontWeight: 500 };

  return (
    <Modal open={true} onClose={onClose} title="Nouveau rendez-vous" theme={t}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── Client ── */}
        <div style={cardBlock}>
          <div style={cardHeader}>
            <p style={cardHeaderLabel}>Client</p>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={client.name}
              onChange={(e) => setC('name', e.target.value)}
              placeholder="Prénom Nom *"
              style={inputStyle}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                value={client.phone}
                onChange={(e) => setC('phone', e.target.value)}
                placeholder="Téléphone"
                style={inputStyle}
              />
              <input
                type="email"
                value={client.email}
                onChange={(e) => setC('email', e.target.value)}
                placeholder="Email"
                style={inputStyle}
              />
            </div>
            {client.email && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: '#f0fdf4',
                  borderLeft: '2px solid #10b981',
                }}
              >
                <span
                  style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }}
                />
                <p style={{ fontSize: 11, color: '#065f46', margin: 0 }}>
                  Confirmation envoyée automatiquement
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Employé ── */}
        {actEmps.length > 0 && (
          <div style={cardBlock}>
            <div style={cardHeader}>
              <p style={cardHeaderLabel}>Employé</p>
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setC('employee_id', '')}
                  style={chipStyle(t, !client.employee_id)}
                >
                  Aucun
                </button>
                {actEmps.map((emp) => {
                  const active = client.employee_id === emp.id;
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => setC('employee_id', emp.id)}
                      style={chipStyle(t, active)}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 8,
                          fontWeight: 500,
                          flexShrink: 0,
                          background: emp.avatar_color || t.text,
                        }}
                      >
                        {emp.name.charAt(0)}
                      </span>
                      {emp.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Services / Produits ── */}
        <div style={cardBlock}>
          <div style={cardHeader}>
            <p style={cardHeaderLabel}>Services / Produits</p>
          </div>
          {actSvcs.length > 0 ? (
            <div style={{ padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {actSvcs.map((svc) => {
                  const inCart = cart.find((it) => it.service_id === svc.id);
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => addSvc(svc)}
                      style={{
                        borderRadius: 8,
                        padding: 10,
                        textAlign: 'left',
                        background: inCart ? t.cardAlt : 'transparent',
                        border: `0.5px solid ${inCart ? t.borderStrong : t.border}`,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 6,
                            flexShrink: 0,
                            background: svc.color || t.text,
                          }}
                        />
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: t.text,
                            margin: 0,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {svc.name}
                        </p>
                        {inCart && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              padding: '1px 6px',
                              borderRadius: 99,
                              background: t.text,
                              color: t.bg,
                              flexShrink: 0,
                            }}
                          >
                            ×{inCart.qty}
                          </span>
                        )}
                      </div>
                      <div
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <span style={{ fontSize: 11, color: t.muted }}>{svc.duration_minutes}min</span>
                        {parseFloat(svc.price) > 0 && (
                          <span style={{ fontSize: 11, color: t.muted }}>
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
            <div style={{ padding: '12px 14px' }}>
              <p style={{ fontSize: 12, color: t.muted, margin: 0 }}>
                Aucun service actif configuré.
              </p>
            </div>
          )}

          {/* Cart */}
          {cart.length > 0 && (
            <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ height: 1, background: t.separator || t.border }} />
              {cart.map((it, idx) => (
                <div
                  key={idx}
                  style={{
                    borderRadius: 8,
                    padding: 10,
                    background: t.cardAlt,
                    border: `0.5px solid ${t.border}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 2,
                        height: 32,
                        borderRadius: 99,
                        background: it.color || t.text,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: t.text,
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {it.service_name}
                      </p>
                      <p style={{ fontSize: 11, color: t.muted, margin: '2px 0 0' }}>
                        {it.duration_minutes}min/unité
                      </p>
                    </div>
                    <div style={{ position: 'relative', width: 76 }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={it.unit_price}
                        onChange={(e) => setPrice(idx, e.target.value)}
                        style={{
                          ...inputStyle,
                          padding: '6px 18px 6px 8px',
                          textAlign: 'right',
                          fontSize: 13,
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          right: 6,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: 11,
                          color: t.muted,
                          pointerEvents: 'none',
                        }}
                      >
                        €
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => changeQty(idx, -1)}
                        style={iconBtn(t)}
                      >
                        −
                      </button>
                      <span
                        style={{ width: 18, textAlign: 'center', fontWeight: 500, fontSize: 13, color: t.text }}
                      >
                        {it.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeQty(idx, 1)}
                        style={iconBtn(t)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCart((p) => p.filter((_, i) => i !== idx))}
                      style={{
                        ...iconBtn(t),
                        color: '#991b1b',
                        border: '0.5px solid rgba(239,68,68,0.25)',
                      }}
                      aria-label="Retirer"
                    >
                      ×
                    </button>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: `0.5px solid ${t.separator || t.border}`,
                    }}
                  >
                    <span style={{ fontSize: 11, color: t.muted }}>
                      {it.duration_minutes * it.qty}min total
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: t.text }}>
                      {(it.unit_price * it.qty).toFixed(2)} €
                    </span>
                  </div>
                </div>
              ))}
              <div
                style={{
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#f0fdf4',
                  borderLeft: '2px solid #10b981',
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 500, color: '#065f46', margin: 0 }}>Total</p>
                <p style={{ fontSize: 15, fontWeight: 500, color: '#065f46', margin: 0 }}>
                  {autoTotal.toFixed(2)} €
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Horaire ── */}
        <div style={cardBlock}>
          <div style={cardHeader}>
            <p style={cardHeaderLabel}>Horaire</p>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <Label>Date *</Label>
                <input
                  type="date"
                  value={client.date}
                  onChange={(e) => setC('date', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <Label>Début *</Label>
                <input
                  type="time"
                  value={client.start_time}
                  onChange={(e) => setC('start_time', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <Label style={{ marginBottom: 0 }}>
                  Durée
                  {autoDuration > 0 && customDuration === '' && (
                    <span style={{ marginLeft: 6, color: t.muted }}>
                      (auto : {autoDuration}min)
                    </span>
                  )}
                </Label>
                {customDuration !== '' && (
                  <button
                    type="button"
                    onClick={() => setCustomDuration('')}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'transparent',
                      border: `0.5px solid ${t.border}`,
                      color: t.muted,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Auto ({autoDuration}min)
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="1"
                  step="5"
                  value={customDuration !== '' ? customDuration : autoDuration > 0 ? String(autoDuration) : ''}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder={autoDuration > 0 ? String(autoDuration) : '30'}
                  style={{ ...inputStyle, paddingRight: 42 }}
                />
                <span
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 12,
                    color: t.muted,
                    pointerEvents: 'none',
                  }}
                >
                  min
                </span>
              </div>
            </div>
            {endTime && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: t.cardAlt,
                  border: `0.5px solid ${t.border}`,
                }}
              >
                <span
                  style={{ width: 6, height: 6, borderRadius: '50%', background: t.text, flexShrink: 0 }}
                />
                <p style={{ fontSize: 12, color: t.textSub || t.text, margin: 0 }}>
                  Fin prévue à{' '}
                  <span style={{ fontWeight: 500, color: t.text }}>{endTime}</span>
                  {' '}({totalDuration}min)
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <Field label="Notes" style={{ marginBottom: 0 }}>
          <textarea
            value={client.notes}
            onChange={(e) => setC('notes', e.target.value)}
            rows={2}
            placeholder="Informations…"
            style={{ ...inputStyle, resize: 'none' }}
          />
        </Field>

        <Button
          fullWidth
          disabled={!client.name.trim() || !client.date || !client.start_time || saving}
          onClick={handleSave}
        >
          {saving ? 'Enregistrement…' : `Créer${autoTotal > 0 ? ' — ' + autoTotal.toFixed(2) + ' €' : ''}`}
        </Button>
        {cart.length === 0 && (
          <p style={{ fontSize: 11, textAlign: 'center', color: t.muted, margin: '-8px 0 0' }}>
            Aucun service sélectionné (facultatif)
          </p>
        )}
      </div>

      {/* Confirmation RDV daté avant aujourd'hui — commit 25. */}
      {confirmPast && (
        <Modal open={true} onClose={() => setConfirmPast(false)} title="RDV dans le passé" theme={t}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 10,
                          background: '#fffbeb', border: '0.5px solid #fde68a',
                          borderLeft: '2px solid #f59e0b' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#92400e"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,marginTop:1}}>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: '#92400e', margin: 0 }}>
                  RDV dans le passé
                </p>
                <p style={{ fontSize: 12, color: '#92400e', margin: '6px 0 0', lineHeight: 1.5 }}>
                  Vous êtes sur le point de créer un RDV pour le {client.date} qui est antérieur à aujourd'hui.
                  Cas d'usage : enregistrement a posteriori d'un walk-in.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" fullWidth onClick={() => setConfirmPast(false)}>
                Annuler
              </Button>
              <Button fullWidth disabled={saving}
                      onClick={() => { setConfirmPast(false); doSave(); }}>
                {saving ? 'Enregistrement…' : 'Oui, créer ce RDV'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

function chipStyle(t, active) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    background: active ? t.cardAlt : 'transparent',
    border: `0.5px solid ${active ? t.borderStrong : t.border}`,
    color: active ? t.text : t.muted,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

function iconBtn(t) {
  return {
    width: 26,
    height: 26,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    color: t.text,
    border: `0.5px solid ${t.border}`,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}
