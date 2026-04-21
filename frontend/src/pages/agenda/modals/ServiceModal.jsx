import { useState } from 'react';
import { Modal } from '../../../components/UI';
import { Button, Field, Label } from '../../../components/primitives';
import { COLORS } from '../constants';
import Toggle from '../components/Toggle';

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120];

export default function ServiceModal({ svc, categories, onSave, onClose, theme: t }) {
  const [form, setForm] = useState({
    name:             svc?.name || '',
    description:      svc?.description || '',
    duration_minutes: svc?.duration_minutes || 30,
    price:            svc?.price || '',
    color:            svc?.color || t.text,
    is_active:        svc?.is_active !== false,
    category_id:      svc?.category_id || '',
  });
  const [saving, setSaving] = useState(false);
  const cats = (categories || []).filter((c) => !c.parent_id);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={svc ? 'Modifier le service' : 'Nouveau service'} theme={t}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Nom *" style={{ marginBottom: 0 }}>
          <input
            value={form.name}
            onChange={(e) => setF('name', e.target.value)}
            placeholder="Ex : Coupe homme"
            style={inputStyle}
          />
        </Field>

        <Field label="Durée" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DURATIONS.map((d) => {
              const active = form.duration_minutes === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setF('duration_minutes', d)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    background: active ? t.text : 'transparent',
                    color: active ? t.bg : t.muted,
                    border: active ? 'none' : `0.5px solid ${t.border}`,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {d}min
                </button>
              );
            })}
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Prix (€)" style={{ marginBottom: 0 }}>
            <input
              type="number"
              value={form.price}
              onChange={(e) => setF('price', e.target.value)}
              placeholder="0.00"
              style={inputStyle}
            />
          </Field>
          <Field label="Couleur" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
              {COLORS.map((c) => {
                const active = form.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setF('color', c)}
                    aria-label={`Couleur ${c}`}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: c,
                      border: active ? `2px solid ${t.text}` : `0.5px solid ${t.border}`,
                      cursor: 'pointer',
                      transition: 'transform 0.1s ease',
                      transform: active ? 'scale(1.1)' : 'scale(1)',
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          </Field>
        </div>

        {cats.length > 0 && (
          <Field label="Catégorie" style={{ marginBottom: 0 }}>
            <select
              value={form.category_id}
              onChange={(e) => setF('category_id', e.target.value)}
              style={inputStyle}
            >
              <option value="">Sans catégorie</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Description" style={{ marginBottom: 0 }}>
          <textarea
            value={form.description}
            onChange={(e) => setF('description', e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'none' }}
          />
        </Field>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderRadius: 8,
            background: t.cardAlt,
          }}
        >
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: t.text, margin: 0 }}>Service actif</p>
            <p style={{ fontSize: 11, color: t.muted, margin: '2px 0 0' }}>
              Visible dans le catalogue et le booking public
            </p>
          </div>
          <Toggle on={form.is_active} onChange={() => setF('is_active', !form.is_active)} />
        </div>

        <Button fullWidth disabled={!form.name || saving} onClick={submit}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </Modal>
  );
}
