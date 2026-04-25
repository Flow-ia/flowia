// src/components/ConsentCheckboxes.jsx
// Consentement à l'inscription client public (RGPD commit 17).
// Case 1 OBLIGATOIRE : CGU + politique confidentialité + fidélité de base.
// Case 2 OPTIONNELLE : marketing (anniversaire + parrainage + notifications
// fidélité par email). Mise en valeur visuelle (bloc ambré FDS-2026), non
// cochée par défaut conformément à la CNIL.
//
// Props :
//   slug         — slug du commerçant, pour ouvrir /book/:slug/conditions
//   th           — thème booking (LIGHT/DARK objet partagé avec AuthPanel)
//   onChange({ contractAccepted, marketingAccepted })
//   defaultMarketing (default false) — JAMAIS true par défaut (CNIL strict)
//   compact (default false) — variante dense (utilisée pour quick-register QR)
import { useEffect, useState } from 'react';
import { Icon } from './Icon';

export function ConsentCheckboxes({ slug, th, onChange, defaultMarketing = false, compact = false }) {
  const [contractAccepted,  setContract]  = useState(true);
  const [marketingAccepted, setMarketing] = useState(!!defaultMarketing);

  useEffect(() => {
    onChange?.({ contractAccepted, marketingAccepted });
  }, [contractAccepted, marketingAccepted, onChange]);

  const conditionsHref = slug ? `/book/${slug}/conditions` : '#';
  const parrainageHref = slug ? `/book/${slug}/conditions#parrainage` : '#';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap: compact ? 8 : 10 }}>

      {/* ── CASE 1 : OBLIGATOIRE (cochée par défaut) ─────────────────────── */}
      <label style={{ display:'flex', alignItems:'flex-start', gap:8,
        padding: compact ? '10px 12px' : '11px 13px', borderRadius:9,
        background: th.inputBg, border: `0.5px solid ${th.inputBorder || th.border}`,
        cursor:'pointer' }}>
        <input type="checkbox" checked={contractAccepted}
          onChange={e => setContract(e.target.checked)}
          style={{ marginTop:2, flexShrink:0, accentColor:'#1a1a1a',
            cursor:'pointer', width:14, height:14 }}/>
        <span style={{ fontSize:11, color:th.muted, lineHeight:1.55 }}>
          {"J'accepte les conditions générales d'utilisation, la politique de confidentialité et les règles du programme fidélité du salon."}
          {' '}
          <a href={conditionsHref} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color:th.text, textDecoration:'underline', fontWeight:500 }}>
            {"Lire en détail"}
          </a>
        </span>
      </label>

      {/* ── CASE 2 : OPTIONNELLE (bloc ambré FDS-2026, non cochée) ─────── */}
      <div style={{ borderLeft:'3px solid #f59e0b',
        background:'#fffbeb', borderTop:'0.5px solid #fde68a',
        borderRight:'0.5px solid #fde68a', borderBottom:'0.5px solid #fde68a',
        borderRadius:10, padding: compact ? 14 : 16,
        display:'flex', flexDirection:'column', gap: compact ? 10 : 12 }}>

        {/* Badge */}
        <span style={{ fontSize:10, fontWeight:500, color:'#92400e',
          letterSpacing:'0.05em', textTransform:'uppercase' }}>
          {"Bénéfices supplémentaires"}
        </span>

        {/* Titre */}
        <p style={{ margin:0, fontSize:14, fontWeight:500, color:'#78350f',
          lineHeight:1.4 }}>
          {"Activez les avantages exclusifs"}
        </p>

        {/* Liste 3 items */}
        {!compact && (
          <ul style={{ margin:0, padding:0, listStyle:'none',
            display:'flex', flexDirection:'column', gap:8 }}>
            <BenefitRow icon="gift"
              text="Code promo personnel le jour de votre anniversaire (-20 %)"/>
            <BenefitRow icon="users"
              text="Programme parrainage : -10 % pour vous et votre filleul à chaque parrainage validé"/>
            <BenefitRow icon="bell"
              text="Notifications fidélité (vos tampons en temps réel par email)"/>
          </ul>
        )}

        {/* Checkbox + lien "Voir les détails" */}
        <label style={{ display:'flex', alignItems:'flex-start', gap:8,
          paddingTop: compact ? 4 : 6, borderTop: compact ? 'none' : '0.5px solid #fde68a',
          cursor:'pointer' }}>
          <input type="checkbox" checked={marketingAccepted}
            onChange={e => setMarketing(e.target.checked)}
            style={{ marginTop:2, flexShrink:0, accentColor:'#f59e0b',
              cursor:'pointer', width:14, height:14 }}/>
          <span style={{ fontSize:12, color:'#78350f', lineHeight:1.55 }}>
            {"J'accepte de recevoir les offres et notifications par email/SMS."}
            {' '}
            <a href={parrainageHref} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color:'#92400e', textDecoration:'underline', fontWeight:500 }}>
              {"Voir les détails"}
            </a>
          </span>
        </label>
      </div>
    </div>
  );
}

function BenefitRow({ icon, text }) {
  return (
    <li style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
      <span style={{ marginTop:1, flexShrink:0, color:'#b45309' }}>
        <Icon name={icon} size={16} color="#b45309"/>
      </span>
      <span style={{ fontSize:12, color:'#78350f', lineHeight:1.5 }}>
        {text}
      </span>
    </li>
  );
}

export default ConsentCheckboxes;
