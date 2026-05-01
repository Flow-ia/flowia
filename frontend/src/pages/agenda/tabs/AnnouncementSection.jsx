// src/pages/agenda/tabs/AnnouncementSection.jsx
// Section "Annonce / bandeau page de reservation". Affichee dans
// /reglages/reservations/configuration. Permet au commercant de gerer un
// message qui s'affichera en haut de sa page publique de reservation, avec
// couleur, periode de validite et heures quotidiennes.
import { useState, useEffect } from 'react';
import { announcementApi } from '../../../utils/api';

const COLORS = [
  { id: 'green',  label: 'Vert',    bg: '#f0fdf4', text: '#065f46', border: '#bbf7d0' },
  { id: 'orange', label: 'Orange',  bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' },
  { id: 'yellow', label: 'Jaune',   bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
  { id: 'red',    label: 'Rouge',   bg: '#fef2f2', text: '#991b1b', border: '#fecaca' },
  { id: 'blue',   label: 'Bleu',    bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
  { id: 'purple', label: 'Violet',  bg: '#faf5ff', text: '#6b21a8', border: '#e9d5ff' },
  { id: 'gray',   label: 'Gris',    bg: '#f9fafb', text: '#374151', border: '#e5e7eb' },
];

// Convertit ISO timestamp en valeur datetime-local (YYYY-MM-DDTHH:MM, sans Z)
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

// Convertit datetime-local (YYYY-MM-DDTHH:MM, sans tz) en ISO UTC.
// Sans cela, PG interprete la string brute comme heure du serveur (UTC),
// donc 14:00 saisi en France devenait 14:00 UTC = 16:00 FR -> bandeau
// invisible 2h apres l'heure souhaitee.
function localInputToISO(local) {
  if (!local) return null;
  const d = new Date(local); // interprete comme heure locale du navigateur
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Evalue si l'annonce serait visible MAINTENANT avec les valeurs courantes
// du formulaire. Reproduit la logique du backend (public-booking/announcement.js)
// pour donner au commercant un retour immediat sur l'etat de visibilite —
// cause #1 d'incomprehension : "j'ai active mais je ne vois rien" alors qu'une
// plage horaire quotidienne ou une periode exclut l'instant courant.
function computeVisibility(form) {
  if (!form.is_enabled) return { visible: false, reason: "L'annonce n'est pas activee." };
  if (!form.message || !form.message.trim())
    return { visible: false, reason: 'Le message est vide.' };

  const now = new Date();

  if (form.starts_at) {
    const start = new Date(form.starts_at);
    if (!isNaN(start.getTime()) && start.getTime() > now.getTime()) {
      return { visible: false, reason: `La periode demarre le ${start.toLocaleString('fr-FR')}.` };
    }
  }
  if (form.ends_at) {
    const end = new Date(form.ends_at);
    if (!isNaN(end.getTime()) && end.getTime() < now.getTime()) {
      return { visible: false, reason: `La periode a expire le ${end.toLocaleString('fr-FR')}.` };
    }
  }

  // Plage horaire quotidienne : on compare avec l'heure locale du navigateur
  // (le commercant configure ces heures dans son propre fuseau horaire, ce
  // qu'on reproduit au mieux ici).
  const pad = n => String(n).padStart(2, '0');
  const nowHHMM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (form.daily_start_time && nowHHMM < form.daily_start_time) {
    return {
      visible: false,
      reason: `Hors plage quotidienne : visible de ${form.daily_start_time}${form.daily_end_time ? ' a ' + form.daily_end_time : ''}. Il est ${nowHHMM}.`,
    };
  }
  if (form.daily_end_time && nowHHMM > form.daily_end_time) {
    return {
      visible: false,
      reason: `Hors plage quotidienne : visible ${form.daily_start_time ? 'de ' + form.daily_start_time + ' ' : ''}jusqu'a ${form.daily_end_time}. Il est ${nowHHMM}.`,
    };
  }
  return { visible: true, reason: null };
}

export default function AnnouncementSection({ theme: t, showToast }) {
  const [open,    setOpen]    = useState(false);
  const [loaded,  setLoaded]  = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({
    message: '',
    color: 'orange',
    is_enabled: false,
    starts_at: '',
    ends_at: '',
    daily_start_time: '',
    daily_end_time: '',
  });

  // Lazy load au premier deroulement (evite un fetch inutile sur ConfigTab)
  useEffect(() => {
    if (!open || loaded) return;
    announcementApi.get()
      .then(r => {
        setForm({
          message:          r.message || '',
          color:            r.color || 'orange',
          is_enabled:       !!r.is_enabled,
          starts_at:        toLocalInput(r.starts_at),
          ends_at:          toLocalInput(r.ends_at),
          daily_start_time: r.daily_start_time || '',
          daily_end_time:   r.daily_end_time || '',
        });
        setLoaded(true);
      })
      .catch(() => { setLoaded(true); showToast?.('Erreur chargement annonce', 'err'); });
  }, [open, loaded, showToast]);

  const save = async () => {
    // Pre-validation cote frontend pour eviter aller-retour 400.
    // Coherence dates : si les 2 sont remplis, debut doit etre < fin.
    if (form.starts_at && form.ends_at) {
      const a = new Date(form.starts_at).getTime();
      const b = new Date(form.ends_at).getTime();
      if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
        return showToast?.('La date de fin doit être après la date de début.', 'err');
      }
    }
    // Coherence heures quotidiennes
    if (form.daily_start_time && form.daily_end_time
        && form.daily_start_time > form.daily_end_time) {
      return showToast?.("L'heure de fin doit être après l'heure de début.", 'err');
    }
    setSaving(true);
    try {
      await announcementApi.save({
        message:          form.message.trim(),
        color:            form.color,
        is_enabled:       form.is_enabled,
        starts_at:        localInputToISO(form.starts_at),
        ends_at:          localInputToISO(form.ends_at),
        daily_start_time: form.daily_start_time || null,
        daily_end_time:   form.daily_end_time   || null,
      });
      showToast?.('Annonce enregistrée');
    } catch (e) {
      // Affiche l'erreur backend telle quelle (deja explicite : "La date de
      // debut doit etre avant la date de fin", "L'heure de debut...", etc.)
      showToast?.(e.message || 'Erreur', 'err');
    }
    finally { setSaving(false); }
  };

  const colorCfg = COLORS.find(c => c.id === form.color) || COLORS[1];
  const visibility = computeVisibility(form);

  const inp = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    background: t.inputBg, border: `0.5px solid ${t.borderInput}`,
    color: t.text, fontSize: 13, fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none',
  };

  return (
    <div style={{
      background: t.card, border: `0.5px solid ${t.border}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '14px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: t.text,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: t.text, margin: 0 }}>
            {"Annonce / bandeau page de reservation"}
          </p>
          <p style={{ fontSize: 11, color: t.muted, margin: '2px 0 0' }}>
            {"Message defile en haut de votre page publique (horaires speciaux, info, fermeture exceptionnelle...)"}
          </p>
        </div>
        {form.is_enabled && (
          visibility.visible ? (
            <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px',
                           borderRadius: 99, background: '#f0fdf4', color: '#065f46',
                           flexShrink: 0 }}>
              Visible
            </span>
          ) : (
            <span title={visibility.reason || ''}
                  style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px',
                           borderRadius: 99, background: '#fffbeb', color: '#92400e',
                           flexShrink: 0 }}>
              Masquee
            </span>
          )
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             style={{ flexShrink: 0, color: t.muted,
                      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform .2s ease' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12,
          borderTop: `0.5px solid ${t.separator || t.border}`, paddingTop: 14,
        }}>
          {!loaded ? (
            <p style={{ fontSize: 12, color: t.muted, textAlign: 'center', margin: '12px 0' }}>
              Chargement…
            </p>
          ) : (
            <>
              {/* Toggle activé */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <button type="button"
                        onClick={() => setForm(f => ({ ...f, is_enabled: !f.is_enabled }))}
                        style={{ width: 40, height: 22, borderRadius: 99, border: 'none',
                                 cursor: 'pointer', position: 'relative', flexShrink: 0,
                                 background: form.is_enabled ? '#10b981' : t.cardAlt,
                                 transition: 'background .2s', fontFamily: 'inherit' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: 2, left: form.is_enabled ? 20 : 2,
                                transition: 'left .15s', boxShadow: t.shadowSm }}/>
                </button>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: t.text }}>
                    Activer l{"'"}annonce
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: t.muted }}>
                    {"Visible si activée ET dans la période/heures choisies"}
                  </p>
                </div>
              </label>

              {/* Indicateur de visibilite en direct : evalue les valeurs
                  courantes du formulaire (pas forcement sauvegardees) pour
                  dire si le bandeau serait visible MAINTENANT sur la page
                  publique. Cause #1 de "j'ai active mais je ne vois rien" :
                  une plage horaire quotidienne qui exclut l'instant present. */}
              <div style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: visibility.visible ? '#f0fdf4' : '#fffbeb',
                borderLeft: `2px solid ${visibility.visible ? '#10b981' : '#f59e0b'}`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  marginTop: 5,
                  background: visibility.visible ? '#10b981' : '#f59e0b',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontSize: 12, fontWeight: 500,
                    color: visibility.visible ? '#065f46' : '#92400e',
                  }}>
                    {visibility.visible
                      ? 'Visible maintenant sur votre page de reservation'
                      : 'Bandeau actuellement masque sur votre page'}
                  </p>
                  {!visibility.visible && visibility.reason && (
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#92400e', lineHeight: 1.4 }}>
                      {visibility.reason}
                    </p>
                  )}
                </div>
              </div>

              {/* Message */}
              <div>
                <p style={{ fontSize: 12, color: t.muted, margin: '0 0 6px' }}>
                  Message ({form.message.length}/500)
                </p>
                <textarea
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value.slice(0, 500) }))}
                  rows={3}
                  placeholder="Ex : Bonjour chers clients, nous serons ouverts exceptionnellement lundi prochain de 10h à 19h. N'hésitez pas à prendre rendez-vous !"
                  style={{ ...inp, resize: 'vertical', minHeight: 80 }}
                />
              </div>

              {/* Couleur */}
              <div>
                <p style={{ fontSize: 12, color: t.muted, margin: '0 0 6px' }}>Couleur du bandeau</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {COLORS.map(c => {
                    const active = form.color === c.id;
                    return (
                      <button key={c.id} type="button"
                              onClick={() => setForm(f => ({ ...f, color: c.id }))}
                              style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                                       fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                                       background: c.bg, color: c.text,
                                       border: active ? `2px solid ${c.text}` : `0.5px solid ${c.border}`,
                                       outline: 'none' }}>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Aperçu */}
              {form.message.trim() && (
                <div>
                  <p style={{ fontSize: 12, color: t.muted, margin: '0 0 6px' }}>Aperçu</p>
                  <div style={{
                    padding: '10px 14px', borderRadius: 10,
                    background: colorCfg.bg, color: colorCfg.text,
                    border: `0.5px solid ${colorCfg.border}`,
                    fontSize: 13, lineHeight: 1.4,
                  }}>
                    {form.message}
                  </div>
                </div>
              )}

              {/* Période (optionnel) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 0 6px' }}>
                  <p style={{ fontSize: 12, color: t.muted, margin: 0 }}>
                    {"Periode d'affichage (laissez vide pour afficher en permanence)"}
                  </p>
                  {(form.starts_at || form.ends_at) && (
                    <button type="button"
                            onClick={() => setForm(f => ({ ...f, starts_at: '', ends_at: '' }))}
                            style={{ fontSize: 11, fontWeight: 500, color: t.text,
                                     background: 'transparent', border: `0.5px solid ${t.borderStrong}`,
                                     borderRadius: 8, padding: '3px 8px', cursor: 'pointer',
                                     fontFamily: 'inherit', flexShrink: 0 }}>
                      Effacer
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: t.dim, marginBottom: 4, display: 'block' }}>Du</label>
                    <input type="datetime-local" value={form.starts_at}
                           onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                           max={form.ends_at || undefined}
                           style={inp}/>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: t.dim, marginBottom: 4, display: 'block' }}>Au</label>
                    <input type="datetime-local" value={form.ends_at}
                           onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                           min={form.starts_at || undefined}
                           style={inp}/>
                  </div>
                </div>
              </div>

              {/* Plage horaire quotidienne (optionnel) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 0 6px' }}>
                  <p style={{ fontSize: 12, color: t.muted, margin: 0 }}>
                    Plage horaire quotidienne (laissez vide pour afficher toute la journee)
                  </p>
                  {(form.daily_start_time || form.daily_end_time) && (
                    <button type="button"
                            onClick={() => setForm(f => ({ ...f, daily_start_time: '', daily_end_time: '' }))}
                            style={{ fontSize: 11, fontWeight: 500, color: t.text,
                                     background: 'transparent', border: `0.5px solid ${t.borderStrong}`,
                                     borderRadius: 8, padding: '3px 8px', cursor: 'pointer',
                                     fontFamily: 'inherit', flexShrink: 0 }}>
                      Effacer
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: t.dim, marginBottom: 4, display: 'block' }}>De</label>
                    <input type="time" value={form.daily_start_time}
                           onChange={e => setForm(f => ({ ...f, daily_start_time: e.target.value }))}
                           style={inp}/>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: t.dim, marginBottom: 4, display: 'block' }}>A</label>
                    <input type="time" value={form.daily_end_time}
                           onChange={e => setForm(f => ({ ...f, daily_end_time: e.target.value }))}
                           style={inp}/>
                  </div>
                </div>
              </div>

              <button type="button" onClick={save} disabled={saving}
                      style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none',
                               background: t.text, color: t.bg,
                               fontWeight: 500, fontSize: 13, cursor: saving ? 'wait' : 'pointer',
                               opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
