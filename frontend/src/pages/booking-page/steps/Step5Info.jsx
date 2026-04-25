// src/pages/booking-page/steps/Step5Info.jsx
// Étape 5 : infos client — auth-first (login/register/google/sans compte).
// Gère le formulaire téléphone avec indicatif pays et la validation email.

import { pubApi } from '../../../utils/api';
import { AuthPanel } from '../../booking/Account';
import { ConsentCheckboxes } from '../../../components/ConsentCheckboxes';
import { PHONE_COUNTRIES } from '../constants';
import { formatPhone, validatePhone } from '../helpers';

export function Step5Info({
  th, slug, selSvc, selEmp, selDate, selSlot,
  clientUser, setClientUser, clientName, setCN, clientEmail, setCE,
  clientPhone, setCP, notes, setNotes, bookErr,
  phoneCC, setPhoneCC, phoneLocal, setPhoneLocal,
  phoneDrop, setPhoneDrop, phoneErr, setPhoneErr,
  emailStatus, setEmailStatus, emailCheckTimer,
  requireAccount, inlineAuthMode, setInlineAuthMode,
  referralCode, handleAuth, navigate, setMyApptsInitTab, setView, goToStep,
  noAcctConsent, setNoAcctConsent,
}) {
  return (
    <div>
      <h2 style={{fontSize:20,fontWeight: 500,color:th.text,margin:'0 0 20px',letterSpacing:'-0.02em'}}>
        Vos informations
      </h2>
      {/* Récap */}
      <div style={{background:th.cardAlt,borderRadius:12,border: `0.5px solid ${th.border}`,
        padding:'14px 16px',marginBottom:24}}>
        <p style={{fontSize:11,fontWeight: 500,
          color:th.dim,margin:'0 0 8px'}}>Récapitulatif</p>
        {[['Service',selSvc?.name],
          ['Avec',selEmp?._anyEmployee?'Premier disponible':selEmp?.name],
          ['Le',selDate?.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})],
          ['À',selSlot],
          selSvc?.price&&Number(selSvc.price)>0?['Prix',`${Number(selSvc.price).toFixed(2)} €`]:null
        ].filter(Boolean).map(([l,v])=>(
          <div key={l} style={{display:'flex',justifyContent:'space-between',
            padding:'5px 0',borderTop: `0.5px solid ${th.border}`}}>
            <span style={{fontSize:12,color:th.muted}}>{l}</span>
            <span style={{fontSize:12,fontWeight: 500,color:th.text}}>{v}</span>
          </div>
        ))}
      </div>

      {clientUser ? (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:12,
            background:th.card,border: `0.5px solid ${th.border}`,
            borderRadius:12,padding:'14px 16px',marginBottom:16}}>
            <div style={{width:44,height:44,borderRadius:99,flexShrink:0,
              background:th.accent,display:'flex',alignItems:'center',
              justifyContent:'center',color:th.accentText,fontWeight: 500,fontSize:17}}>
              {(clientUser.first_name||'?').charAt(0).toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <p style={{fontWeight: 500,fontSize:14,color:th.text,margin:'0 0 2px'}}>
                {clientUser.first_name} {clientUser.last_name}
              </p>
              <p style={{fontSize:12,color:th.muted,margin:0}}>{clientUser.email}</p>
            </div>
            <button onClick={()=>{navigate(`/book/${slug}/client/profil`,{replace:false}); setMyApptsInitTab('profile');setView('myAppts');}}
              style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight: 500,
                color:th.text,background:th.cardAlt,border: `0.5px solid ${th.border}`,cursor:'pointer'}}>
              Profil
            </button>
          </div>
          {/* Champ téléphone obligatoire si manquant (ex: après Google OAuth) */}
          {!clientPhone.trim() && (
            <div style={{background:'rgba(245,158,11,0.06)',border: '0.5px solid rgba(245,158,11,0.25)',
              borderRadius:10,padding:'12px 14px',marginBottom:14}}>
              <p style={{fontSize:12,fontWeight: 500,color:'#d97706',margin:'0 0 8px'}}>
                Complétez votre profil pour continuer
              </p>
              <label style={{display:'block',fontSize:11,fontWeight: 500,
                color:th.muted,marginBottom:5}}>
                Téléphone *
              </label>
              <div style={{display:'flex',gap:6,position:'relative'}}>
                <div style={{position:'relative'}}>
                  <button type="button" onClick={()=>setPhoneDrop(!phoneDrop)}
                    style={{display:'flex',alignItems:'center',gap:4,padding:'11px 10px',
                      borderRadius:9,background:th.inputBg,border: `0.5px solid ${th.inputBorder}`,
                      color:th.text,fontSize:13,cursor:'pointer',whiteSpace:'nowrap',height:'100%'}}>
                    <span style={{fontSize:16}}>{phoneCC.flag}</span>
                    <span style={{fontSize:12,fontWeight: 500}}>{phoneCC.dial}</span>
                    <span style={{fontSize:9,opacity:0.5}}>▼</span>
                  </button>
                  {phoneDrop && (
                    <div style={{position:'absolute',top:'100%',left:0,zIndex:999,marginTop:4,
                      background:th.card,border: `0.5px solid ${th.border}`,borderRadius:10,
                      boxShadow:'0 8px 24px rgba(0,0,0,0.15)',maxHeight:200,overflowY:'auto',minWidth:200}}>
                      {PHONE_COUNTRIES.map(c=>(
                        <button key={c.code} type="button" onClick={()=>{setPhoneCC(c);setPhoneDrop(false);setPhoneErr('');}}
                          style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',
                            background:phoneCC.code===c.code?'rgba(99,102,241,0.08)':'transparent',
                            border:'none',cursor:'pointer',color:th.text,fontSize:13,textAlign:'left'}}>
                          <span style={{fontSize:16}}>{c.flag}</span>
                          <span style={{fontWeight: 500}}>{c.dial}</span>
                          <span style={{color:th.muted,fontSize:12}}>{c.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input type="tel" inputMode="tel" placeholder="6 03 04 46 17" value={phoneLocal}
                  maxLength={20} pattern="[0-9+\s\-]*"
                  onChange={e=>{setPhoneLocal(e.target.value);setPhoneErr('');}}
                  style={{flex:1,padding:'11px 12px',borderRadius:9,outline:'none',
                    background:th.inputBg,border: `0.5px solid ${phoneErr?'#ef4444':th.inputBorder}`,
                    color:th.text,fontSize:13,boxSizing:'border-box'}}/>
              </div>
              {phoneErr && <p style={{fontSize:11,color:'#ef4444',marginTop:4,fontWeight: 500}}>{phoneErr}</p>}
            </div>
          )}
          <label style={{display:'block',fontSize:12,fontWeight: 500,color:th.muted,marginBottom:6}}>
            Note (optionnelle)
          </label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value.slice(0,500))} rows={3}
            maxLength={500}
            placeholder="Demandes particulières…"
            style={{width:'100%',padding:'12px 14px',borderRadius:10,outline:'none',
              background:th.inputBg,border: `0.5px solid ${th.inputBorder}`,
              color:th.text,fontSize:13,resize:'none',lineHeight:1.5}}/>
          <button onClick={async ()=>{
            // Valider et formater le téléphone si pas encore fait
            if(!clientPhone.trim()){
              const err=validatePhone(phoneCC,phoneLocal);
              if(err){setPhoneErr(err);return;}
              const formatted=formatPhone(phoneCC,phoneLocal);
              setCP(formatted);
              // Sauvegarder dans le profil backend
              if(clientUser && !clientUser.phone){
                try{
                  const tk=localStorage.getItem('ff_client_token');
                  if(tk) await pubApi.updateClientProfile(slug,{
                    first_name:clientUser.first_name,last_name:clientUser.last_name,
                    email:clientUser.email,phone:formatted
                  });
                  const updated={...clientUser,phone:formatted};
                  setClientUser(updated);
                  localStorage.setItem('ff_client_info',JSON.stringify(updated));
                }catch{}
              }
            }
            goToStep(6);
          }}
            disabled={!clientPhone.trim()&&!phoneLocal.replace(/\D/g,'')}
            style={{width:'100%',marginTop:16,padding:'15px',borderRadius:12,
              background:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?th.border:th.accent,
              border:'none',fontWeight: 500,fontSize:15,
              color:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?th.muted:th.accentText,
              cursor:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?'not-allowed':'pointer',
              opacity:(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,''))?0.5:1}}>
            {(!clientPhone.trim()&&!phoneLocal.replace(/\D/g,'')) ? 'Téléphone requis' : 'Continuer →'}
          </button>
        </div>
      ) : (
        <div>
          {/* ──────────────────────────────────────────────────────────
              LOGIQUE AUTH :
              • requireAccount=true → AuthPanel inline obligatoire
              • requireAccount=false + inlineAuthMode='none' → choix + form sans compte
              • requireAccount=false + inlineAuthMode='login'/'register' → AuthPanel inline
              ────────────────────────────────────────────────────────── */}

          {(requireAccount || inlineAuthMode !== 'none') ? (
            /* ── AuthPanel INLINE — login ou register directement ── */
            /* requireAccount=true → TOUJOURS ici, pas de formulaire sans compte */
            <div>
              <AuthPanel
                slug={slug} th={th}
                requireAccount={requireAccount}
                initialMode={inlineAuthMode === 'none' ? 'login' : inlineAuthMode}
                initialEmail={clientEmail||''}
                referralCode={referralCode}
                onAuth={handleAuth}
                onClose={requireAccount ? null : ()=>setInlineAuthMode('none')}
              />
            </div>
          ) : (
            /* ── Formulaire principal : suggestion auth + form sans compte ── */
            <div>
              {/* ── Bloc suggestion auth ── */}
              <div style={{background:th.card,border: `0.5px solid ${th.border}`,
                borderRadius:12,padding:16,marginBottom:16}}>
                <p style={{fontSize:13,fontWeight: 500,color:th.text,margin:'0 0 3px'}}>
                  Déjà un compte ? Connectez-vous
                </p>
                <p style={{fontSize:11,color:th.muted,margin:'0 0 12px',lineHeight:1.5}}>
                  Vos coordonnées sont renseignées automatiquement.
                </p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                  <button onClick={()=>setInlineAuthMode('login')}
                    style={{padding:'11px',borderRadius:10,background:th.accent,
                      border:'none',fontWeight: 500,fontSize:13,color:th.accentText,cursor:'pointer'}}>
                    Se connecter
                  </button>
                  <button onClick={()=>setInlineAuthMode('register')}
                    style={{padding:'11px',borderRadius:10,background:th.card,
                      border: `0.5px solid ${th.border}`,fontWeight: 500,fontSize:13,
                      color:th.text,cursor:'pointer'}}>
                    Créer un compte
                  </button>
                </div>
                {/* Bouton Google — RGPD commit 17 : marketing_opt_in transmis
                    via state OAuth (m1/m0). Ce flow n'oblige pas le consent
                    CGU car l'utilisateur peut aussi se LOGIN ; le consent est
                    déjà signé pour les comptes existants. */}
                <button onClick={()=>{ const url=pubApi.googleAuthUrl(slug, undefined, !!noAcctConsent?.marketingAccepted); window.open(url,'google_auth','width=500,height=600,scrollbars=yes,top=100,left='+Math.round((window.screen.width-500)/2)); try { const bc=new BroadcastChannel('flowia-oauth'); bc.onmessage=(ev)=>{ if(ev.data?.type!=='client_login')return; const{client}=ev.data; if(client) handleAuth(client); bc.close(); }; setTimeout(()=>{ try{bc.close();}catch{} }, 5*60*1000); } catch{} }}
                  style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                    padding:'11px',borderRadius:10,background:th.card,
                    border: `0.5px solid ${th.border}`,cursor:'pointer',
                    fontWeight: 500,fontSize:13,color:th.text}}>
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continuer avec Google
                </button>
              </div>

              {/* Séparateur */}
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                <div style={{flex:1,height:1,background:th.border}}/>
                <span style={{fontSize:11,color:th.dim,whiteSpace:'nowrap',padding:'0 6px'}}>
                  ou continuer sans compte
                </span>
                <div style={{flex:1,height:1,background:th.border}}/>
              </div>

              {/* Formulaire sans compte — Prénom, Nom, Email, Téléphone, Note */}
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div>
                    <label style={{display:'block',fontSize:11,fontWeight: 500,
                      color:th.muted,marginBottom:5}}>
                      Prénom *
                    </label>
                    <input placeholder="Prénom"
                      value={clientName.split(' ')[0]||''}
                      onChange={e=>{const nom=clientName.split(' ').slice(1).join(' ');setCN(e.target.value.trim()+(nom?' '+nom:''));}}
                      style={{width:'100%',padding:'11px 12px',borderRadius:9,outline:'none',
                        background:th.inputBg,border: `0.5px solid ${th.inputBorder}`,
                        color:th.text,fontSize:13,boxSizing:'border-box'}}/>
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:11,fontWeight: 500,
                      color:th.muted,marginBottom:5}}>
                      Nom *
                    </label>
                    <input placeholder="Nom"
                      value={clientName.split(' ').slice(1).join(' ')||''}
                      onChange={e=>{const prenom=clientName.split(' ')[0]||'';setCN(prenom+(e.target.value.trim()?' '+e.target.value.trim():''));}}
                      style={{width:'100%',padding:'11px 12px',borderRadius:9,outline:'none',
                        background:th.inputBg,border: `0.5px solid ${th.inputBorder}`,
                        color:th.text,fontSize:13,boxSizing:'border-box'}}/>
                  </div>
                </div>

                <div>
                  <label style={{display:'block',fontSize:11,fontWeight: 500,
                    color:th.muted,marginBottom:5}}>
                    Email *
                  </label>
                  <div style={{position:'relative'}}>
                    <input type="email" placeholder="votre@email.com" value={clientEmail}
                      onChange={e=>{const val=e.target.value;setCE(val);setEmailStatus('idle');
                        clearTimeout(emailCheckTimer.current);
                        if(!val.trim()||!val.includes('@')||!val.includes('.'))return;
                        setEmailStatus('checking');
                        emailCheckTimer.current=setTimeout(async()=>{
                          try{const res=await pubApi.checkEmail(slug,val.trim());
                            setEmailStatus(res.exists?'exists':'free');}
                          catch{setEmailStatus('idle');}
                        },500);
                      }}
                      style={{width:'100%',padding:'11px 36px 11px 12px',borderRadius:9,outline:'none',
                        background:th.inputBg,
                        border: `0.5px solid ${emailStatus==='exists'?'#ef4444':emailStatus==='free'?'#22c55e':th.inputBorder}`,
                        color:th.text,fontSize:13}}/>
                    {emailStatus==='checking'&&<div style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',width:13,height:13,borderRadius:'50%',border:'2px solid rgba(0,0,0,0.1)',borderTopColor:th.accent,animation:'spin .7s linear infinite'}}/>}
                    {emailStatus==='free'&&<span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'#22c55e',fontWeight: 500}}>✓</span>}
                    {emailStatus==='exists'&&<span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'#ef4444',fontWeight: 500}}>✕</span>}
                  </div>
                  {emailStatus==='exists'&&(
                    <div style={{marginTop:6,borderRadius:9,border: '0.5px solid rgba(239,68,68,0.2)',
                      background:'rgba(239,68,68,0.04)',overflow:'hidden'}}>
                      <p style={{fontSize:12,fontWeight: 500,color:'#dc2626',padding:'8px 12px 4px',margin:0}}>
                        Un compte existe — connectez-vous
                      </p>
                      <button onClick={()=>{setInlineAuthMode('login');}}
                        style={{width:'100%',padding:'9px 12px',background:'#ef4444',border:'none',
                          color:'white',fontWeight: 500,fontSize:12,cursor:'pointer'}}>
                        Se connecter →
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{display:'block',fontSize:11,fontWeight: 500,
                    color:th.muted,marginBottom:5}}>
                    Téléphone *
                  </label>
                  <div style={{display:'flex',gap:6,position:'relative'}}>
                    <div style={{position:'relative'}}>
                      <button type="button" onClick={()=>setPhoneDrop(!phoneDrop)}
                        style={{display:'flex',alignItems:'center',gap:4,padding:'11px 10px',
                          borderRadius:9,background:th.inputBg,border: `0.5px solid ${th.inputBorder}`,
                          color:th.text,fontSize:13,cursor:'pointer',whiteSpace:'nowrap',height:'100%'}}>
                        <span style={{fontSize:16}}>{phoneCC.flag}</span>
                        <span style={{fontSize:12,fontWeight: 500}}>{phoneCC.dial}</span>
                        <span style={{fontSize:9,opacity:0.5}}>▼</span>
                      </button>
                      {phoneDrop && (
                        <div style={{position:'absolute',top:'100%',left:0,zIndex:999,marginTop:4,
                          background:th.card,border: `0.5px solid ${th.border}`,borderRadius:10,
                          boxShadow:'0 8px 24px rgba(0,0,0,0.15)',maxHeight:200,overflowY:'auto',minWidth:200}}>
                          {PHONE_COUNTRIES.map(c=>(
                            <button key={c.code} type="button" onClick={()=>{setPhoneCC(c);setPhoneDrop(false);setPhoneErr('');}}
                              style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'9px 12px',
                                background:phoneCC.code===c.code?'rgba(99,102,241,0.08)':'transparent',
                                border:'none',cursor:'pointer',color:th.text,fontSize:13,textAlign:'left'}}>
                              <span style={{fontSize:16}}>{c.flag}</span>
                              <span style={{fontWeight: 500}}>{c.dial}</span>
                              <span style={{color:th.muted,fontSize:12}}>{c.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input type="tel" placeholder="6 03 04 46 17" value={phoneLocal}
                      onChange={e=>{setPhoneLocal(e.target.value);setPhoneErr('');}}
                      style={{flex:1,padding:'11px 12px',borderRadius:9,outline:'none',
                        background:th.inputBg,border: `0.5px solid ${phoneErr?'#ef4444':th.inputBorder}`,
                        color:th.text,fontSize:13}}/>
                  </div>
                  {phoneErr && <p style={{fontSize:11,color:'#ef4444',marginTop:4,fontWeight: 500}}>{phoneErr}</p>}
                </div>

                <div>
                  <label style={{display:'block',fontSize:11,fontWeight: 500,
                    color:th.muted,marginBottom:5}}>
                    Note <span style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>(optionnelle)</span>
                  </label>
                  <textarea placeholder="Demandes particulières…" value={notes}
                    onChange={e=>setNotes(e.target.value)} rows={2}
                    style={{width:'100%',padding:'11px 12px',borderRadius:9,outline:'none',
                      background:th.inputBg,border: `0.5px solid ${th.inputBorder}`,
                      color:th.text,fontSize:13,resize:'none',lineHeight:1.5}}/>
                </div>
              </div>

              {/* RGPD commit 17 : 2 cases CGU (cochée par défaut) + marketing
                  (libre, non cochée par défaut). Le bouton "Continuer" est
                  bloqué tant que la case obligatoire n'est pas cochée. */}
              {setNoAcctConsent && (
                <div style={{ marginTop:14 }}>
                  <ConsentCheckboxes slug={slug} th={th} onChange={setNoAcctConsent}/>
                </div>
              )}
              {(() => {
                const contractOk = !setNoAcctConsent || noAcctConsent?.contractAccepted;
                const blocked = !clientName.trim()||emailStatus==='exists'||!clientEmail.trim()||!phoneLocal.replace(/\D/g,'')||!contractOk;
                return (
                  <button
                    onClick={()=>{
                      const err=validatePhone(phoneCC,phoneLocal);
                      if(err){setPhoneErr(err);return;}
                      setCP(formatPhone(phoneCC,phoneLocal));
                      goToStep(6);
                    }}
                    disabled={blocked}
                    style={{width:'100%',marginTop:16,padding:'14px',borderRadius:12,
                      background: blocked ? th.border : th.accent,
                      border:'none',fontWeight: 500,fontSize:14,
                      color: blocked ? th.muted : th.accentText,
                      cursor: blocked ? 'not-allowed' : 'pointer',
                      opacity: blocked ? 0.5 : 1}}>
                    {emailStatus==='exists' ? "Connectez-vous d'abord" : 'Continuer →'}
                  </button>
                );
              })()}
            </div>
          )}
        </div>
      )}
      {bookErr && <p style={{fontSize:12,color:'#ef4444',marginTop:10,fontWeight: 500}}>{bookErr}</p>}
    </div>
  );
}
