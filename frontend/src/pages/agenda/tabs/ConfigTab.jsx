import { useState, useEffect, useRef } from 'react';
import { bookingApi } from '../../../utils/api';
import { DAYS_FR } from '../constants';
import Toggle from '../components/Toggle';

export default function ConfigTab({ settings: initSettings, hours: initHours, onSaved, showToast, theme: t }) {
  const isDark = t.mode === 'dark';
  const [form, setForm] = useState({
    is_enabled:           initSettings?.is_enabled??false,
    slug:                 initSettings?.slug||'',
    business_description: initSettings?.business_description||'',
    address:              initSettings?.address||'',
    phone:                initSettings?.phone||'',
    advance_booking_days: initSettings?.advance_booking_days??30,
    min_notice_hours:     initSettings?.min_notice_hours??1,
    cancellation_policy_hours: initSettings?.cancellation_policy_hours??2,
    require_account:      initSettings?.require_account??false,
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

  // ── Slug : validation et vérification dispo ──────────────────────────────
  const RESERVED = ['admin','api','app','www','mail','ftp','booking','book','login','register','dashboard','settings','static','assets','null','undefined','test','demo','dev'];
  const [slugStatus, setSlugStatus]   = useState('idle'); // 'idle'|'checking'|'ok'|'error'
  const [slugError,  setSlugError]    = useState('');
  const checkTimerRef = useRef(null);

  // Validation locale synchrone (format)
  const validateSlugFormat = (s) => {
    if (!s) return { ok: false, msg: 'L\'adresse de votre page est requise pour activer les reservations.' };
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
    // Nettoyage auto : accents → ascii, espaces → tirets, caractères interdits supprimés
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

    // Si même slug que l'initial et déjà validé, pas besoin de re-checker
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
        setSlugError('Impossible de vérifier la disponibilite.');
      }
    }, 500);
  };

  // Initialiser le statut du slug existant
  useEffect(() => {
    if (initSettings?.slug) {
      const fmt = validateSlugFormat(initSettings.slug);
      setSlugStatus(fmt.ok ? 'ok' : 'error');
      if (!fmt.ok) setSlugError(fmt.msg);
    }
  }, []);

  const slugOk     = slugStatus === 'ok' && form.slug.length >= 3;
  const canEnable  = slugOk; // ne peut activer les réservations que si le slug est valide
  const bookingUrl = form.slug && slugOk ? `${window.location.origin}/book/${form.slug}` : '';

  // Si l'utilisateur tente d'activer sans slug valide → forcer slug d'abord
  const handleToggleEnabled = () => {
    if (!form.is_enabled && !canEnable) {
      setSlugError('Definissez d\'abord une adresse de page valide avant d\'activer les reservations en ligne.');
      setSlugStatus('error');
      document.getElementById('slug-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setForm(f => ({ ...f, is_enabled: !f.is_enabled }));
  };

  const save = async () => {
    // Vérification finale avant save
    if (form.is_enabled && !canEnable) {
      showToast('Definissez une adresse de page valide avant d\'activer les réservations.', 'err');
      return;
    }
    if (form.slug && slugStatus !== 'ok') {
      showToast('L\'adresse de page n\'est pas valide ou disponible.', 'err');
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

  const inp = { background:t.inputBg, border:`1px solid ${t.inputBorder}`, color:t.text };

  // Couleur et icône selon statut slug
  const slugStatusUI = {
    idle:     { color: t.muted,     icon: null,  border: t.inputBorder },
    checking: { color: '#f59e0b',   icon: '⏳',  border: 'rgba(245,158,11,0.4)' },
    ok:       { color: '#22c55e',   icon: '✓',   border: 'rgba(34,197,94,0.4)' },
    error:    { color: '#ef4444',   icon: '✕',   border: 'rgba(239,68,68,0.4)' },
  }[slugStatus];

  return (
    <div className="space-y-4 pb-8">

      {/* ── RÉSERVATIONS EN LIGNE : toggle avec gate ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${form.is_enabled ? 'rgba(34,197,94,0.35)' : t.border}`, transition:'border-color .2s' }}>
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: form.is_enabled ? '#22c55e' : (isDark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.15)'), transition:'background .2s' }} />
              <p className="font-bold text-sm" style={{ color:t.text }}>Réservations en ligne</p>
            </div>
            <p className="text-xs mt-1 ml-4" style={{ color:t.muted }}>
              {form.is_enabled
                ? 'Vos clients peuvent reserver en ligne'
                : !canEnable
                ? 'Definissez une adresse de page pour activer'
                : 'Désactivé - vos clients ne peuvent pas reserver'}
            </p>
          </div>
          <Toggle on={form.is_enabled} onChange={handleToggleEnabled} colorOn="linear-gradient(90deg,#22c55e,#16a34a)" />
        </div>

        {/* Alerte si pas de slug valide et tentative d'activation */}
        {!canEnable && !form.is_enabled && (
          <div className="mx-4 mb-4 px-3 py-2.5 rounded-xl flex items-start gap-2" style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
            <span className="text-sm flex-shrink-0 mt-0.5">⚠️</span>
            <p className="text-xs" style={{ color:'#d97706' }}>
              Pour activer les réservations, vous devez d'abord definir l'adresse de votre page de réservation ci-dessous.
            </p>
          </div>
        )}

        {/* Badge lien actif */}
        {form.is_enabled && bookingUrl && (
          <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.18)' }}>
            <span className="text-sm">🔗</span>
            <span className="text-xs font-mono flex-1 truncate" style={{ color:'#16a34a' }}>{bookingUrl}</span>
            <button onClick={()=>{navigator.clipboard.writeText(bookingUrl);showToast('Lien copie !');}} className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0" style={{ background:'rgba(34,197,94,0.15)',color:'#16a34a' }}>Copier</button>
          </div>
        )}
      </div>

      {/* ── ADRESSE DE LA PAGE (SLUG) ── */}
      <div id="slug-section" className="rounded-2xl p-4 space-y-3" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${slugStatus==='error'?'rgba(239,68,68,0.35)':slugStatus==='ok'?'rgba(34,197,94,0.25)':t.border}`, transition:'border-color .2s' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-sm" style={{ color:t.text }}>Adresse de votre page</p>
            <p className="text-xs mt-0.5" style={{ color:t.muted }}>URL que vos clients utiliseront pour réserver</p>
          </div>
          {slugStatus === 'ok' && form.slug && (
            <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background:'rgba(34,197,94,0.1)', color:'#16a34a' }}>✓ Disponible</span>
          )}
        </div>

        {/* Input slug avec préfixe */}
        <div className="flex items-stretch rounded-xl overflow-hidden" style={{ border:`1.5px solid ${slugStatusUI.border}`, transition:'border-color .2s' }}>
          <span className="px-3 flex items-center text-xs font-mono font-semibold flex-shrink-0" style={{ color:t.muted, background:isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)', borderRight:`1px solid ${isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.08)'}` }}>
            /book/
          </span>
          <input
            value={form.slug}
            onChange={e => handleSlugChange(e.target.value)}
            placeholder="mon-salon"
            className="flex-1 py-3 px-3 text-sm focus:outline-none font-mono"
            style={{ background:t.inputBg, color:t.text }}
          />
          {slugStatusUI.icon && (
            <span className="px-3 flex items-center text-sm font-bold flex-shrink-0" style={{ color:slugStatusUI.color, background:t.inputBg }}>
              {slugStatus === 'checking' ? (
                <span className="inline-block w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor:`${slugStatusUI.color}30`, borderTopColor:slugStatusUI.color }} />
              ) : slugStatusUI.icon}
            </span>
          )}
        </div>

        {/* Message d'état du slug */}
        {slugStatus === 'error' && slugError && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.15)' }}>
            <span className="text-sm flex-shrink-0">🚫</span>
            <p className="text-xs font-semibold" style={{ color:'#ef4444' }}>{slugError}</p>
          </div>
        )}

        {/* Règles de format */}
        {form.slug.length > 0 && slugStatus !== 'ok' && slugStatus !== 'checking' && (
          <div className="space-y-1">
            {[
              { ok: form.slug.length >= 3,           label: 'Minimum 3 caracteres' },
              { ok: /^[a-z0-9-]+$/.test(form.slug),  label: 'Lettres minuscules, chiffres et tirets uniquement' },
              { ok: /^[a-z0-9]/.test(form.slug),     label: 'Commence par une lettre ou un chiffre' },
              { ok: /[a-z0-9]$/.test(form.slug),     label: 'Termine par une lettre ou un chiffre' },
              { ok: !RESERVED.includes(form.slug),   label: 'Nom non réserve' },
            ].map((rule,i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs" style={{ color: rule.ok ? '#22c55e' : '#ef4444' }}>{rule.ok ? '✓' : '✕'}</span>
                <span className="text-xs" style={{ color: rule.ok ? '#16a34a' : t.muted }}>{rule.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Prévisualisation du lien complet */}
        {bookingUrl && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background:'rgba(17,24,39,0.07)', border:'1px solid rgba(17,24,39,0.15)' }}>
            <span className="text-sm">🔗</span>
            <span className="text-xs font-mono flex-1 truncate" style={{ color:'#a5a0ff' }}>{bookingUrl}</span>
            <button
              onClick={()=>{navigator.clipboard.writeText(bookingUrl);showToast('Lien copie !');}}
              className="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0"
              style={{ background:'rgba(17,24,39,0.15)',color:'#a5a0ff' }}>
              Copier
            </button>
          </div>
        )}

        <p className="text-xs" style={{ color:t.dim }}>
          💡 Utilisez un nom court et mémorable (ex : <span className="font-mono">salon-marie</span>, <span className="font-mono">barbershop-leo</span>)
        </p>
      </div>

      {/* ── COMPTE CLIENT OBLIGATOIRE ── */}
      <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
        <div>
          <p className="font-bold text-sm" style={{ color:t.text }}>Compte client obligatoire</p>
          <p className="text-xs mt-0.5" style={{ color:t.muted }}>Les clients doivent créer un compte pour réserver</p>
        </div>
        <Toggle on={form.require_account} onChange={()=>setForm(f=>({...f,require_account:!f.require_account}))} colorOn="linear-gradient(90deg,#f59e0b,#f97316)" />
      </div>

      {/* ── DESCRIPTION DE L'ACTIVITÉ ──
          Adresse, téléphone et Google Business sont gérés dans « Informations du commerce »
          pour éviter les doublons et garantir une seule source de vérité. */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
        <div>
          <p className="font-bold text-sm" style={{ color:t.text }}>Description de l'activité</p>
          <p className="text-xs mt-0.5" style={{ color:t.muted }}>
            Texte présenté aux clients sur la page de réservation.
          </p>
        </div>
        <textarea value={form.business_description||''}
          onChange={e=>setForm(f=>({...f,business_description:e.target.value}))}
          rows={3} placeholder="Décrivez votre activité, vos spécialités…"
          className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none resize-none" style={inp} />
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.18)' }}>
          <span className="text-sm flex-shrink-0 mt-0.5">💡</span>
          <p className="text-[11px]" style={{ color:t.muted, lineHeight:1.5 }}>
            <strong style={{ color:t.text }}>Adresse</strong>, <strong style={{ color:t.text }}>téléphone</strong>
            {' '}et <strong style={{ color:t.text }}>lien Google Business</strong> sont gérés dans la section
            <strong style={{ color:t.text }}> Informations du commerce</strong>. Ce sont ces valeurs qui sont affichées sur le site de réservation.
          </p>
        </div>
      </div>

      {/* ── RÈGLES DE RÉSERVATION ── */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
        <p className="font-bold text-sm" style={{ color:t.text }}>Règles de réservation</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color:t.muted }}>Réservation à l'avance (jours)</label>
            <input type="number" min="1" max="365" value={form.advance_booking_days} onChange={e=>setForm(f=>({...f,advance_booking_days:parseInt(e.target.value)||30}))} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp} />
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block" style={{ color:t.muted }}>Délai minimum (heures)</label>
            <input type="number" min="0" max="72" value={form.min_notice_hours} onChange={e=>setForm(f=>({...f,min_notice_hours:parseInt(e.target.value)||1}))} className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp} />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold mb-1 block" style={{ color:t.muted }}>Annulation en ligne par le client</label>
          <select value={form.cancellation_policy_hours}
            onChange={e=>setForm(f=>({...f, cancellation_policy_hours:parseInt(e.target.value)}))}
            className="w-full px-3 py-3 rounded-xl text-sm focus:outline-none" style={inp}>
            <option value={0}>À tout moment</option>
            <option value={1}>Jusqu'à 1 h avant le RDV</option>
            <option value={2}>Jusqu'à 2 h avant le RDV</option>
            <option value={6}>Jusqu'à 6 h avant le RDV</option>
            <option value={24}>Jusqu'à 24 h avant le RDV</option>
            <option value={48}>Jusqu'à 48 h avant le RDV</option>
          </select>
          <p className="text-[11px] mt-1" style={{ color:t.muted }}>
            Au-delà de ce délai, le client devra vous contacter directement pour annuler.
          </p>
        </div>
      </div>

      {/* ── HORAIRES D'OUVERTURE ── */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
        <div>
          <p className="font-bold text-sm" style={{ color:t.text }}>Horaires d'ouverture</p>
          <p className="text-xs mt-0.5" style={{ color:t.muted }}>Les jours fermés s'affichent en rouge dans le calendrier</p>
        </div>
        {hrs.map((h,i)=>(
          <div key={i} className="flex items-center gap-3">
            <Toggle on={h.is_open} onChange={()=>setHrs(p=>p.map((x,j)=>j===i?{...x,is_open:!x.is_open}:x))} colorOn="linear-gradient(90deg,#111827,#374151)" />
            <span className="text-sm font-bold w-10 flex-shrink-0" style={{ color:h.is_open?t.text:'#ef4444' }}>
              {DAYS_FR[h.day_of_week??i]}
            </span>
            {h.is_open ? (
              <div className="flex items-center gap-2 flex-1">
                <input type="time" value={h.open_time||'09:00'} onChange={e=>setHrs(p=>p.map((x,j)=>j===i?{...x,open_time:e.target.value}:x))} className="flex-1 px-2 py-1.5 rounded-xl text-xs focus:outline-none" style={inp} />
                <span className="text-xs" style={{ color:t.muted }}>→</span>
                <input type="time" value={h.close_time||'18:00'} onChange={e=>setHrs(p=>p.map((x,j)=>j===i?{...x,close_time:e.target.value}:x))} className="flex-1 px-2 py-1.5 rounded-xl text-xs focus:outline-none" style={inp} />
              </div>
            ) : (
              <span className="text-xs font-bold" style={{ color:'#ef4444' }}>Fermé</span>
            )}
          </div>
        ))}
        <p className="text-[10px] mt-1" style={{ color:t.dim }}>Pour les horaires nocturnes (ex: 13h → 02h), entrez 13:00 et 02:00</p>
      </div>

      {/* ── PAUSES & COUPURES ── */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background:isDark?'rgba(255,255,255,0.04)':'white', border:`1px solid ${t.border}` }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-sm" style={{ color:t.text }}>Pauses &amp; coupures</p>
            <p className="text-xs mt-0.5" style={{ color:t.muted }}>Aucune réservation possible pendant ces créneaux</p>
          </div>
        </div>
        {!breaksLoaded ? (
          <div className="flex justify-center py-3"><div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor:'rgba(17,24,39,0.2)', borderTopColor:'#111827' }} /></div>
        ) : (
          <>
            {[0,1,2,3,4,5,6].map(day => {
              const dayBreaks = breaks.map((b,i)=>({...b,_idx:i})).filter(b=>b.day_of_week===day);
              const dayHour = hrs.find(h=>(h.day_of_week??0)===day);
              if (!dayHour?.is_open) return null;
              return (
                <div key={day}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold" style={{ color:t.muted }}>{['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][day]}</span>
                    <button onClick={()=>addBreak(day)} style={{ fontSize:11, color:'#111827', background:'rgba(17,24,39,0.1)', border:'none', borderRadius:8, padding:'3px 8px', cursor:'pointer', fontWeight:700 }}>+ Pause</button>
                  </div>
                  {dayBreaks.length === 0 ? (
                    <p className="text-xs" style={{ color:t.dim, fontStyle:'italic' }}>Aucune pause</p>
                  ) : dayBreaks.map(b => (
                    <div key={b._idx} className="flex items-center gap-2 mb-1.5 p-2 rounded-xl" style={{ background:'rgba(251,146,60,0.07)', border:'1px solid rgba(251,146,60,0.2)' }}>
                      <span className="text-xs" style={{ color:'#f97316' }}>☕</span>
                      <input type="time" value={b.break_start} onChange={e=>updateBreak(b._idx,'break_start',e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs focus:outline-none" style={inp} />
                      <span className="text-xs" style={{ color:t.muted }}>→</span>
                      <input type="time" value={b.break_end} onChange={e=>updateBreak(b._idx,'break_end',e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-xs focus:outline-none" style={inp} />
                      <button onClick={()=>removeBreak(b._idx)} style={{ width:26, height:26, borderRadius:8, background:'rgba(239,68,68,0.1)', border:'none', cursor:'pointer', color:'#ef4444', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
                    </div>
                  ))}
                </div>
              );
            })}
            {hrs.every(h=>!h.is_open) && (
              <p className="text-xs text-center py-2" style={{ color:t.dim }}>Activez au moins un jour d'ouverture pour définir des pauses.</p>
            )}
          </>
        )}
      </div>

      <button onClick={save} disabled={saving} className="w-full py-4 rounded-2xl font-bold text-white disabled:opacity-40" style={{ background:'#111827' }}>
        {saving?'Sauvegarde...':'Sauvegarder'}
      </button>
    </div>
  );
}
