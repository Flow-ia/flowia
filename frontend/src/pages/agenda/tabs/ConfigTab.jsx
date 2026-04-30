import { useState, useEffect, useRef } from 'react';
import { bookingApi } from '../../../utils/api';
import { bookingUrl as buildBookingUrl } from '../../../utils/publicUrl';
import { DAYS_FR } from '../constants';
import { Button, Label } from '../../../components/primitives';
import { I } from '../../../utils/icons';
import Toggle from '../components/Toggle';

export default function ConfigTab({ settings: initSettings, hours: initHours, onSaved, showToast, theme: t }) {
  const [form, setForm] = useState({
    is_enabled:           initSettings?.is_enabled??false,
    slug:                 initSettings?.slug||'',
    business_description: initSettings?.business_description||'',
    address:              initSettings?.address||'',
    phone:                initSettings?.phone||'',
    advance_booking_days: initSettings?.advance_booking_days??30,
    min_notice_hours:     initSettings?.min_notice_hours??1,
    cancellation_policy_hours: initSettings?.cancellation_policy_hours??2,
    google_business_url:  initSettings?.google_business_url||'',
  });
  const [hrs, setHrs] = useState(
    initHours.length ? initHours : Array.from({length:7},(_,i)=>({day_of_week:i,open_time:'09:00',close_time:'18:00',is_open:i>=1&&i<=5}))
  );
  const [breaks, setBreaks]     = useState([]);
  const [breaksLoaded, setBreaksLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    bookingApi.getBreaks().then(b => { setBreaks(Array.isArray(b)?b:[]); setBreaksLoaded(true); }).catch(()=>setBreaksLoaded(true));
  }, []);

  const addBreak = (dayOfWeek) => setBreaks(p => [...p, { day_of_week: dayOfWeek, break_start: '12:00', break_end: '14:00' }]);
  const removeBreak = (idx) => setBreaks(p => p.filter((_,i) => i !== idx));
  const updateBreak = (idx, key, val) => setBreaks(p => p.map((b,i) => i === idx ? {...b, [key]: val} : b));

  // ── Slug : validation et verification dispo ──────────────────────────────
  const RESERVED = ['admin','api','app','www','mail','ftp','booking','book','login','register','dashboard','settings','static','assets','null','undefined','test','demo','dev'];
  const [slugStatus, setSlugStatus]   = useState('idle');
  const [slugError,  setSlugError]    = useState('');
  // UX : sections collapsibles (sauf Activation/Adresse-page qui restent
  // toujours visibles en haut). Fermees par defaut pour un affichage compact —
  // le commercant deplie a la demande.
  const [expanded, setExpanded] = useState({
    description: false,
    rules:       false,
    hours:       false,
    breaks:      false,
  });
  const toggleSection = (k) => setExpanded(p => ({ ...p, [k]: !p[k] }));
  const checkTimerRef = useRef(null);

  const validateSlugFormat = (s) => {
    if (!s) return { ok: false, msg: "L'adresse de votre page est requise pour activer les reservations." };
    if (s.length < 3) return { ok: false, msg: 'Minimum 3 caracteres requis.' };
    if (s.length > 50) return { ok: false, msg: 'Maximum 50 caracteres.' };
    if (!/^[a-z0-9]/.test(s)) return { ok: false, msg: 'Doit commencer par une lettre ou un chiffre.' };
    if (!/[a-z0-9]$/.test(s)) return { ok: false, msg: 'Doit se terminer par une lettre ou un chiffre.' };
    if (!/^[a-z0-9-]+$/.test(s)) return { ok: false, msg: 'Uniquement lettres minuscules, chiffres et tirets (-).' };
    if (/--/.test(s)) return { ok: false, msg: 'Pas de tirets consecutifs.' };
    if (RESERVED.includes(s)) return { ok: false, msg: `"${s}" est un nom reserve, choisissez un autre lien.` };
    return { ok: true };
  };

  const handleSlugChange = (raw) => {
    // Defense en profondeur : si le slug est verrouille par l'admin, on
    // ignore tout changement local meme si le 'disabled' HTML a ete bypass
    // via DevTools. Le backend rejette aussi (403 SLUG_LOCKED), mais inutile
    // d'ecrire dans le state local une valeur qui ne sera jamais sauvegardee.
    if (initSettings?.slug_locked === true) return;
    const cleaned = raw
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .substring(0, 50);
    setForm(f => ({ ...f, slug: cleaned }));

    const fmt = validateSlugFormat(cleaned);
    if (!fmt.ok) {
      setSlugStatus('error');
      setSlugError(fmt.msg);
      clearTimeout(checkTimerRef.current);
      return;
    }

    if (cleaned === initSettings?.slug) {
      setSlugStatus('ok');
      setSlugError('');
      clearTimeout(checkTimerRef.current);
      return;
    }

    setSlugStatus('checking');
    setSlugError('');
    clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(async () => {
      try {
        const res = await bookingApi.checkSlug(cleaned);
        if (res.available) {
          setSlugStatus('ok');
          setSlugError('');
        } else {
          setSlugStatus('error');
          setSlugError(res.message || 'Cette adresse est deja prise.');
        }
      } catch {
        setSlugStatus('error');
        setSlugError('Impossible de verifier la disponibilite.');
      }
    }, 500);
  };

  useEffect(() => {
    if (initSettings?.slug) {
      const fmt = validateSlugFormat(initSettings.slug);
      setSlugStatus(fmt.ok ? 'ok' : 'error');
      if (!fmt.ok) setSlugError(fmt.msg);
    }
  }, []);

  const slugOk     = slugStatus === 'ok' && form.slug.length >= 3;
  const canEnable  = slugOk;
  // URL partageable : on passe par publicOrigin() qui strippe le sous-domaine
  // `commercant.` quand l'admin tourne dessus (sinon le lien envoyé au client
  // le ramène sur le dashboard au lieu de la page de réservation publique).
  const bookingUrl = form.slug && slugOk ? buildBookingUrl(form.slug) : '';

  const handleToggleEnabled = () => {
    if (!form.is_enabled && !canEnable) {
      setSlugError("Definissez d'abord une adresse de page valide avant d'activer les reservations en ligne.");
      setSlugStatus('error');
      document.getElementById('slug-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setForm(f => ({ ...f, is_enabled: !f.is_enabled }));
  };

  const save = async () => {
    if (form.is_enabled && !canEnable) {
      showToast("Definissez une adresse de page valide avant d'activer les reservations.", 'err');
      return;
    }
    if (form.slug && slugStatus !== 'ok') {
      showToast("L'adresse de page n'est pas valide ou disponible.", 'err');
      return;
    }
    setSaving(true);
    try {
      const s = await bookingApi.saveSettings(form);
      const h = await bookingApi.saveHours({hours:hrs});
      await bookingApi.saveBreaks({ breaks: breaks.map(b=>({ day_of_week:b.day_of_week, break_start:b.break_start, break_end:b.break_end })) });
      onSaved(s.settings, h);
      showToast('Parametres sauvegardes !');
    } catch(e){ showToast(e.message||'Erreur','err'); }
    finally { setSaving(false); }
  };

  // ── Styles partages ───────────────────────────────────────────────────────
  const sectionCard = {
    background: t.card,
    border: `0.5px solid ${t.border}`,
    borderRadius: 12,
    padding: 16,
  };

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

  const sectionTitle = {
    fontSize: 13,
    fontWeight: 500,
    color: t.text,
    margin: 0,
  };
  const sectionSubtitle = {
    fontSize: 11,
    color: t.muted,
    margin: '2px 0 0',
  };

  const slugAccent = slugStatus === 'ok'
    ? '#10b981'
    : slugStatus === 'error'
    ? '#ef4444'
    : slugStatus === 'checking'
    ? '#f59e0b'
    : t.borderInput;

  // ── Composant accordeon local : header cliquable + body collapsible.
  // Garde l'apparence sectionCard existante, ajoute juste un header avec
  // chevron et masque le body quand ferme. Aucune fonctionnalite touchee.
  const Section = ({ id, title, subtitle, accent, children, bodyStyle }) => {
    const open = expanded[id];
    return (
      <div style={{
        ...sectionCard,
        padding: 0,
        overflow: 'hidden',
        ...(accent ? { border: `0.5px solid ${accent}` } : {}),
      }}>
        <button
          type="button"
          onClick={() => toggleSection(id)}
          aria-expanded={open}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            color: t.text,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={sectionTitle}>{title}</p>
            {subtitle && <p style={sectionSubtitle}>{subtitle}</p>}
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               style={{
                 flexShrink: 0,
                 color: t.muted,
                 transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                 transition: 'transform .2s ease',
               }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {open && (
          <div style={{
            padding: '0 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            borderTop: `0.5px solid ${t.separator || t.border}`,
            paddingTop: 14,
            ...bodyStyle,
          }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, paddingBottom:32 }}>
      <style>{`@keyframes spin-cfg { to { transform: rotate(360deg); } }`}</style>

      {/* ── RESERVATIONS EN LIGNE : toggle avec gate ── */}
      <div style={{
        background: t.card,
        border: `0.5px solid ${form.is_enabled ? 'rgba(16,185,129,0.3)' : t.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'border-color .2s',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:16 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{
                width:6,
                height:6,
                borderRadius:'50%',
                flexShrink:0,
                background: form.is_enabled ? '#10b981' : t.dim,
                transition: 'background .2s',
              }} />
              <p style={sectionTitle}>Reservations en ligne</p>
            </div>
            <p style={{ fontSize:11, color:t.muted, margin:'4px 0 0', paddingLeft:14 }}>
              {form.is_enabled
                ? 'Vos clients peuvent reserver en ligne'
                : !canEnable
                ? 'Definissez une adresse de page pour activer'
                : 'Desactive - vos clients ne peuvent pas reserver'}
            </p>
          </div>
          <Toggle on={form.is_enabled} onChange={handleToggleEnabled} />
        </div>

        {/* Alerte si pas de slug valide et tentative d'activation */}
        {!canEnable && !form.is_enabled && (
          <div style={{
            margin: '0 16px 16px',
            padding: '8px 12px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            background: '#fffbeb',
            borderLeft: '2px solid #f59e0b',
          }}>
            <p style={{ fontSize:11, color:'#92400e', margin:0, lineHeight:1.5 }}>
              Pour activer les reservations, vous devez d{"'"}abord definir l{"'"}adresse de votre page de reservation ci-dessous.
            </p>
          </div>
        )}

      </div>

      {/* ── ADRESSE DE LA PAGE (SLUG) ── */}
      <div id="slug-section" style={{
        ...sectionCard,
        border: `0.5px solid ${
          slugStatus==='error' ? 'rgba(239,68,68,0.3)' :
          slugStatus==='ok'    ? 'rgba(16,185,129,0.25)' :
          t.border
        }`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color .2s',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <div>
            <p style={sectionTitle}>Adresse de votre page</p>
            <p style={sectionSubtitle}>URL que vos clients utiliseront pour reserver</p>
          </div>
          {initSettings?.slug_locked === true ? (
            <span title="URL imposee par notre equipe" style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '3px 8px',
              borderRadius: 8,
              background: '#fef3c7',
              color: '#92400e',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              {"Verrouillee"}
            </span>
          ) : slugStatus === 'ok' && form.slug && (
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '3px 8px',
              borderRadius: 8,
              background: '#f0fdf4',
              color: '#065f46',
              whiteSpace: 'nowrap',
            }}>Disponible</span>
          )}
        </div>

        {/* Banniere d'explication quand l'URL est verrouillee par le super-admin.
            Le champ input reste visible (montre la valeur courante) mais
            l'utilisateur sait pourquoi il ne peut pas y toucher. */}
        {initSettings?.slug_locked === true && (
          <div style={{
            display: 'flex',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 8,
            background: '#fffbeb',
            borderLeft: '2px solid #f59e0b',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="#92400e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                 style={{ flexShrink: 0, marginTop: 1 }}>
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <div>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#92400e', margin: 0, lineHeight: 1.4 }}>
                {"Cette URL a ete imposee par notre equipe."}
              </p>
              <p style={{ fontSize: 11, color: '#92400e', margin: '4px 0 0', lineHeight: 1.5, opacity: 0.85 }}>
                {"Elle ne peut pas etre modifiee. Pour toute demande de changement, contactez le support."}
              </p>
            </div>
          </div>
        )}

        {/* Input slug avec prefixe */}
        <div style={{
          display: 'flex',
          alignItems: 'stretch',
          borderRadius: 8,
          overflow: 'hidden',
          border: `0.5px solid ${slugAccent}`,
          transition: 'border-color .2s',
        }}>
          <span style={{
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            flexShrink: 0,
            color: t.muted,
            background: t.cardAlt,
            borderRight: `0.5px solid ${t.border}`,
          }}>
            /book/
          </span>
          <input
            value={form.slug}
            onChange={e => handleSlugChange(e.target.value)}
            placeholder="mon-salon"
            disabled={initSettings?.slug_locked === true}
            title={initSettings?.slug_locked
              ? "Votre URL a ete imposee par notre equipe et ne peut pas etre modifiee. Contactez le support."
              : undefined}
            style={{
              flex: 1,
              padding: '10px 12px',
              fontSize: 13,
              background: initSettings?.slug_locked ? t.cardAlt : t.inputBg,
              color: initSettings?.slug_locked ? t.muted : t.text,
              border: 'none',
              outline: 'none',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              cursor: initSettings?.slug_locked ? 'not-allowed' : 'text',
            }}
          />
          {slugStatus !== 'idle' && (
            <span style={{
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              color: slugAccent,
              background: t.inputBg,
            }}>
              {slugStatus === 'checking' ? (
                <span style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: `0.5px solid rgba(245,158,11,0.3)`,
                  borderTopColor: '#f59e0b',
                  display: 'inline-block',
                  animation: 'spin-cfg 0.8s linear infinite',
                }} />
              ) : slugStatus === 'ok' ? (
                <I.Check width={14} height={14} />
              ) : (
                <I.X width={14} height={14} />
              )}
            </span>
          )}
        </div>

        {/* Message d'etat du slug */}
        {slugStatus === 'error' && slugError && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: '#fef2f2',
            borderLeft: '2px solid #ef4444',
          }}>
            <p style={{ fontSize:11, fontWeight:500, color:'#991b1b', margin:0, lineHeight:1.5 }}>
              {slugError}
            </p>
          </div>
        )}

        {/* Regles de format — masquees si slug verrouille (l'utilisateur ne
            peut pas modifier de toute facon) */}
        {!initSettings?.slug_locked && form.slug.length > 0 && slugStatus !== 'ok' && slugStatus !== 'checking' && (
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {[
              { ok: form.slug.length >= 3,           label: 'Minimum 3 caracteres' },
              { ok: /^[a-z0-9-]+$/.test(form.slug),  label: 'Lettres minuscules, chiffres et tirets uniquement' },
              { ok: /^[a-z0-9]/.test(form.slug),     label: 'Commence par une lettre ou un chiffre' },
              { ok: /[a-z0-9]$/.test(form.slug),     label: 'Termine par une lettre ou un chiffre' },
              { ok: !RESERVED.includes(form.slug),   label: 'Nom non reserve' },
            ].map((rule,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: rule.ok ? '#10b981' : '#ef4444',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize:11, color: rule.ok ? '#065f46' : t.muted }}>{rule.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Previsualisation du lien complet */}
        {bookingUrl && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            background: t.cardAlt,
            border: `0.5px solid ${t.border}`,
          }}>
            <span style={{
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: t.text,
            }}>{bookingUrl}</span>
            <button
              type="button"
              onClick={()=>{navigator.clipboard.writeText(bookingUrl);showToast('Lien copie !');}}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: '4px 10px',
                borderRadius: 8,
                background: 'transparent',
                border: `0.5px solid ${t.borderStrong}`,
                color: t.text,
                cursor: 'pointer',
                fontFamily: 'inherit',
                flexShrink: 0,
              }}
            >
              Copier
            </button>
          </div>
        )}

        {/* Tip d'aide masque si slug verrouille (suggerer des noms a un user
            qui ne peut rien changer est trompeur). */}
        {!initSettings?.slug_locked && (
          <p style={{ fontSize:11, color:t.dim, margin:0, lineHeight:1.5 }}>
            Utilisez un nom court et memorable (ex :{' '}
            <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>salon-marie</span>,{' '}
            <span style={{ fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>barbershop-leo</span>).
          </p>
        )}
      </div>

      {/* ── DESCRIPTION DE L'ACTIVITE (accordeon) ── */}
      <Section
        id="description"
        title={"Description de l'activite"}
        subtitle="Texte presente aux clients sur la page de reservation"
      >
        <textarea
          value={form.business_description||''}
          onChange={e=>setForm(f=>({...f,business_description:e.target.value}))}
          rows={3}
          placeholder="Decrivez votre activite, vos specialites…"
          style={{ ...inputStyle, resize:'none' }}
        />
        <div style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: '#eef2ff',
          borderLeft: '2px solid #6366f1',
        }}>
          <p style={{ fontSize:11, color:'#4338ca', margin:0, lineHeight:1.5 }}>
            <span style={{ fontWeight:500 }}>Adresse</span>,{' '}
            <span style={{ fontWeight:500 }}>telephone</span> et{' '}
            <span style={{ fontWeight:500 }}>lien Google Business</span> sont geres dans la section{' '}
            <span style={{ fontWeight:500 }}>Informations du commerce</span>. Ce sont ces valeurs qui sont affichees sur le site de reservation.
          </p>
        </div>
      </Section>

      {/* ── REGLES DE RESERVATION (accordeon) ── */}
      <Section id="rules" title="Regles de reservation" bodyStyle={{ gap: 12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <Label>Reservation a l{"'"}avance (jours)</Label>
            <input
              type="number"
              min="1"
              max="365"
              value={form.advance_booking_days}
              onChange={e=>setForm(f=>({...f,advance_booking_days:parseInt(e.target.value)||30}))}
              style={inputStyle}
            />
          </div>
          <div>
            <Label>Delai minimum (heures)</Label>
            <input
              type="number"
              min="0"
              max="72"
              value={form.min_notice_hours}
              onChange={e=>setForm(f=>({...f,min_notice_hours:parseInt(e.target.value)||1}))}
              style={inputStyle}
            />
          </div>
        </div>
        <div>
          <Label>Annulation en ligne par le client</Label>
          <select
            value={form.cancellation_policy_hours}
            onChange={e=>setForm(f=>({...f, cancellation_policy_hours:parseInt(e.target.value)}))}
            style={inputStyle}
          >
            <option value={0}>A tout moment</option>
            <option value={1}>Jusqu{"'"}a 1 h avant le RDV</option>
            <option value={2}>Jusqu{"'"}a 2 h avant le RDV</option>
            <option value={6}>Jusqu{"'"}a 6 h avant le RDV</option>
            <option value={24}>Jusqu{"'"}a 24 h avant le RDV</option>
            <option value={48}>Jusqu{"'"}a 48 h avant le RDV</option>
          </select>
          <p style={{ fontSize:11, color:t.muted, margin:'6px 0 0' }}>
            Au-dela de ce delai, le client devra vous contacter directement pour annuler.
          </p>
        </div>
      </Section>

      {/* ── HORAIRES D'OUVERTURE (accordeon) ── */}
      <Section
        id="hours"
        title={"Horaires d'ouverture"}
        subtitle={"Les jours fermes s'affichent en rouge dans le calendrier"}
      >
        {hrs.map((h,i)=>(
          <div key={i} style={{ display:'flex', alignItems:'center', gap:12 }}>
            <Toggle
              on={h.is_open}
              onChange={()=>setHrs(p=>p.map((x,j)=>j===i?{...x,is_open:!x.is_open}:x))}
            />
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              width: 40,
              flexShrink: 0,
              color: h.is_open ? t.text : '#991b1b',
            }}>
              {DAYS_FR[h.day_of_week??i]}
            </span>
            {h.is_open ? (
              <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                <input
                  type="time"
                  value={h.open_time||'09:00'}
                  onChange={e=>setHrs(p=>p.map((x,j)=>j===i?{...x,open_time:e.target.value}:x))}
                  style={{ ...inputStyle, padding:'8px 10px', fontSize:12, flex:1 }}
                />
                <span style={{ fontSize:12, color:t.muted }}>→</span>
                <input
                  type="time"
                  value={h.close_time||'18:00'}
                  onChange={e=>setHrs(p=>p.map((x,j)=>j===i?{...x,close_time:e.target.value}:x))}
                  style={{ ...inputStyle, padding:'8px 10px', fontSize:12, flex:1 }}
                />
              </div>
            ) : (
              <span style={{ fontSize:12, fontWeight:500, color:'#991b1b' }}>Ferme</span>
            )}
          </div>
        ))}
        <p style={{ fontSize:11, color:t.dim, margin:0 }}>
          Pour les horaires nocturnes (ex : 13h → 02h), entrez 13:00 et 02:00.
        </p>
      </Section>

      {/* ── PAUSES & COUPURES (accordeon) ── */}
      <Section
        id="breaks"
        title={"Pauses & coupures"}
        subtitle="Aucune reservation possible pendant ces creneaux"
        bodyStyle={{ gap: 12 }}
      >
        {!breaksLoaded ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'12px 0' }}>
            <div style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: `0.5px solid ${t.border}`,
              borderTopColor: t.text,
              animation: 'spin-cfg 0.8s linear infinite',
            }} />
          </div>
        ) : (
          <>
            {[0,1,2,3,4,5,6].map(day => {
              const dayBreaks = breaks.map((b,i)=>({...b,_idx:i})).filter(b=>b.day_of_week===day);
              const dayHour = hrs.find(h=>(h.day_of_week??0)===day);
              if (!dayHour?.is_open) return null;
              return (
                <div key={day}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:11, fontWeight:500, color:t.muted }}>
                      {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][day]}
                    </span>
                    <button
                      type="button"
                      onClick={()=>addBreak(day)}
                      style={{
                        fontSize:11,
                        fontWeight:500,
                        color:t.text,
                        background:'transparent',
                        border:`0.5px solid ${t.borderStrong}`,
                        borderRadius:8,
                        padding:'4px 10px',
                        cursor:'pointer',
                        fontFamily:'inherit',
                      }}
                    >
                      + Pause
                    </button>
                  </div>
                  {dayBreaks.length === 0 ? (
                    <p style={{ fontSize:11, color:t.dim, fontStyle:'italic', margin:0 }}>Aucune pause</p>
                  ) : dayBreaks.map(b => (
                    <div key={b._idx} style={{
                      display:'flex',
                      alignItems:'center',
                      gap:8,
                      marginBottom:6,
                      padding:8,
                      borderRadius:8,
                      background:'#fff7ed',
                      borderLeft:'2px solid #fb923c',
                    }}>
                      <input
                        type="time"
                        value={b.break_start}
                        onChange={e=>updateBreak(b._idx,'break_start',e.target.value)}
                        style={{ ...inputStyle, padding:'6px 10px', fontSize:12, flex:1 }}
                      />
                      <span style={{ fontSize:12, color:t.muted }}>→</span>
                      <input
                        type="time"
                        value={b.break_end}
                        onChange={e=>updateBreak(b._idx,'break_end',e.target.value)}
                        style={{ ...inputStyle, padding:'6px 10px', fontSize:12, flex:1 }}
                      />
                      <button
                        type="button"
                        onClick={()=>removeBreak(b._idx)}
                        aria-label="Supprimer"
                        style={{
                          width:26,
                          height:26,
                          borderRadius:8,
                          background:'transparent',
                          border:'0.5px solid rgba(239,68,68,0.3)',
                          cursor:'pointer',
                          color:'#991b1b',
                          display:'flex',
                          alignItems:'center',
                          justifyContent:'center',
                          flexShrink:0,
                          fontFamily:'inherit',
                        }}
                      >
                        <I.X width={12} height={12} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
            {hrs.every(h=>!h.is_open) && (
              <p style={{ fontSize:11, color:t.dim, textAlign:'center', margin:'8px 0' }}>
                Activez au moins un jour d{"'"}ouverture pour definir des pauses.
              </p>
            )}
          </>
        )}
      </Section>

      <Button fullWidth onClick={save} disabled={saving}>
        {saving ? 'Sauvegarde...' : 'Sauvegarder'}
      </Button>
    </div>
  );
}
