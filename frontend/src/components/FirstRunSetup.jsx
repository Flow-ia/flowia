import { useState, useEffect } from 'react';
import { api, bookingApi } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Toast, useToast } from './UI';
import { Button, Label } from './primitives';

// Jours dans l'ordre semaine FR (lun d'abord), avec mapping vers day_of_week
// Postgres standard (0=dim ... 6=sam) deja utilise par business_hours.
const DAYS = [
  { dow: 1, label: 'Lundi' },
  { dow: 2, label: 'Mardi' },
  { dow: 3, label: 'Mercredi' },
  { dow: 4, label: 'Jeudi' },
  { dow: 5, label: 'Vendredi' },
  { dow: 6, label: 'Samedi' },
  { dow: 0, label: 'Dimanche' },
];

const STEPS = [
  { key: 'hours',    title: 'Vos horaires d\'ouverture' },
  { key: 'services', title: 'Vos prestations' },
  { key: 'payments', title: 'Paiements en ligne' },
  { key: 'finish',   title: 'Tout est pret' },
];

// Wizard "Fast Onboarding" affiche apres MerchantOnboarding pour les nouveaux
// commercants (user.setupCompleted === false). 4 etapes courtes :
//   1. Horaires — pre-remplis (Lun-Ven 9-19, Sam 9-17, Dim ferme), editables
//   2. Services — pre-remplis selon business_type, is_active toggle + edition
//   3. Paiements — CTA Stripe Connect (skip facile)
//   4. Recap — POST /api/auth/setup-complete et entree dans l'app
// Bouton "Configurer plus tard" en haut a droite skip tout le wizard.
export function FirstRunSetup({ user, onComplete }) {
  const { theme: t } = useTheme();
  const { updateUser } = useAuth();
  const [step, setStep] = useState(0);
  const [hours, setHours] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, show] = useToast();

  // Chargement initial : les defauts ont ete seedes cote backend a
  // l'inscription, on les recupere pour permettre au commercant de les
  // ajuster directement dans le wizard.
  useEffect(() => {
    (async () => {
      try {
        const [h, s] = await Promise.all([bookingApi.getHours(), bookingApi.getServices()]);
        // Normaliser hours sur l'ordre semaine + caster is_open booleen
        const byDow = {};
        for (const row of h || []) byDow[row.day_of_week] = row;
        const ordered = DAYS.map(d => byDow[d.dow] || {
          day_of_week: d.dow, open_time: '09:00', close_time: '18:00', is_open: d.dow !== 0,
        });
        setHours(ordered.map(r => ({
          day_of_week: r.day_of_week,
          open_time:  String(r.open_time  || '09:00').slice(0,5),
          close_time: String(r.close_time || '18:00').slice(0,5),
          is_open:    r.is_open !== false,
        })));
        setServices((s || []).map(srv => ({
          id:               srv.id,
          name:             srv.name,
          duration_minutes: srv.duration_minutes,
          price:            srv.price != null ? String(srv.price) : '',
          color:            srv.color,
          is_active:        srv.is_active === true,
        })));
      } catch (e) {
        show(e.message || 'Erreur de chargement', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const finish = async () => {
    setSaving(true);
    try {
      await api.setupComplete();
      updateUser({ setupCompleted: true });
      onComplete?.();
    } catch (e) {
      show(e.message || 'Impossible de terminer', 'error');
      setSaving(false);
    }
  };

  // Skip total : passe le flag a TRUE sans sauver les changements en cours.
  const skipAll = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await api.setupComplete();
      updateUser({ setupCompleted: true });
      onComplete?.();
    } catch (e) {
      show(e.message || 'Erreur', 'error');
      setSaving(false);
    }
  };

  const saveHoursAndNext = async () => {
    setSaving(true);
    try {
      await bookingApi.saveHours({ hours });
      setStep(1);
    } catch (e) {
      show(e.message || 'Sauvegarde horaires impossible', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveServicesAndNext = async () => {
    setSaving(true);
    try {
      for (const s of services) {
        const priceNum = s.price === '' ? null : Number(String(s.price).replace(',', '.'));
        await bookingApi.updateService(s.id, {
          name:             s.name,
          duration_minutes: Number(s.duration_minutes) || 30,
          price:            Number.isFinite(priceNum) ? priceNum : null,
          color:            s.color,
          is_active:        s.is_active,
        });
      }
      setStep(2);
    } catch (e) {
      show(e.message || 'Sauvegarde services impossible', 'error');
    } finally {
      setSaving(false);
    }
  };

  const next = () => setStep(s => Math.min(STEPS.length - 1, s + 1));
  const prev = () => setStep(s => Math.max(0, s - 1));

  const overlayStyle = {
    minHeight: '100dvh', background: t.bg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  };

  if (loading) {
    return (
      <div style={overlayStyle}>
        <p style={{ color: t.muted, fontSize: 13 }}>Chargement de votre espace...</p>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <Toast msg={toast?.msg} type={toast?.type}/>
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* Header — progress dots + skip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 24 : 8, height: 8,
                borderRadius: 4,
                background: i <= step ? t.text : t.border,
                transition: 'width 0.2s ease, background 0.2s ease',
              }}/>
            ))}
            <span style={{ fontSize: 11, color: t.muted, marginLeft: 6 }}>
              {step + 1} / {STEPS.length}
            </span>
          </div>
          {step < STEPS.length - 1 && (
            <button type="button" onClick={skipAll} disabled={saving}
                    style={{
                      background: 'transparent', border: 'none',
                      color: t.muted, fontSize: 12, fontFamily: 'inherit',
                      cursor: saving ? 'wait' : 'pointer', padding: 4,
                    }}>
              Configurer plus tard
            </button>
          )}
        </div>

        <div style={{
          background: t.card, borderRadius: 16, padding: 28,
          border: `0.5px solid ${t.border}`, boxShadow: t.shadowLg,
          maxHeight: '78vh', overflowY: 'auto',
        }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: t.text, margin: '0 0 6px' }}>
            {STEPS[step].title}
          </h1>

          {step === 0 && (
            <HoursStep t={t} hours={hours} setHours={setHours}/>
          )}
          {step === 1 && (
            <ServicesStep t={t} services={services} setServices={setServices}/>
          )}
          {step === 2 && (
            <PaymentsStep t={t} user={user}/>
          )}
          {step === 3 && (
            <FinishStep t={t} hours={hours} services={services}/>
          )}

          {/* Footer */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', gap: 10,
            marginTop: 22, paddingTop: 16,
            borderTop: `0.5px solid ${t.border}`,
          }}>
            <Button type="button" variant="ghost" onClick={prev}
                    disabled={step === 0 || saving}>
              Retour
            </Button>
            {step === 0 && (
              <Button type="button" variant="primary"
                      onClick={saveHoursAndNext} disabled={saving}>
                {saving ? 'Sauvegarde...' : 'Continuer'}
              </Button>
            )}
            {step === 1 && (
              <Button type="button" variant="primary"
                      onClick={saveServicesAndNext} disabled={saving}>
                {saving ? 'Sauvegarde...' : 'Continuer'}
              </Button>
            )}
            {step === 2 && (
              <Button type="button" variant="primary" onClick={next} disabled={saving}>
                Continuer
              </Button>
            )}
            {step === 3 && (
              <Button type="button" variant="primary" onClick={finish} disabled={saving}>
                {saving ? '...' : 'Acceder a FlowIA'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1 — Horaires ──────────────────────────────────────────────────────
function HoursStep({ t, hours, setHours }) {
  const upd = (idx, patch) => setHours(h => h.map((r, i) => i === idx ? { ...r, ...patch } : r));
  return (
    <div>
      <p style={{ fontSize: 12, color: t.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
        Nous avons pre-rempli les horaires standards. Ajustez-les selon votre activite.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {hours.map((row, idx) => {
          const label = DAYS.find(d => d.dow === row.day_of_week)?.label || '';
          return (
            <div key={row.day_of_week} style={{
              display: 'grid',
              gridTemplateColumns: '90px 60px 1fr 1fr',
              gap: 10, alignItems: 'center',
              padding: '8px 10px', borderRadius: 8,
              background: row.is_open ? t.cardAlt : 'transparent',
              border: `0.5px solid ${t.border}`,
              opacity: row.is_open ? 1 : 0.55,
            }}>
              <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{label}</span>
              <ToggleSwitch checked={row.is_open}
                            onChange={v => upd(idx, { is_open: v })}/>
              <input type="time" value={row.open_time}
                     onChange={e => upd(idx, { open_time: e.target.value })}
                     disabled={!row.is_open} style={timeInput(t)}/>
              <input type="time" value={row.close_time}
                     onChange={e => upd(idx, { close_time: e.target.value })}
                     disabled={!row.is_open} style={timeInput(t)}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2 — Services ──────────────────────────────────────────────────────
function ServicesStep({ t, services, setServices }) {
  const upd = (idx, patch) => setServices(s => s.map((r, i) => i === idx ? { ...r, ...patch } : r));
  return (
    <div>
      <p style={{ fontSize: 12, color: t.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
        Nous avons suggere quelques prestations selon votre type de commerce.
        Activez celles que vous proposez, ajustez prix et duree. Vous pourrez en
        ajouter d'autres dans Reglages.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {services.length === 0 && (
          <p style={{ fontSize: 12, color: t.muted, fontStyle: 'italic' }}>
            Aucune prestation pre-remplie — vous pourrez en creer depuis Reglages.
          </p>
        )}
        {services.map((s, idx) => (
          <div key={s.id} style={{
            padding: 12, borderRadius: 10,
            border: `0.5px solid ${t.border}`,
            background: s.is_active ? t.cardAlt : 'transparent',
            opacity: s.is_active ? 1 : 0.6,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ToggleSwitch checked={s.is_active}
                            onChange={v => upd(idx, { is_active: v })}/>
              <input type="text" value={s.name}
                     onChange={e => upd(idx, { name: e.target.value })}
                     style={{ ...timeInput(t), flex: 1, padding: '6px 10px' }}/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <Label>Duree (min)</Label>
                <input type="number" min="5" max="480" step="5"
                       value={s.duration_minutes}
                       onChange={e => upd(idx, { duration_minutes: e.target.value })}
                       style={timeInput(t)}/>
              </div>
              <div>
                <Label>Prix (EUR)</Label>
                <input type="text" inputMode="decimal" value={s.price}
                       onChange={e => upd(idx, { price: e.target.value.replace(/[^\d.,]/g, '') })}
                       style={timeInput(t)}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 3 — Paiements (Stripe Connect) ────────────────────────────────────
function PaymentsStep({ t, user }) {
  const goStripe = () => {
    // Ouvre Reglages > Paiements dans un nouvel onglet — le commercant peut
    // y lancer l'onboarding Stripe Connect sans perdre le wizard en cours.
    window.open('/reglages/paiements', '_blank', 'noopener');
  };
  return (
    <div>
      <p style={{ fontSize: 12, color: t.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
        Par defaut, vous acceptez deja especes, CB locale (terminal) et cheque
        dans la caisse FlowIA. Pour accepter les paiements en ligne lors des
        reservations, connectez votre compte Stripe.
      </p>
      <div style={{
        padding: 16, borderRadius: 12,
        background: t.cardAlt, border: `0.5px solid ${t.border}`,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: t.text, margin: 0 }}>
            Paiements en ligne avec Stripe
          </p>
          <p style={{ fontSize: 11, color: t.muted, margin: '4px 0 0', lineHeight: 1.5 }}>
            Acompte ou paiement total a la reservation, virement automatique
            sur votre IBAN, gestion des remboursements depuis FlowIA.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={goStripe} fullWidth>
          Connecter Stripe (ouvre Reglages)
        </Button>
        <p style={{ fontSize: 11, color: t.muted, margin: 0, fontStyle: 'italic' }}>
          Vous pouvez aussi le faire plus tard depuis Reglages &gt; Paiements.
        </p>
      </div>
    </div>
  );
}

// ─── Step 4 — Recap ─────────────────────────────────────────────────────────
function FinishStep({ t, hours, services }) {
  const openDays    = hours.filter(h => h.is_open).length;
  const activeServs = services.filter(s => s.is_active).length;
  return (
    <div>
      <p style={{ fontSize: 13, color: t.text, margin: '0 0 16px', lineHeight: 1.6 }}>
        Votre compte FlowIA est configure. Voici ce qui est pret :
      </p>
      <ul style={{
        listStyle: 'none', padding: 0, margin: '0 0 18px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <RecapItem t={t} label={`${openDays} jours d'ouverture / semaine`}/>
        <RecapItem t={t} label={`${activeServs} prestation${activeServs > 1 ? 's' : ''} active${activeServs > 1 ? 's' : ''}`}/>
        <RecapItem t={t} label="Caisse, agenda et reservations en ligne disponibles"/>
      </ul>
      <p style={{ fontSize: 12, color: t.muted, margin: 0, lineHeight: 1.5 }}>
        Vous pouvez tout ajuster a tout moment depuis le menu Reglages. Pour
        relancer ce parcours, allez dans Reglages &gt; Mon compte.
      </p>
    </div>
  );
}

function RecapItem({ t, label }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 10,
                 fontSize: 13, color: t.text }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.text}
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      {label}
    </li>
  );
}

// ─── Mini composants ────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
            style={{
              width: 36, height: 20, borderRadius: 10,
              background: checked ? '#10b981' : '#cbd5e1',
              border: 'none', cursor: 'pointer', position: 'relative',
              transition: 'background 0.15s ease', padding: 0,
            }}>
      <span style={{
        position: 'absolute', top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s ease',
      }}/>
    </button>
  );
}

function timeInput(t) {
  return {
    width: '100%', padding: '6px 8px', borderRadius: 6,
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    background: t.inputBg, color: t.text,
    border: `0.5px solid ${t.borderInput}`, boxSizing: 'border-box',
  };
}
