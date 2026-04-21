import { useState, useEffect } from 'react';
import { api, promoApi, campaignsApi } from '../../../../utils/api';
import SendResultModal from '../components/SendResultModal';
import { Button, Label, SegmentedControl } from '../../../../components/primitives';

export default function PromoForm({ open, onClose, init, onSave, theme }) {
  const t = theme;
  const [code, setCode]             = useState('');
  const [type, setType]             = useState('percent');
  const [value, setValue]           = useState('');
  const [maxUses, setMaxUses]       = useState('');
  const [validFrom, setValidFrom]   = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState('');
  const [targetClients, setTargetClients] = useState('all');
  const [timeAllday, setTimeAllday] = useState(true);
  const [timeFrom,  setTimeFrom]    = useState('10:00');
  const [timeUntil, setTimeUntil]   = useState('14:00');
  const [saving, setSaving] = useState(false);
  const [campaignChannel, setCampaignChannel] = useState('none');
  const [campaignTarget, setCampaignTarget]   = useState('top50');
  const [customCount, setCustomCount] = useState('50');
  const [smsMessage,  setSmsMessage]  = useState('');
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

  useEffect(() => {
    if (smsUserEdited || !open) return;
    const fmtDate = (d) => {
      if (!d) return '';
      const [y, m, dd] = String(d).split('-');
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
    else if (validFrom)               lines.push(`Valable des le ${fmtDate(validFrom)}`);
    else if (validUntil)              lines.push(`Valable jusqu'au ${fmtDate(validUntil)}`);

    if (!timeAllday && timeFrom && timeUntil) {
      const fmtH = (tm) => String(tm).substring(0, 5).replace(':', 'h');
      lines.push(`de ${fmtH(timeFrom)} a ${fmtH(timeUntil)}`);
    }

    if (maxUses && parseInt(maxUses) > 0) lines.push('Offre limitee');

    const contact = [addr, tel].filter(Boolean).join(' - ');
    if (contact) lines.push(contact);

    let msg = lines.join('\n');
    if (msg.length > 160) msg = msg.slice(0, 157) + '...';
    setSmsMessage(msg);
  }, [code, value, type, merchant, open, smsUserEdited, validFrom, validUntil, timeAllday, timeFrom, timeUntil, maxUses]);

  useEffect(() => {
    if (init) {
      setCode(init.code || ''); setType(init.type || 'percent'); setValue(init.value || '');
      setMaxUses(init.max_uses || '');
      setValidFrom(init.valid_from || ''); setValidUntil(init.valid_until || '');
      setTargetClients(init.target_clients || 'all');
      setTimeAllday(init.time_allday !== false);
      setTimeFrom(init.time_from ? init.time_from.substring(0, 5) : '10:00');
      setTimeUntil(init.time_until ? init.time_until.substring(0, 5) : '14:00');
    } else {
      setCode(''); setType('percent'); setValue(''); setMaxUses('');
      setValidFrom(new Date().toISOString().split('T')[0]); setValidUntil('');
      setTargetClients('all'); setTimeAllday(true); setTimeFrom('10:00'); setTimeUntil('14:00');
    }
    setCampaignChannel('none'); setPreview(null); setSmsMessage('');
  }, [init, open]);

  if (!open) return null;

  const inp = {
    width:'100%', padding:'10px 12px', borderRadius:8, outline:'none',
    background:t.inputBg, border:`0.5px solid ${t.borderInput}`,
    color:t.text, fontSize:14, fontFamily:'inherit', boxSizing:'border-box',
    transition:'border-color 0.15s ease, box-shadow 0.15s ease',
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose}
           style={{ position:'absolute', inset:0,
                    background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}/>
      <div style={{ position:'relative', width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto',
                    background:t.elevated, borderRadius:16, padding:24,
                    border:`0.5px solid ${t.border}`,
                    boxShadow:t.shadowModal }}>
        <h3 style={{ fontSize:16, fontWeight:500, color:t.text, margin:'0 0 18px' }}>
          {init ? 'Modifier le code' : 'Nouveau code promo'}
        </h3>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <Label>Code *</Label>
            <input placeholder="BIENVENUE10" value={code}
                   onChange={e => setCode(e.target.value.toUpperCase())}
                   style={{ ...inp, textTransform:'uppercase', fontFamily:'monospace',
                            fontWeight:500, fontSize:15, letterSpacing:'0.1em' }}/>
          </div>
          <div>
            <Label>Type de remise</Label>
            <SegmentedControl fullWidth value={type} onChange={setType}
                              options={[
                                { value:'percent', label:'% Pourcentage'  },
                                { value:'fixed',   label:'€ Montant fixe' },
                              ]}/>
          </div>
          <div>
            <Label>Valeur *</Label>
            <div style={{ position:'relative' }}>
              <input type="number" min="0" placeholder={type === 'percent' ? '10' : '5.00'}
                     value={value} onChange={e => setValue(e.target.value)}
                     style={{ ...inp, paddingRight:34 }}/>
              <span style={{ position:'absolute', right:12, top:'50%',
                             transform:'translateY(-50%)',
                             fontWeight:500, color:t.muted, fontSize:14 }}>
                {type === 'percent' ? '%' : '€'}
              </span>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <Label>Valide du</Label>
              <input type="date" value={validFrom}
                     onChange={e => setValidFrom(e.target.value)} style={inp}/>
            </div>
            <div>
              <Label>{"Jusqu'au"}</Label>
              <input type="date" value={validUntil}
                     onChange={e => setValidUntil(e.target.value)} style={inp}/>
            </div>
          </div>

          <div>
            <Label>{"Plage horaire d'utilisation"}</Label>
            <SegmentedControl fullWidth value={timeAllday ? 'all' : 'range'}
                              onChange={v => setTimeAllday(v === 'all')}
                              options={[
                                { value:'all',   label:'Toute la journee' },
                                { value:'range', label:'Plage horaire'    },
                              ]}
                              style={{ marginBottom: timeAllday ? 0 : 10 }}/>
            {!timeAllday && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8 }}>
                <div>
                  <Label>De</Label>
                  <input type="time" value={timeFrom}
                         onChange={e => setTimeFrom(e.target.value)} style={inp}/>
                </div>
                <div>
                  <Label>A</Label>
                  <input type="time" value={timeUntil}
                         onChange={e => setTimeUntil(e.target.value)} style={inp}/>
                </div>
              </div>
            )}
            {!timeAllday && timeFrom && timeUntil && (
              <div style={{ marginTop:8, padding:'7px 12px', borderRadius:8, background:'#fffbeb' }}>
                <p style={{ fontSize:11, fontWeight:500, color:'#92400e', margin:0 }}>
                  Code valide de {timeFrom} a {timeUntil}
                </p>
              </div>
            )}
          </div>

          <div>
            <Label>Utilisations max (vide = illimite)</Label>
            <input type="number" min="1" placeholder="Illimite" value={maxUses}
                   onChange={e => setMaxUses(e.target.value)} style={inp}/>
          </div>

          <div>
            <Label>Applicable a</Label>
            <SegmentedControl fullWidth value={targetClients} onChange={setTargetClients}
                              options={[
                                { value:'all', label:'Tous les clients' },
                                { value:'new', label:'Nouveaux clients' },
                              ]}/>
          </div>

          {!init && (
            <div style={{ padding:14, borderRadius:12,
                          background:t.cardAlt, border:`0.5px solid ${t.border}` }}>
              <p style={{ fontSize:12, color:t.muted, margin:'0 0 10px' }}>Envoyer aux clients</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
                {[
                  { id:'none',  label:'Ne pas envoyer',    color:t.muted    },
                  { id:'email', label:'Email (gratuit)',   color:'#4338ca'  },
                  { id:'sms',   label:'SMS (payant)',      color:'#92400e'  },
                  { id:'both',  label:'Email + SMS',       color:'#3c3489'  },
                ].map(ch => {
                  const active = campaignChannel === ch.id;
                  return (
                    <button key={ch.id}
                            onClick={() => { setCampaignChannel(ch.id); setPreview(null); }}
                            style={{ padding:'9px 8px', borderRadius:8, fontWeight:500, fontSize:11,
                                     cursor:'pointer',
                                     border:`0.5px solid ${active ? ch.color : t.border}`,
                                     background: active ? `${ch.color}15` : t.inputBg,
                                     color: active ? ch.color : t.muted,
                                     fontFamily:'inherit' }}>
                      {ch.label}
                    </button>
                  );
                })}
              </div>
              {campaignChannel !== 'none' && (
                <>
                  <p style={{ fontSize:11, color:t.muted, margin:'0 0 6px' }}>Ciblage</p>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                    {[
                      { id:'top50',  l:'Top 50'        },
                      { id:'top100', l:'Top 100'       },
                      { id:'top200', l:'Top 200'       },
                      { id:'all',    l:'Tous'          },
                      { id:'custom', l:'Personnalise'  },
                    ].map(tg => {
                      const active = campaignTarget === tg.id;
                      return (
                        <button key={tg.id} onClick={() => setCampaignTarget(tg.id)}
                                style={{ padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:500,
                                         cursor:'pointer',
                                         border:`0.5px solid ${active ? '#4338ca' : t.border}`,
                                         background: active ? '#eef2ff' : t.inputBg,
                                         color: active ? '#4338ca' : t.muted,
                                         fontFamily:'inherit' }}>
                          {tg.l}
                        </button>
                      );
                    })}
                  </div>
                  {campaignTarget === 'custom' && (
                    <div style={{ marginBottom:10 }}>
                      <input type="number" min="1" value={customCount}
                             onChange={e => setCustomCount(e.target.value)}
                             placeholder="Nombre de clients"
                             style={{ ...inp, fontSize:12 }}/>
                    </div>
                  )}
                  {(campaignChannel === 'sms' || campaignChannel === 'both') && (
                    <div style={{ marginBottom:10 }}>
                      <Label>Message SMS (160 car. max)</Label>
                      <textarea value={smsMessage}
                                onChange={e => { setSmsMessage(e.target.value.slice(0, 160)); setSmsUserEdited(true); }}
                                placeholder="Profitez de -10% avec le code PROMO10 !"
                                style={{ ...inp, height:72, resize:'none', fontSize:12 }}/>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <button type="button" onClick={() => setSmsUserEdited(false)}
                                style={{ fontSize:10, padding:'3px 8px', borderRadius:6,
                                         border:`0.5px solid ${t.border}`,
                                         background:'transparent', color:t.muted, cursor:'pointer',
                                         fontFamily:'inherit' }}>
                          Remplissage auto
                        </button>
                        <p style={{ margin:0, fontSize:10,
                                    color: smsMessage.length > 150 ? '#991b1b' : t.muted }}>
                          {smsMessage.length}/160
                        </p>
                      </div>
                    </div>
                  )}
                  <Button variant="secondary" size="small" type="button"
                          onClick={async () => {
                            setPreviewLoading(true);
                            try {
                              const p = await campaignsApi.getCampaignPreview({
                                target_type: campaignTarget, custom_count: customCount, channel: campaignChannel,
                              });
                              setPreview(p);
                            } catch (e) { alert(e.message); }
                            finally { setPreviewLoading(false); }
                          }}
                          disabled={previewLoading}
                          style={{ width:'100%' }}>
                    {previewLoading ? 'Calcul...' : 'Calculer le cout'}
                  </Button>
                  {preview && (
                    <div style={{ marginTop:10, padding:'10px 12px', borderRadius:8,
                                  background:t.card, border:`0.5px solid ${t.border}`, fontSize:12 }}>
                      {preview.email && (
                        <>
                          <p style={{ margin:'3px 0', color:t.text }}>
                            <strong style={{ fontWeight:500 }}>{preview.email.count} clients</strong> recevront un email
                          </p>
                          {preview.email.plan
                            ? <p style={{ margin:'3px 0', color:'#92400e', fontWeight:500 }}>
                                Envoi sur {preview.email.plan.days_needed + 1} jours automatiquement
                              </p>
                            : <p style={{ margin:'3px 0', color:'#065f46', fontWeight:500 }}>
                                {"Envoi possible aujourd'hui"}
                              </p>}
                        </>
                      )}
                      {preview.sms && (
                        <>
                          <p style={{ margin:'3px 0', color:t.text }}>
                            <strong style={{ fontWeight:500 }}>{preview.sms.count} clients</strong> recevront un SMS
                          </p>
                          <p style={{ margin:'3px 0', color:t.text }}>
                            Cout : <strong style={{ fontWeight:500 }}>
                              {parseFloat(preview.sms.cost || 0).toFixed(2)} €
                            </strong>
                          </p>
                          {preview.sms.sufficient
                            ? <p style={{ margin:'3px 0', color:'#065f46', fontWeight:500 }}>
                                Solde OK ({parseFloat(preview.sms.balance || 0).toFixed(2)} €)
                              </p>
                            : <p style={{ margin:'3px 0', color:'#991b1b', fontWeight:500 }}>
                                Il vous manque {parseFloat((preview.sms.cost || 0) - (preview.sms.balance || 0)).toFixed(2)} €
                                <button onClick={() => window.location.href = '/settings/marketing?recharge=need'}
                                        style={{ marginLeft:8, padding:'3px 10px', borderRadius:6,
                                                 fontSize:11, fontWeight:500,
                                                 background:'#eef2ff', color:'#4338ca',
                                                 border:'none', cursor:'pointer',
                                                 fontFamily:'inherit' }}>
                                  Recharger
                                </button>
                              </p>}
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
          <Button variant="secondary" type="button" onClick={onClose} style={{ flex:1 }}>
            Annuler
          </Button>
          <Button variant="primary" type="button"
                  disabled={saving || sendingCampaign || !code || !value || (campaignChannel === 'sms' && preview && !preview.sms?.sufficient)}
                  style={{ flex:2 }}
                  onClick={async () => {
                    if (!code || !value) return;
                    setSaving(true);
                    try {
                      const saved = await onSave({
                        code, type, value: parseFloat(value),
                        max_uses: maxUses ? parseInt(maxUses) : null,
                        valid_from: validFrom || null, valid_until: validUntil || null,
                        target_clients: targetClients,
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
                          if (wantEmail) emailResult = await promoApi.sendEmails(saved.id, { client_ids: [] });
                          if (wantSms) {
                            smsResult = await campaignsApi.sendCampaign({
                              promo_code_id: saved.id,
                              target_type: campaignTarget, custom_count: customCount,
                              channel: 'sms',
                              message_sms: smsMessage || `${code}: ${type === 'percent' ? `-${value}%` : `-${value}€`}`,
                              promo_code: code,
                            });
                          }
                        } catch (e) { error = e.message; }
                        finally { setSendingCampaign(false); }
                        setResultModal({ code, emailResult, smsResult, error, channel: campaignChannel });
                      } else {
                        onClose();
                      }
                    } catch (e) {
                      setResultModal({ code, error: e.message, channel: campaignChannel });
                    } finally { setSaving(false); }
                  }}>
            {saving ? 'Enregistrement...' : sendingCampaign ? 'Envoi...' : campaignChannel !== 'none' ? 'Creer + Envoyer' : init ? 'Modifier' : 'Creer le code'}
          </Button>
        </div>
      </div>
      {resultModal && (
        <SendResultModal data={resultModal} theme={theme}
                         onClose={() => { setResultModal(null); onClose(); }}/>
      )}
    </div>
  );
}
