import { useState, useEffect } from 'react';
import { api, promoApi, campaignsApi } from '../../../../utils/api';
import SendResultModal from '../components/SendResultModal';

export default function PromoForm({ open, onClose, init, onSave, theme }) {
  const isDark = theme.mode === 'dark';
  const [code, setCode]       = useState('');
  const [type, setType]       = useState('percent');
  const [value, setValue]     = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [validFrom, setValidFrom]   = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState('');
  const [targetClients, setTargetClients] = useState('all');
  const [timeAllday, setTimeAllday] = useState(true);
  const [timeFrom, setTimeFrom]     = useState('10:00');
  const [timeUntil, setTimeUntil]   = useState('14:00');
  const [saving, setSaving] = useState(false);
  const [campaignChannel, setCampaignChannel] = useState('none');
  const [campaignTarget, setCampaignTarget] = useState('top50');
  const [customCount, setCustomCount] = useState('50');
  const [smsMessage, setSmsMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [smsUserEdited, setSmsUserEdited] = useState(false);
  const [merchant, setMerchant] = useState(null);
  const [resultModal, setResultModal] = useState(null);

  useEffect(() => {
    if (!open) return;
    api.me().then(r => setMerchant(r.user || r)).catch(() => {});
  }, [open]);

  // Préremplit le SMS en multi-ligne tant que l'utilisateur n'a pas édité manuellement
  useEffect(() => {
    if (smsUserEdited || !open) return;
    const fmtDate = (d) => {
      if (!d) return '';
      const [y,m,dd] = String(d).split('-');
      return `${dd}/${m}/${y}`;
    };
    const discount = type === 'percent' ? `-${value || 0}%` : `-${value || 0}€`;
    const bn   = merchant?.businessName || '';
    const tel  = merchant?.phone || '';
    const addr = merchant?.address || '';

    const lines = [];
    if (bn) lines.push(bn);
    lines.push(`Profitez de ${discount} avec le code ${code || 'XXXX'}`);

    if (validFrom && validUntil)      lines.push(`Valable du ${fmtDate(validFrom)} au ${fmtDate(validUntil)}`);
    else if (validFrom)               lines.push(`Valable dès le ${fmtDate(validFrom)}`);
    else if (validUntil)              lines.push(`Valable jusqu'au ${fmtDate(validUntil)}`);

    if (!timeAllday && timeFrom && timeUntil) {
      const fmtH = (t) => String(t).substring(0,5).replace(':','h');
      lines.push(`de ${fmtH(timeFrom)} à ${fmtH(timeUntil)}`);
    }

    if (maxUses && parseInt(maxUses) > 0) lines.push('Offre limitée');

    const contact = [addr, tel].filter(Boolean).join(' - ');
    if (contact) lines.push(contact);

    let msg = lines.join('\n');
    if (msg.length > 160) msg = msg.slice(0, 157) + '...';
    setSmsMessage(msg);
  }, [code, value, type, merchant, open, smsUserEdited, validFrom, validUntil, timeAllday, timeFrom, timeUntil, maxUses]);

  useEffect(() => {
    if (init) {
      setCode(init.code||''); setType(init.type||'percent'); setValue(init.value||'');
      setMaxUses(init.max_uses||''); setValidFrom(init.valid_from||''); setValidUntil(init.valid_until||'');
      setTargetClients(init.target_clients||'all');
      setTimeAllday(init.time_allday !== false);
      setTimeFrom(init.time_from ? init.time_from.substring(0,5) : '10:00');
      setTimeUntil(init.time_until ? init.time_until.substring(0,5) : '14:00');
    } else {
      setCode(''); setType('percent'); setValue(''); setMaxUses('');
      setValidFrom(new Date().toISOString().split('T')[0]); setValidUntil('');
      setTargetClients('all'); setTimeAllday(true); setTimeFrom('10:00'); setTimeUntil('14:00');
    }
    setCampaignChannel('none'); setPreview(null); setSmsMessage('');
  }, [init, open]);

  if (!open) return null;
  const inp = { width:'100%', padding:'10px 14px', borderRadius:12, border:`1px solid ${theme.border}`, background:theme.inputBg, color:theme.text, fontSize:14, outline:'none', boxSizing:'border-box' };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(12px)' }} />
      <div style={{ position:'relative', width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto',
        background: isDark?'#161620':'#fff', borderRadius:24, border:`1px solid ${theme.border}`, padding:24 }}>
        <h3 style={{ fontWeight:800, fontSize:17, color:theme.text, margin:'0 0 20px' }}>{init ? 'Modifier le code' : 'Nouveau code promo'}</h3>
        <div className="space-y-3">
          <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Code *</label>
            <input placeholder="BIENVENUE10" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} style={{...inp, textTransform:'uppercase', fontFamily:'monospace', fontWeight:700, fontSize:16, letterSpacing:'0.1em'}} /></div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Type de remise</label>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setType('percent')} style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${type==='percent'?'#1a73e8':theme.border}`, background: type==='percent'?'rgba(26,115,232,0.12)':theme.inputBg, color: type==='percent'?'#1a73e8':theme.muted }}>% Pourcentage</button>
              <button onClick={()=>setType('fixed')} style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer', border:`1px solid ${type==='fixed'?'#10b981':theme.border}`, background: type==='fixed'?'rgba(16,185,129,0.12)':theme.inputBg, color: type==='fixed'?'#10b981':theme.muted }}>€ Montant fixe</button>
            </div>
          </div>
          <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Valeur *</label>
            <div style={{ position:'relative' }}>
              <input type="number" min="0" placeholder={type==='percent'?'10':'5.00'} value={value} onChange={e=>setValue(e.target.value)} style={{...inp, paddingRight:36}} />
              <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontWeight:700, color:theme.muted, fontSize:16 }}>{type==='percent'?'%':'€'}</span>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Valide du</label><input type="date" value={validFrom} onChange={e=>setValidFrom(e.target.value)} style={inp} /></div>
            <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Jusqu&apos;au</label><input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)} style={inp} /></div>
          </div>

          <div>
            <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Plage horaire d&apos;utilisation</label>
            <div style={{ display:'flex', gap:8, marginBottom: timeAllday ? 0 : 10 }}>
              <button onClick={()=>setTimeAllday(true)}
                style={{ flex:1, padding:'9px', borderRadius:11, fontWeight:700, fontSize:12, cursor:'pointer',
                  border:`1px solid ${timeAllday?'#1a73e8':theme.border}`,
                  background:timeAllday?'rgba(26,115,232,0.12)':theme.inputBg,
                  color:timeAllday?'#1a73e8':theme.muted }}>🕐 Toute la journée</button>
              <button onClick={()=>setTimeAllday(false)}
                style={{ flex:1, padding:'9px', borderRadius:11, fontWeight:700, fontSize:12, cursor:'pointer',
                  border:`1px solid ${!timeAllday?'#f59e0b':theme.border}`,
                  background:!timeAllday?'rgba(245,158,11,0.12)':theme.inputBg,
                  color:!timeAllday?'#f59e0b':theme.muted }}>⏰ Plage horaire</button>
            </div>
            {!timeAllday && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:5 }}>De</label>
                  <input type="time" value={timeFrom} onChange={e=>setTimeFrom(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:5 }}>À</label>
                  <input type="time" value={timeUntil} onChange={e=>setTimeUntil(e.target.value)} style={inp} />
                </div>
              </div>
            )}
            {!timeAllday && timeFrom && timeUntil && (
              <div style={{ marginTop:8, padding:'7px 12px', borderRadius:10,
                background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
                <p style={{ fontSize:11, fontWeight:700, color:'#f59e0b', margin:0 }}>
                  ⏰ Code valide de {timeFrom} à {timeUntil}
                </p>
              </div>
            )}
          </div>

          <div><label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Utilisations max (vide = illimité)</label>
            <input type="number" min="1" placeholder="Illimité" value={maxUses} onChange={e=>setMaxUses(e.target.value)} style={inp} /></div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:theme.muted, display:'block', marginBottom:8 }}>Applicable à</label>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setTargetClients('all')}
                style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                  border:`1px solid ${targetClients==='all'?'#1a73e8':theme.border}`,
                  background:targetClients==='all'?'rgba(26,115,232,0.12)':theme.inputBg,
                  color:targetClients==='all'?'#1a73e8':theme.muted }}>
                Tous les clients
              </button>
              <button onClick={()=>setTargetClients('new')}
                style={{ flex:1, padding:'10px', borderRadius:11, fontWeight:700, fontSize:13, cursor:'pointer',
                  border:`1px solid ${targetClients==='new'?'#10b981':theme.border}`,
                  background:targetClients==='new'?'rgba(16,185,129,0.12)':theme.inputBg,
                  color:targetClients==='new'?'#10b981':theme.muted }}>
                Nouveaux clients
              </button>
            </div>
          </div>
          {!init && (
            <div style={{ padding:'14px', borderRadius:14, background: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', border:`1px solid ${theme.border}` }}>
              <p style={{ fontSize:12, fontWeight:800, color:theme.muted, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Envoyer aux clients</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
                {[
                  { id:'none', label:'Ne pas envoyer', color:theme.muted },
                  { id:'email', label:'Email (gratuit)', color:'#1a73e8' },
                  { id:'sms', label:'SMS (payant)', color:'#f59e0b' },
                  { id:'both', label:'Email + SMS', color:'#8b5cf6' },
                ].map(ch => (
                  <button key={ch.id} onClick={() => { setCampaignChannel(ch.id); setPreview(null); }}
                    style={{ padding:'9px 8px', borderRadius:10, fontWeight:700, fontSize:11, cursor:'pointer',
                      border:`1px solid ${campaignChannel===ch.id ? ch.color : theme.border}`,
                      background: campaignChannel===ch.id ? `${ch.color}15` : theme.inputBg,
                      color: campaignChannel===ch.id ? ch.color : theme.muted }}>{ch.label}</button>
                ))}
              </div>
              {campaignChannel !== 'none' && (
                <>
                  <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:6 }}>Ciblage</label>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                    {[{id:'top50',l:'Top 50'},{id:'top100',l:'Top 100'},{id:'top200',l:'Top 200'},{id:'all',l:'Tous'},{id:'custom',l:'Personnalise'}].map(t => (
                      <button key={t.id} onClick={() => setCampaignTarget(t.id)}
                        style={{ padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer',
                          border:`1px solid ${campaignTarget===t.id ? '#1a73e8' : theme.border}`,
                          background: campaignTarget===t.id ? 'rgba(26,115,232,0.12)' : theme.inputBg,
                          color: campaignTarget===t.id ? '#1a73e8' : theme.muted }}>{t.l}</button>
                    ))}
                  </div>
                  {campaignTarget === 'custom' && (
                    <div style={{ marginBottom:10 }}>
                      <input type="number" min="1" value={customCount} onChange={e => setCustomCount(e.target.value)}
                        placeholder="Nombre de clients" style={{...inp, fontSize:12}} />
                    </div>
                  )}
                  {(campaignChannel === 'sms' || campaignChannel === 'both') && (
                    <div style={{ marginBottom:10 }}>
                      <label style={{ fontSize:11, fontWeight:700, color:theme.muted, display:'block', marginBottom:4 }}>Message SMS (160 car. max)</label>
                      <textarea value={smsMessage}
                        onChange={e => { setSmsMessage(e.target.value.slice(0,160)); setSmsUserEdited(true); }}
                        placeholder="Profitez de -10% avec le code PROMO10 !"
                        style={{...inp, height:72, resize:'none', fontSize:12}} />
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <button type="button" onClick={() => setSmsUserEdited(false)}
                          style={{ fontSize:10, padding:'3px 8px', borderRadius:6, border:`1px solid ${theme.border}`, background:'transparent', color:theme.muted, cursor:'pointer' }}>
                          ↻ Remplissage auto
                        </button>
                        <p style={{ margin:0, fontSize:10, color: smsMessage.length > 150 ? '#ef4444' : theme.muted }}>{smsMessage.length}/160</p>
                      </div>
                    </div>
                  )}
                  <button onClick={async () => {
                    setPreviewLoading(true);
                    try {
                      const p = await campaignsApi.getCampaignPreview({
                        target_type: campaignTarget, custom_count: customCount, channel: campaignChannel
                      });
                      setPreview(p);
                    } catch(e) { alert(e.message); }
                    finally { setPreviewLoading(false); }
                  }} disabled={previewLoading}
                    style={{ width:'100%', padding:'8px', borderRadius:10, fontSize:12, fontWeight:700,
                      background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.text,
                      cursor:'pointer', opacity:previewLoading?0.6:1 }}>
                    {previewLoading ? 'Calcul...' : 'Calculer le cout'}
                  </button>
                  {preview && (
                    <div style={{ marginTop:10, padding:'10px 12px', borderRadius:10, background: isDark ? 'rgba(255,255,255,0.06)' : 'white', border:`1px solid ${theme.border}`, fontSize:12 }}>
                      {preview.email && (
                        <>
                          <p style={{ margin:'3px 0', color:theme.text }}><strong>{preview.email.count} clients</strong> recevront un email</p>
                          {preview.email.plan
                            ? <p style={{ margin:'3px 0', color:'#f59e0b', fontWeight:600 }}>Envoi sur {preview.email.plan.days_needed + 1} jours automatiquement</p>
                            : <p style={{ margin:'3px 0', color:'#10b981', fontWeight:600 }}>Envoi possible aujourd'hui</p>
                          }
                        </>
                      )}
                      {preview.sms && (
                        <>
                          <p style={{ margin:'3px 0', color:theme.text }}><strong>{preview.sms.count} clients</strong> recevront un SMS</p>
                          <p style={{ margin:'3px 0', color:theme.text }}>Cout : <strong>{parseFloat(preview.sms.cost || 0).toFixed(2)} EUR</strong></p>
                          {preview.sms.sufficient
                            ? <p style={{ margin:'3px 0', color:'#10b981', fontWeight:700 }}>Solde OK ({parseFloat(preview.sms.balance || 0).toFixed(2)} EUR)</p>
                            : <p style={{ margin:'3px 0', color:'#ef4444', fontWeight:700 }}>
                                Il vous manque {parseFloat((preview.sms.cost || 0) - (preview.sms.balance || 0)).toFixed(2)} EUR
                                <button onClick={() => window.location.href='/settings/marketing?recharge=need'}
                                  style={{ marginLeft:8, padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:700,
                                    background:'rgba(99,102,241,0.12)', color:'#6366f1', border:'none', cursor:'pointer' }}>
                                  Recharger mon solde
                                </button>
                              </p>
                          }
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:12, background:theme.inputBg, border:`1px solid ${theme.border}`, color:theme.muted, fontWeight:700, cursor:'pointer' }}>Annuler</button>
          <button onClick={async () => {
            if (!code || !value) return;
            setSaving(true);
            try {
              const saved = await onSave({
                code, type, value:parseFloat(value),
                max_uses:maxUses?parseInt(maxUses):null,
                valid_from:validFrom||null, valid_until:validUntil||null,
                target_clients:targetClients,
                time_allday: timeAllday,
                time_from:  timeAllday ? null : timeFrom,
                time_until: timeAllday ? null : timeUntil,
              });
              if (campaignChannel !== 'none' && saved?.id) {
                setSendingCampaign(true);
                const wantEmail = campaignChannel === 'email' || campaignChannel === 'both';
                const wantSms   = campaignChannel === 'sms'   || campaignChannel === 'both';
                let emailResult = null, smsResult = null, error = null;
                try {
                  if (wantEmail) {
                    emailResult = await promoApi.sendEmails(saved.id, { client_ids: [] });
                  }
                  if (wantSms) {
                    smsResult = await campaignsApi.sendCampaign({
                      promo_code_id: saved.id,
                      target_type: campaignTarget,
                      custom_count: customCount,
                      channel: 'sms',
                      message_sms: smsMessage || `${code}: ${type === 'percent' ? `-${value}%` : `-${value}€`}`,
                      promo_code: code,
                    });
                  }
                } catch(e) {
                  error = e.message;
                } finally { setSendingCampaign(false); }
                setResultModal({ code, emailResult, smsResult, error, channel: campaignChannel });
              } else {
                onClose();
              }
            } catch(e) {
              setResultModal({ code, error: e.message, channel: campaignChannel });
            } finally { setSaving(false); }
          }} disabled={saving||sendingCampaign||!code||!value||(campaignChannel==='sms'&&preview&&!preview.sms?.sufficient)}
            style={{ flex:2, padding:'13px', borderRadius:12,
              background: (!code||!value) ? theme.inputBg : '#1a73e8',
              color: (!code||!value) ? theme.muted : 'white',
              fontWeight:800, fontSize:14, border:'none', cursor:(!code||!value)?'not-allowed':'pointer',
              opacity:(saving||sendingCampaign)?0.6:1, boxShadow:(!code||!value)?'none':'0 4px 14px rgba(26,115,232,0.35)' }}>
            {saving ? 'Enregistrement...' : sendingCampaign ? 'Envoi campagne...' : campaignChannel !== 'none' ? 'Creer + Envoyer' : init ? 'Modifier' : 'Creer le code'}
          </button>
        </div>
      </div>
      {resultModal && (
        <SendResultModal data={resultModal} theme={theme} onClose={() => { setResultModal(null); onClose(); }} />
      )}
    </div>
  );
}
