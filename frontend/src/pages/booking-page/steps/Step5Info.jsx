// src/pages/booking-page/steps/Step5Info.jsx
// Étape 5 : infos client — compte obligatoire (commit 22).
// Si client connecté → récap profil + téléphone (si manquant) + note.
// Sinon → AuthPanel inline (Google primaire + email/password). Pas de
// formulaire "résa rapide sans compte" : il a été supprimé en commit 22.

import { pubApi } from '../../../utils/api';
import { AuthPanel } from '../../booking/Account';
import { PhoneInput, isValidPhoneNumber } from '../../../components/PhoneInput';

export function Step5Info({
  th, slug, selSvc, selEmp, selDate, selSlot,
  clientUser, setClientUser,
  clientPhone, setCP, notes, setNotes, bookErr,
  phoneErr, setPhoneErr,
  referralCode, handleAuth, navigate, setMyApptsInitTab, setView, goToStep,
}) {
  return (
    <div>
      <h2 style={{fontSize:22,fontWeight: 500,color:th.text,margin:'0 0 22px',
        letterSpacing:'-0.025em', lineHeight:1.2}}>
        Vos informations
      </h2>
      {/* Récap */}
      <div style={{background:th.cardAlt,borderRadius:14,border: `1px solid ${th.border}`,
        padding:'16px 18px',marginBottom:24, boxShadow: th.shadowSm}}>
        <p style={{fontSize:11,fontWeight: 500,
          color:th.muted,margin:'0 0 10px',textTransform:'uppercase',letterSpacing:1}}>Récapitulatif</p>
        {[['Service',selSvc?.name],
          ['Avec',selEmp?._anyEmployee?'Premier disponible':selEmp?.name],
          ['Le',selDate?.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})],
          ['À',selSlot],
          selSvc?.price&&Number(selSvc.price)>0?['Prix',`${Number(selSvc.price).toFixed(2)} €`]:null
        ].filter(Boolean).map(([l,v])=>(
          <div key={l} style={{display:'flex',justifyContent:'space-between',
            padding:'7px 0',borderTop: `1px solid ${th.border}`}}>
            <span style={{fontSize:13,color:th.muted}}>{l}</span>
            <span style={{fontSize:13,fontWeight: 500,color:th.text,
              fontFamily: l === 'À' || l === 'Prix' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit'}}>{v}</span>
          </div>
        ))}
      </div>

      {clientUser ? (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:12,
            background:th.card,border: `1px solid ${th.border}`,
            borderRadius:14,padding:'14px 16px',marginBottom:16, boxShadow: th.shadowSm}}>
            <div style={{width:44,height:44,borderRadius:99,flexShrink:0,
              background:th.accent,display:'flex',alignItems:'center',
              justifyContent:'center',color:th.accentText,fontWeight: 500,fontSize:17,
              letterSpacing:'-0.01em'}}>
              {(clientUser.first_name||'?').charAt(0).toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <p style={{fontWeight: 500,fontSize:15,color:th.text,margin:'0 0 2px',
                letterSpacing:'-0.01em'}}>
                {clientUser.first_name} {clientUser.last_name}
              </p>
              <p style={{fontSize:12,color:th.muted,margin:0}}>{clientUser.email}</p>
            </div>
            <button onClick={()=>{navigate(`/book/${slug}/client/profil`,{replace:false}); setMyApptsInitTab('profile');setView('myAppts');}}
              style={{padding:'7px 12px',borderRadius:8,fontSize:12,fontWeight: 500,
                color:th.text,background:th.bg,border: `1px solid ${th.border}`,cursor:'pointer',
                fontFamily:'inherit',
                transition:'background 0.15s ease, border-color 0.15s ease'}}
              onMouseEnter={e=>{ e.currentTarget.style.background = th.bgHover; e.currentTarget.style.borderColor = th.borderHv; }}
              onMouseLeave={e=>{ e.currentTarget.style.background = th.bg; e.currentTarget.style.borderColor = th.border; }}>
              Profil
            </button>
          </div>
          {/* Champ téléphone obligatoire si manquant (ex: après Google OAuth).
              RGPD commit 20 : PhoneInput avec validation libphonenumber-js. */}
          {!clientPhone.trim() && (
            <div style={{background:th.ax.amberBg,border: `1px solid ${th.ax.amber}33`,
              borderRadius:12,padding:'14px 16px',marginBottom:16}}>
              <p style={{fontSize:12,fontWeight: 500,color:th.ax.amber,margin:'0 0 10px',
                letterSpacing:'-0.005em'}}>
                Complétez votre profil pour continuer
              </p>
              <PhoneInput value={clientPhone} onChange={setCP}
                label="Téléphone *" required
                theme={{ text: th.text, muted: th.muted, dim: th.dim,
                  border: th.border, inputBg: th.inputBg, inputBorder: th.inputBorder }}/>
            </div>
          )}
          <label style={{display:'block',fontSize:13,fontWeight: 500,color:th.text,marginBottom:6}}>
            Note (optionnelle)
          </label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value.slice(0,500))} rows={3}
            maxLength={500}
            placeholder="Demandes particulières…"
            style={{width:'100%',padding:'12px 14px',borderRadius:10,outline:'none',
              background:th.inputBg,border: `1px solid ${th.inputBorder}`,
              color:th.text,fontSize:14,resize:'none',lineHeight:1.5,
              fontFamily:'inherit',
              transition:'border-color 0.15s ease, box-shadow 0.15s ease'}}/>
          {(() => {
            const phoneOk = isValidPhoneNumber(clientPhone || '');
            return (
              <button onClick={async ()=>{
                // RGPD commit 20 : phone déjà en E.164 dans clientPhone, validé par PhoneInput.
                if (!phoneOk) { setPhoneErr('Numéro invalide pour le pays sélectionné.'); return; }
                if (clientUser && !clientUser.phone) {
                  // Cookie HttpOnly : on appelle directement l'API, le backend
                  // lit le cookie et 401 si pas authentifié (catch silencieux).
                  try{
                    await pubApi.updateClientProfile(slug, {
                      first_name: clientUser.first_name, last_name: clientUser.last_name,
                      email: clientUser.email, phone: clientPhone,
                    });
                    const updated = { ...clientUser, phone: clientPhone };
                    setClientUser(updated);
                    localStorage.setItem('ff_client_info', JSON.stringify(updated));
                  } catch {}
                }
                goToStep(6);
              }}
                disabled={!phoneOk}
                style={{width:'100%',marginTop:18,padding:'14px',borderRadius:10,
                  background: phoneOk ? th.accent : th.cardAlt,
                  border: phoneOk ? `1px solid ${th.accent}` : `1px solid ${th.border}`,
                  fontWeight: 500,fontSize:15,
                  color: phoneOk ? th.accentText : th.muted,
                  cursor: phoneOk ? 'pointer' : 'not-allowed',
                  fontFamily:'inherit',
                  transition: 'opacity 0.15s ease'}}
                onMouseEnter={e=>{ if(phoneOk) e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={e=>{ if(phoneOk) e.currentTarget.style.opacity = '1'; }}>
                {phoneOk ? 'Continuer →' : 'Téléphone requis'}
              </button>
            );
          })()}
        </div>
      ) : (
        /* Commit 22 : compte obligatoire — AuthPanel inline systématique. */
        <div>
          <AuthPanel
            slug={slug} th={th}
            requireAccount={true}
            initialMode="login"
            referralCode={referralCode}
            onAuth={handleAuth}
            onClose={null}
          />
        </div>
      )}
      {bookErr && <p style={{fontSize:12,color:th.ax.rose,marginTop:10,fontWeight: 500}}>{bookErr}</p>}
    </div>
  );
}
