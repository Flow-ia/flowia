// src/pages/booking-page/steps/Step5Info.jsx
// Étape 5 : infos client — compte obligatoire (commit 22).
// Si client connecté → récap profil + téléphone (si manquant) + note.
// Sinon → AuthPanel inline (Google primaire + email/password). Pas de
// formulaire "résa rapide sans compte" : il a été supprimé en commit 22.

import { pubApi } from '../../../utils/api';
import { AuthPanel } from '../../booking/Account';
import { PhoneInput, isValidPhoneNumber } from '../../../components/PhoneInput';

export function Step5Info({
  th, slug, base, selSvc, selEmp, selDate, selSlot,
  clientUser, setClientUser,
  clientPhone, setCP, notes, setNotes, bookErr,
  phoneErr, setPhoneErr,
  referralCode, handleAuth, navigate, setMyApptsInitTab, setView, goToStep,
}) {
  const NOTES_MAX = 250;
  return (
    <div>
      <h2 style={{fontSize:18,fontWeight:500,color:th.text,margin:'0 0 12px',letterSpacing:'-0.02em'}}>
        {"Vos informations"}
      </h2>

      {/* Récap compact -- 1 ligne dense Service + Date/heure + Prix */}
      <div style={{background:th.cardAlt,borderRadius:10,border:`0.5px solid ${th.border}`,
        padding:'10px 12px',marginBottom:12}}>
        <p style={{fontSize:13,fontWeight:500,color:th.text,margin:'0 0 2px',letterSpacing:'-0.01em'}}>
          {selSvc?.name}
        </p>
        <p style={{fontSize:11,color:th.muted,margin:0,display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8}}>
          <span>
            {[
              selEmp?._anyEmployee ? 'Premier dispo' : selEmp?.name,
              selDate?.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}),
              selSlot,
            ].filter(Boolean).join(' · ')}
          </span>
          {selSvc?.price && Number(selSvc.price) > 0 && (
            <span style={{fontWeight:500,color:th.text,
              fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace'}}>
              {`${Number(selSvc.price).toFixed(2)} €`}
            </span>
          )}
        </p>
      </div>

      {clientUser ? (
        <div>
          {/* Profil minimal -- 1 ligne, pas de card. Lien "Profil" discret. */}
          <div style={{display:'flex',alignItems:'center',gap:8,
            padding:'4px 2px',marginBottom:14,fontSize:12,color:th.muted}}>
            <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {clientUser.first_name} {clientUser.last_name} · {clientUser.email}
            </span>
            <button type="button"
              onClick={()=>{navigate(`${base}/client/profil`,{replace:false}); setMyApptsInitTab('profile'); setView('myAppts');}}
              style={{padding:0,fontSize:12,fontWeight:500,
                color:th.accent,background:'transparent',border:'none',cursor:'pointer'}}>
              {"Profil"}
            </button>
          </div>

          {/* Telephone obligatoire si manquant */}
          {!clientPhone.trim() && (
            <div style={{background:'rgba(245,158,11,0.06)',border:'0.5px solid rgba(245,158,11,0.25)',
              borderRadius:10,padding:'10px 12px',marginBottom:12}}>
              <p style={{fontSize:12,fontWeight:500,color:'#d97706',margin:'0 0 6px'}}>
                {"Completez votre profil pour continuer"}
              </p>
              <PhoneInput value={clientPhone} onChange={setCP}
                label="Telephone *" required
                theme={{ text: th.text, muted: th.muted, dim: th.dim,
                  border: th.border, inputBg: th.inputBg, inputBorder: th.inputBorder }}/>
            </div>
          )}

          {/* Note + compteur caracteres (limite 250) */}
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:4}}>
            <label style={{fontSize:12,fontWeight:500,color:th.muted}}>
              {"Note (optionnelle)"}
            </label>
            <span style={{fontSize:10,color:th.dim,
              fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace'}}>
              {`${notes?.length || 0}/${NOTES_MAX}`}
            </span>
          </div>
          <textarea value={notes}
            onChange={e=>setNotes(e.target.value.slice(0, NOTES_MAX))}
            rows={2} maxLength={NOTES_MAX}
            placeholder="Demandes particulieres..."
            style={{width:'100%',padding:'10px 12px',borderRadius:10,outline:'none',
              background:th.inputBg,border:`0.5px solid ${th.inputBorder}`,
              color:th.text,fontSize:13,resize:'none',lineHeight:1.4,
              fontFamily:'inherit'}}/>

          {(() => {
            const phoneOk = isValidPhoneNumber(clientPhone || '');
            return (
              <button onClick={async ()=>{
                if (!phoneOk) { setPhoneErr('Numero invalide pour le pays selectionne.'); return; }
                if (clientUser && !clientUser.phone) {
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
                style={{width:'100%',marginTop:12,padding:'13px',borderRadius:12,
                  background: phoneOk ? th.accent : th.border,
                  border:'none',fontWeight:500,fontSize:14,
                  color: phoneOk ? th.accentText : th.muted,
                  cursor: phoneOk ? 'pointer' : 'not-allowed',
                  opacity: phoneOk ? 1 : 0.5,
                  letterSpacing:'-0.01em'}}>
                {phoneOk ? 'Continuer' : 'Telephone requis'}
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
