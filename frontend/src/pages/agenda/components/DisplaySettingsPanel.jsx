import { useState } from 'react';
import { Button, Field, Label, SegmentedControl } from '../../../components/primitives';
import { I } from '../../../utils/icons';

export default function DisplaySettingsPanel({ displayCfg, onChange, theme: t }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderRadius: 8,
          background: 'transparent',
          border: `0.5px solid ${t.borderStrong}`,
          color: t.text,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >
        <I.Settings width={14} height={14} />
        Affichage
      </button>
    );
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 13,
    background: t.inputBg,
    border: `0.5px solid ${t.borderInput}`,
    color: t.text,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          background: t.elevated,
          border: `0.5px solid ${t.border}`,
          borderRadius: 16,
          padding: 20,
          margin: 16,
          boxShadow: t.shadowModal,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ fontSize: 15, fontWeight: 500, color: t.text, margin: 0 }}>
            Paramètres d{"'"}affichage
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: 'none',
              background: t.cardAlt,
              color: t.muted,
              fontSize: 15,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        <Field label={"Mode d'affichage"} style={{ marginBottom: 16 }}>
          <SegmentedControl
            fullWidth
            value={displayCfg.viewMode}
            onChange={(v) => onChange('viewMode', v)}
            options={[
              { value: 'grid', label: 'Grille (heures)' },
              { value: 'list', label: 'Liste (cartes)' },
            ]}
          />
        </Field>

        <Field label="Heures affichées" style={{ marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>Début</Label>
              <input
                type="time"
                value={displayCfg.startHour}
                onChange={(e) => onChange('startHour', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <Label>Fin</Label>
              <input
                type="time"
                value={displayCfg.endHour}
                onChange={(e) => onChange('endHour', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </Field>
        <p style={{ fontSize: 11, color: t.dim, margin: '0 0 16px' }}>
          Pour les horaires nocturnes (ex : 13h → 02h), entrez 13:00 et 02:00
        </p>

        <Field label={`Hauteur par heure — ${displayCfg.hourH}px`} style={{ marginBottom: 20 }}>
          <input
            type="range"
            min="48"
            max="120"
            step="8"
            value={displayCfg.hourH}
            onChange={(e) => onChange('hourH', parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: t.text }}
          />
        </Field>

        <Button fullWidth onClick={() => setOpen(false)}>
          Appliquer
        </Button>
      </div>
    </div>
  );
}
