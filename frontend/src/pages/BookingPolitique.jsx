// src/pages/BookingPolitique.jsx
// Page "Politique de réservation" accessible sur /book/:slug/politique
import { useState, useEffect } from 'react';
import { pubApi } from '../utils/api';

const LIGHT = {
  bg:'#f7f7f7', card:'#ffffff', text:'#1a1a1a', muted:'#6b7280',
  dim:'#9ca3af', border:'#e5e7eb', navBg:'#ffffff', navBorder:'#e5e7eb',
  accent:'#1a1a1a',
};
const DARK = {
  bg:'#0f0f0f', card:'#1a1a1a', text:'#f5f5f5', muted:'#9ca3af',
  dim:'#6b7280', border:'#2a2a2a', navBg:'#1a1a1a', navBorder:'#2a2a2a',
  accent:'#f5f5f5',
};

export default function BookingPolitique({ slug }) {
  const [business, setBiz] = useState(null);
  const saved = localStorage.getItem('ff_booking_theme') || 'light';
  const th = saved === 'dark' ? DARK : LIGHT;

  useEffect(() => {
    if (slug) {
      pubApi.getBusiness(slug)
        .then(r => setBiz(r.business))
        .catch(() => {});
    }
  }, [slug]);

  const name = business?.business_name || 'ce prestataire';
  const phone = business?.phone;
  const address = business?.address;

  const SECTIONS = [
    {
      icon: '📋',
      title: 'Prise de rendez-vous',
      content: `La reservation en ligne est disponible 24h/24 et 7j/7. Vous pouvez reserver un creneau directement sur cette page en choisissant la prestation souhaitee, le membre de l'equipe de votre choix (ou le premier disponible), la date et l'heure.\n\nUne confirmation vous sera envoyee par email si vous avez renseigne votre adresse email lors de la reservation. En cas de non-reception, verifiez vos spams.`,
    },
    {
      icon: '⏰',
      title: 'Délais de reservation',
      content: `Les reservations sont possibles jusqu'a ${business?.min_notice_hours || 1}h avant l'heure du rendez-vous. Passe ce delai, nous vous invitons a nous contacter directement par telephone pour verifier nos disponibilites.`,
    },
    {
      icon: '❌',
      title: 'Annulation et modification',
      content: `Vous pouvez annuler ou modifier votre rendez-vous jusqu'a 2 heures avant l'heure prevue, directement depuis votre espace client ou en nous contactant par telephone.\n\nPour toute annulation tardive ou absence non signalee, nous nous reservons le droit de refuser de futures reservations en ligne.`,
    },
    {
      icon: '🕐',
      title: 'Ponctualite',
      content: `Nous vous remercions d'arriver a l'heure a votre rendez-vous. Un retard de plus de 10 minutes peut entraîner la reduction ou l'annulation de la prestation afin de respecter les rendez-vous suivants.\n\nEn cas de retard previsible, contactez-nous des que possible.`,
    },
    {
      icon: '👶',
      title: 'Clients mineurs',
      content: `Les clients mineurs doivent etre accompagnes d'un responsable legal lors de leur premier rendez-vous. Toute prestation effectuee sur un mineur necessite l'accord tacite du responsable legal.`,
    },
    {
      icon: '💰',
      title: 'Tarifs et paiement',
      content: `Les tarifs affiches sur cette page sont donnes a titre indicatif. Le tarif definitif peut varier selon la longueur des cheveux, la quantite de produit utilisee ou la complexite de la prestation.\n\nLe paiement s'effectue directement en salon, en especes ou par carte bancaire.`,
    },
    {
      icon: '🔒',
      title: 'Donnees personnelles',
      content: `Les informations que vous renseignez lors de votre reservation (nom, email, telephone) sont utilisees exclusivement pour la gestion de vos rendez-vous et ne sont jamais transmises a des tiers.\n\nConformement au RGPD, vous disposez d'un droit d'acces, de rectification et de suppression de vos donnees. Pour exercer ces droits, contactez-nous directement.`,
    },
    {
      icon: '📞',
      title: 'Contact',
      content: `Pour toute question relative a votre reservation, n'hesitez pas a nous contacter${phone ? ` au ${phone}` : ' directement'}${address ? ` ou en nous rendant visite au ${address}` : ''}.`,
    },
  ];

  return (
    <div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <style>{`* { box-sizing:border-box }`}</style>

      {/* Navbar */}
      <nav style={{ position:'sticky', top:0, zIndex:50, background:th.navBg,
        borderBottom:`1px solid ${th.navBorder}`,
        boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ maxWidth:760, margin:'0 auto', padding:'0 24px', height:60,
          display:'flex', alignItems:'center', gap:16 }}>
          <a href={`/book/${slug}`}
            style={{ display:'flex', alignItems:'center', gap:6, fontSize:13,
              fontWeight:600, color:th.muted, textDecoration:'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{width:16,height:16}}><polyline points="15 18 9 12 15 6"/></svg>
            Retour
          </a>
          <span style={{ fontSize:15, fontWeight:700, color:th.text, letterSpacing:'-0.01em' }}>
            Politique de réservation
            {business && ` - ${name}`}
          </span>
        </div>
      </nav>

      {/* Contenu */}
      <div style={{ maxWidth:760, margin:'0 auto', padding:'40px 24px 80px' }}>

        {/* En-tête */}
        <div style={{ marginBottom:40 }}>
          <h1 style={{ fontSize:28, fontWeight:900, color:th.text,
            margin:'0 0 12px', letterSpacing:'-0.03em' }}>
            Politique de réservation
          </h1>
          {business && (
            <p style={{ fontSize:14, color:th.muted, margin:'0 0 6px' }}>
              {name}
              {address && ` · ${address}`}
            </p>
          )}
          <p style={{ fontSize:13, color:th.dim, margin:0 }}>
            Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { month:'long', year:'numeric' })}
          </p>
        </div>

        {/* Sections */}
        <div style={{ display:'flex', flexDirection:'column', gap:0,
          border:`1px solid ${th.border}`, borderRadius:16, overflow:'hidden',
          background:th.card }}>
          {SECTIONS.map((s, i) => (
            <SectionItem key={s.title} section={s} th={th}
              isLast={i===SECTIONS.length-1} />
          ))}
        </div>

        {/* CTA retour réservation */}
        <div style={{ marginTop:32, textAlign:'center' }}>
          <a href={`/book/${slug}`}
            style={{ display:'inline-flex', alignItems:'center', gap:8,
              padding:'13px 28px', borderRadius:12, background:th.accent,
              color: saved==='dark' ? '#000' : '#fff',
              fontWeight:800, fontSize:14, textDecoration:'none',
              boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
            Réserver un rendez-vous →
          </a>
        </div>
      </div>
    </div>
  );
}

function SectionItem({ section, th, isLast }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: isLast ? 'none' : `1px solid ${th.border}` }}>
      <button onClick={() => setOpen(p => !p)}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:14,
          padding:'18px 24px', background:'none', border:'none', cursor:'pointer',
          textAlign:'left' }}>
        <span style={{ fontSize:20, flexShrink:0 }}>{section.icon}</span>
        <span style={{ fontSize:15, fontWeight:700, color:th.text, flex:1 }}>
          {section.title}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ width:16, height:16, color:th.muted, flexShrink:0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition:'transform .2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ padding:'0 24px 20px 58px' }}>
          {section.content.split('\n\n').map((para, i) => (
            <p key={i} style={{ fontSize:14, color:th.muted, lineHeight:1.7,
              margin: i===0 ? 0 : '12px 0 0' }}>
              {para}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
