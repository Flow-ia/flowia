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
      <h2 style={{fontSize:20,fontWeight: 500,color:th.text,margin:'0 0 20px',letterSpacing:'-0.02em'}}>
        Vos informations
      </h2>
      {/* Récap */}
      <div style={{background:th.cardAlt,borderRadius:12,border: `1px solid ${th.border}`,
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
            padding:'5px 0',borderTop: `1px solid ${th.border}`}}>
            <span style={{fontSize:12,color:th.muted}}>{l}</span>
            <span style={{fontSize:12,fontWeight: 500,color:th.text}}>{v}</span>
          </div>
        ))}
      </div>

      {clientUser ? (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:12,
            background:th.card,border: `1px solid ${th.border}`,
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
                color:th.text,background:th.cardAlt,border: `1px solid ${th.border}`,cursor:'pointer'}}>
              Profil
            </button>
          </div>
          {/* Champ téléphone obligatoire si manquant (ex: après Google OAuth).
              RGPD commit 20 : PhoneInput avec validation libphonenumber-js. */}
          {!clientPhone.trim() && (
            <div style={{background:'rgba(245,158,11,0.06)',border: '1px solid rgba(245,158,11,0.25)',
              borderRadius:10,padding:'12px 14px',marginBottom:14}}>
              <p style={{fontSize:12,fontWeight: 500,color:'#d97706',margin:'0 0 8px'}}>
                Complétez votre profil pour continuer
              </p>
              <PhoneInput value={clientPhone} onChange={setCP}
                label="Téléphone *" required
                theme={{ text: th.text, muted: th.muted, dim: th.dim,
                  border: th.border, inputBg: th.inputBg, inputBorder: th.inputBorder }}/>
            </div>
          )}
          <label style={{display:'block',fontSize:12,fontWeight: 500,color:th.muted,marginBottom:6}}>
            Note (optionnelle)
          </label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value.slice(0,500))} rows={3}
            maxLength={500}
            placeholder="Demandes particulières…"
            style={{width:'100%',padding:'12px 14px',borderRadius:10,outline:'none',
              background:th.inputBg,border: `1px solid ${th.inputBorder}`,
              color:th.text,fontSize:13,resize:'none',lineHeight:1.5}}/>
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
                style={{width:'100%',marginTop:16,padding:'15px',borderRadius:12,
                  background: phoneOk ? th.accent : th.border,
                  border:'none',fontWeight: 500,fontSize:15,
                  color: phoneOk ? th.accentText : th.muted,
                  cursor: phoneOk ? 'pointer' : 'not-allowed',
                  opacity: phoneOk ? 1 : 0.5}}>
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
      {bookErr && <p style={{fontSize:12,color:'#ef4444',marginTop:10,fontWeight: 500}}>{bookErr}</p>}
    </div>
  );
}
