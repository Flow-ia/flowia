// src/pages/booking/my-appointments/tabs/ProfileTab.jsx
// Onglet "Mon profil" : affichage + mode édition + sécurité (email/mdp) + suppression.
import { ymd } from '../helpers';
import { PhoneInput } from '../../../../components/PhoneInput';

export function ProfileTab({
  th,
  inpStyle,
  clientInfo,
  editing,
  editFirst, setEditFirst,
  editLast, setEditLast,
  editPhone, setEditPhone,
  editBirth, setEditBirth,
  editPostal, setEditPostal,
  editCity, setEditCity,
  editOptIn, setEditOptIn,
  profLoad,
  profErr,
  profOk,
  onStartEdit,
  onCancelEdit,
  onSaveProfile,
  onOpenEmailModal,
  onOpenPwdModal,
  onOpenDeleteModal,
  onLogout,
  onBack,
  slug,
}) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, animation:'fadeIn .2s ease' }}>

      {/* Card infos */}
      <div style={{ background:th.card, border: `0.5px solid ${th.border}`, borderRadius:16, overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom: `0.5px solid ${th.border}`,
          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <p style={{ fontWeight: 500, fontSize:15, color:th.text, margin:0 }}>Mes informations</p>
          {!editing && (
            <button onClick={onStartEdit}
              style={{ padding:'7px 14px', borderRadius:9,
                background:th.cardAlt, border: `0.5px solid ${th.border}`,
                color:th.text, fontWeight: 500, fontSize:12, cursor:'pointer',
                display:'flex', alignItems:'center', gap:6 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{width:13,height:13}}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Modifier
            </button>
          )}
        </div>

        {editing ? (
          /* ── Mode édition ── */
          <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight: 500,
                  color:th.muted, marginBottom:6 }}>
                  Prénom *
                </label>
                <input value={editFirst} onChange={e=>setEditFirst(e.target.value)}
                  placeholder="Prénom" style={inpStyle}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight: 500,
                  color:th.muted, marginBottom:6 }}>
                  Nom *
                </label>
                <input value={editLast} onChange={e=>setEditLast(e.target.value)}
                  placeholder="Nom" style={inpStyle}/>
              </div>
            </div>
            {/* RGPD commit 20 : PhoneInput E.164 + validation libphonenumber-js. */}
            <PhoneInput value={editPhone} onChange={setEditPhone}
              label="Téléphone *" required
              theme={{ text: th.text, muted: th.muted, dim: th.dim,
                border: th.border, inputBg: th.inputBg, inputBorder: th.inputBorder }}/>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight: 500,
                color:th.muted, marginBottom:6 }}>
                Date de naissance
              </label>
              <input type="date" value={editBirth} onChange={e=>setEditBirth(e.target.value)}
                max={new Date().toISOString().slice(0,10)}
                style={inpStyle}/>
              <p style={{ fontSize:11, color:th.muted, margin:'6px 0 0', lineHeight:1.5,
                background:'rgba(236,72,153,0.08)', border: '0.5px solid rgba(236,72,153,0.2)',
                padding:'8px 10px', borderRadius:8 }}>
                🎂 Cette information permet de bénéficier d'offres et de réductions
                spéciales anniversaire proposées par le commerçant (envoyées le jour J,
                selon les conditions de chaque commerce).
              </p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight: 500,
                  color:th.muted, marginBottom:6 }}>
                  Code postal
                </label>
                <input type="text" value={editPostal}
                  onChange={e=>setEditPostal(e.target.value.replace(/[^\d\s-]/g,'').slice(0,10))}
                  placeholder="75001" inputMode="numeric" style={inpStyle}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight: 500,
                  color:th.muted, marginBottom:6 }}>
                  Ville
                </label>
                <input type="text" value={editCity} onChange={e=>setEditCity(e.target.value.slice(0,120))}
                  placeholder="Paris" style={inpStyle}/>
              </div>
            </div>
            <p style={{ fontSize:11, color:th.muted, margin:0, lineHeight:1.5 }}>
              Pour modifier votre email, utilisez le bouton «&nbsp;Changer mon email&nbsp;»
              dans la vue principale : un code sera envoyé à votre adresse actuelle.
            </p>
            {/* Audit Z : toggle opt-in marketing */}
            <label style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px',
              borderRadius:10, background:'rgba(16,185,129,0.05)',
              border: '0.5px solid rgba(16,185,129,0.2)', cursor:'pointer', marginTop:4 }}>
              <input type="checkbox" checked={editOptIn}
                onChange={e=>setEditOptIn(e.target.checked)}
                style={{ marginTop:2, flexShrink:0, accentColor:'#10b981', cursor:'pointer' }}/>
              <span style={{ fontSize:12, color:th.text, lineHeight:1.5 }}>
                <strong style={{ color:'#10b981' }}>Offres commerciales</strong>
                <span style={{ display:'block', fontSize:11, color:th.muted, marginTop:2 }}>
                  Recevoir les promos et nouveautés par SMS/email. Décocher à tout moment.
                </span>
              </span>
            </label>
            {profErr && (
              <p style={{ fontSize:12, color:'#ef4444', fontWeight: 500, margin:0 }}>{profErr}</p>
            )}
            <div style={{ display:'flex', gap:10, marginTop:4 }}>
              <button onClick={onCancelEdit}
                style={{ flex:1, padding:'12px', borderRadius:10, cursor:'pointer',
                  background:th.cardAlt, border: `0.5px solid ${th.border}`,
                  color:th.muted, fontWeight: 500, fontSize:13 }}>
                Annuler
              </button>
              <button onClick={onSaveProfile} disabled={profLoad}
                style={{ flex:2, padding:'12px', borderRadius:10, cursor:'pointer',
                  background:th.accent, border:'none',
                  color:th.accentText, fontWeight: 500, fontSize:13,
                  opacity:profLoad?0.7:1 }}>
                {profLoad ? '...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Mode affichage ── */
          <div>
            {profOk && (
              <div style={{ margin:'12px 20px 0', padding:'10px 14px', borderRadius:9,
                background:'rgba(34,197,94,0.08)', border: '0.5px solid rgba(34,197,94,0.2)',
                color:'#16a34a', fontSize:13, fontWeight: 500 }}>
                ✓ {profOk}
              </div>
            )}
            {(() => {
              const birthStr = (() => {
                const s = ymd(clientInfo?.birth_date);
                if (!s) return '-';
                try {
                  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR',
                    { day: 'numeric', month: 'long', year: 'numeric' });
                } catch { return s; }
              })();
              const cityLine = [clientInfo?.postal_code, clientInfo?.city].filter(Boolean).join(' ') || '-';
              return [
                ['Prenom',      clientInfo?.first_name || '-'],
                ['Nom',         clientInfo?.last_name  || '-'],
                ['Email',       clientInfo?.email      || '-'],
                ['Télephone',   clientInfo?.phone      || '-'],
                ['Anniversaire',birthStr],
                ['Ville',       cityLine],
              ];
            })().map(([lbl, val], i) => (
              <div key={lbl} style={{ display:'flex', justifyContent:'space-between',
                alignItems:'center', padding:'13px 20px',
                borderTop: i===0 ? `1px solid ${th.border}` : 'none',
                borderBottom: `0.5px solid ${th.border}` }}>
                <span style={{ fontSize:12, color:th.muted, fontWeight: 500,
                  letterSpacing:'0.04em' }}>{lbl}</span>
                <span style={{ fontSize:13, fontWeight: 500, color:th.text }}>{val}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sécurité : email + mot de passe (vérification par code OTP) */}
      <div style={{ background:th.card, border: `0.5px solid ${th.border}`, borderRadius:16, overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom: `0.5px solid ${th.border}` }}>
          <p style={{ fontWeight: 500, fontSize:15, color:th.text, margin:0 }}>Sécurité</p>
          <p style={{ fontSize:12, color:th.muted, margin:'4px 0 0' }}>
            Un code à 6 chiffres vous sera envoyé par email pour confirmer chaque changement.
          </p>
        </div>
        <button onClick={onOpenEmailModal} style={{ width:'100%', padding:'14px 20px',
          background:'none', border:'none', borderBottom: `0.5px solid ${th.border}`,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          cursor:'pointer', color:th.text, fontWeight: 500, fontSize:13 }}>
          <span style={{ display:'flex', alignItems:'center', gap:10 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{width:15,height:15,color:th.muted}}>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Changer mon email
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{width:14,height:14,color:th.muted}}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        <button onClick={onOpenPwdModal} style={{ width:'100%', padding:'14px 20px',
          background:'none', border:'none',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          cursor:'pointer', color:th.text, fontWeight: 500, fontSize:13 }}>
          <span style={{ display:'flex', alignItems:'center', gap:10 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{width:15,height:15,color:th.muted}}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Changer mon mot de passe
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            style={{width:14,height:14,color:th.muted}}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      {/* Déconnexion */}
      <button onClick={() => {
        if (onLogout) onLogout();
        else {
          localStorage.removeItem('ff_client_token');
          localStorage.removeItem('ff_client_info');
          onBack();
        }
      }} style={{ width:'100%', padding:'13px', borderRadius:12, cursor:'pointer',
        background:'rgba(248,113,113,0.06)', border: '0.5px solid rgba(248,113,113,0.2)',
        color:'#ef4444', fontWeight: 500, fontSize:13 }}>
        Se déconnecter
      </button>

      {/* Supprimer mon compte (RGPD) */}
      <button onClick={onOpenDeleteModal}
        style={{ width:'100%', padding:'13px', borderRadius:12, cursor:'pointer',
          background:'transparent', border: `0.5px solid ${th.border}`,
          color:th.muted, fontWeight: 500, fontSize:13,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{width:14,height:14}}>
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        Supprimer mon compte
      </button>
    </div>
  );
}
