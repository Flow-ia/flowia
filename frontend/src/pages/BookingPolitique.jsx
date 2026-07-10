// src/pages/BookingPolitique.jsx
// Conditions du salon — accessible sur /book/:slug/politique
// (alias /book/:slug/conditions). Refonte commit 17 (RGPD) : sticky
// sub-tabs + 7 sections (CGU, confidentialité, fidélité, anniv,
// parrainage, annulation, suppression). Bandeau warning ambre en tête
// (à retirer après validation juridique).
import { useEffect, useRef, useState } from 'react';
import { pubApi } from '../utils/api';

const LIGHT = {
  bg:'#f7f7f7', card:'#ffffff', text:'#1a1a1a', muted:'#6b7280',
  dim:'#9ca3af', border:'#e5e7eb', navBg:'#ffffff', navBorder:'#e5e7eb',
  accent:'#1a1a1a', tabBg:'#f3f4f6', tabActive:'#ffffff',
};
const DARK = {
  bg:'#0f0f0f', card:'#1a1a1a', text:'#f5f5f5', muted:'#9ca3af',
  dim:'#6b7280', border:'#2a2a2a', navBg:'#1a1a1a', navBorder:'#2a2a2a',
  accent:'#f5f5f5', tabBg:'#1a1a1a', tabActive:'#262626',
};

// Sections — id sert d'ancre (#parrainage, etc.), title pour la sticky tab.
const SECTIONS_DEF = [
  { id: 'cgu',                 tab: 'CGU',              title: "Conditions générales d'utilisation" },
  { id: 'confidentialite',     tab: 'Confidentialité',  title: 'Politique de confidentialité' },
  { id: 'fidelite',            tab: 'Fidélité',         title: 'Programme de fidélité' },
  { id: 'anniversaire',        tab: 'Anniversaire',     title: 'Programme anniversaire' },
  { id: 'parrainage',          tab: 'Parrainage',       title: 'Programme de parrainage' },
  { id: 'annulation',          tab: 'Annulation',       title: "Politique d'annulation" },
  { id: 'suppression-donnees', tab: 'Suppression',      title: 'Suppression des données' },
];

export default function BookingPolitique({ slug }) {
  const [business, setBiz] = useState(null);
  const saved = localStorage.getItem('ff_booking_theme') || 'light';
  const th = saved === 'dark' ? DARK : LIGHT;

  const [activeId, setActiveId] = useState(SECTIONS_DEF[0].id);
  const sectionRefs = useRef({});
  const isClickScrolling = useRef(false);

  useEffect(() => {
    if (slug) {
      pubApi.getBusiness(slug)
        .then(r => setBiz(r.business))
        .catch(() => {});
    }
  }, [slug]);

  // Initial hash → scroll vers la section. Décalage offset 80 pour navbar+tabs.
  useEffect(() => {
    const hash = (window.location.hash || '').replace('#', '');
    if (hash && SECTIONS_DEF.find(s => s.id === hash)) {
      setTimeout(() => scrollToSection(hash, false), 50);
    }
  }, []);

  // Scroll-spy : détecte la section visible et met à jour activeId.
  useEffect(() => {
    const onScroll = () => {
      if (isClickScrolling.current) return;
      const offset = 140; // navbar 60 + sticky tabs ~60 + marge 20
      let current = SECTIONS_DEF[0].id;
      for (const s of SECTIONS_DEF) {
        const el = sectionRefs.current[s.id];
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - offset <= 0) current = s.id;
      }
      setActiveId(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToSection = (id, updateHash = true) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    isClickScrolling.current = true;
    setActiveId(id);
    const top = el.getBoundingClientRect().top + window.pageYOffset - 130;
    window.scrollTo({ top, behavior: 'smooth' });
    if (updateHash) {
      try { window.history.replaceState(null, '', `#${id}`); } catch {}
    }
    setTimeout(() => { isClickScrolling.current = false; }, 600);
  };

  const name = business?.business_name || 'ce prestataire';
  const phone = business?.phone;
  const address = business?.address;

  return (
    <div style={{ minHeight:'100vh', background:th.bg,
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
      <style>{`* { box-sizing:border-box }`}</style>

      {/* Navbar */}
      <nav style={{ position:'sticky', top:0, zIndex:60, background:th.navBg,
        borderBottom: `0.5px solid ${th.navBorder}` }}>
        <div style={{ maxWidth:760, margin:'0 auto', padding:'0 24px', height:60,
          display:'flex', alignItems:'center', gap:16 }}>
          <a href={`/book/${slug}`}
            style={{ display:'flex', alignItems:'center', gap:6, fontSize:13,
              fontWeight: 500, color:th.muted, textDecoration:'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{width:16,height:16}}><polyline points="15 18 9 12 15 6"/></svg>
            {"Retour à la réservation"}
          </a>
        </div>
      </nav>

      {/* Sticky sub-tabs */}
      <div style={{ position:'sticky', top:60, zIndex:55, background:th.bg,
        borderBottom: `0.5px solid ${th.border}` }}>
        <div style={{ maxWidth:760, margin:'0 auto', padding:'10px 16px',
          display:'flex', gap:6, overflowX:'auto', whiteSpace:'nowrap',
          scrollbarWidth:'thin' }}>
          {SECTIONS_DEF.map(s => (
            <button key={s.id} onClick={() => scrollToSection(s.id)}
              style={{ flexShrink:0, padding:'7px 12px', borderRadius:10,
                background: activeId === s.id ? th.tabActive : 'transparent',
                border: `0.5px solid ${activeId === s.id ? th.border : 'transparent'}`,
                color: activeId === s.id ? th.text : th.muted,
                fontSize:12, fontWeight:500, cursor:'pointer',
                fontFamily:'inherit', letterSpacing:'-0.005em' }}>
              {s.tab}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div style={{ maxWidth:720, margin:'0 auto', padding:'24px 24px 80px' }}>

        {/* Bandeau warning juridique (à retirer après validation avocat) */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:10,
          padding:'12px 14px', background:'#fffbeb',
          border:'0.5px solid #fde68a', borderRadius:10,
          marginBottom:24 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ width:18, height:18, flexShrink:0, marginTop:1 }}>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p style={{ margin:0, fontSize:12, color:'#92400e', lineHeight:1.5 }}>
            {"Document indicatif — à faire valider par un avocat avant utilisation en production."}
          </p>
        </div>

        {/* En-tête */}
        <div style={{ marginBottom:32 }}>
          <h1 style={{ fontSize:22, fontWeight:500, color:th.text,
            margin:'0 0 8px', letterSpacing:'-0.02em' }}>
            Conditions du salon
          </h1>
          {business && (
            <p style={{ fontSize:13, color:th.muted, margin:'0 0 4px' }}>
              {name}
              {address && ` · ${address}`}
            </p>
          )}
          <p style={{ fontSize:12, color:th.dim, margin:0 }}>
            {"Dernière mise à jour : "}
            {new Date().toLocaleDateString('fr-FR', { month:'long', year:'numeric' })}
          </p>
        </div>

        {/* Sections */}
        <div style={{ display:'flex', flexDirection:'column', gap:32 }}>

          {/* CGU */}
          <Section refSet={el => (sectionRefs.current['cgu'] = el)} id="cgu" th={th} title={SECTIONS_DEF[0].title}>
            <P th={th}>{"Le présent service permet la prise de rendez-vous en ligne auprès de " + name + " (le " + '"' + "salon" + '"' + "). Toute utilisation implique l'acceptation pleine et entière des présentes conditions."}</P>
            <H3 th={th}>{"Création du compte"}</H3>
            <P th={th}>{"Le client peut créer un compte avec son adresse email et un mot de passe, ou se connecter via Google. Le compte est strictement personnel ; le client s'engage à fournir des informations exactes (nom, prénom, email, téléphone) et à les maintenir à jour depuis son profil."}</P>
            <H3 th={th}>{"Obligations du client"}</H3>
            <P th={th}>{"Le client s'engage à respecter les horaires de rendez-vous pris, à se présenter à l'heure convenue et à informer le salon de toute annulation conformément à la politique d'annulation. Toute utilisation frauduleuse du service (multiples comptes pour contourner les programmes de fidélité ou de parrainage, fausses identités) entraîne la résiliation du compte."}</P>
            <H3 th={th}>{"Responsabilités du salon"}</H3>
            <P th={th}>{"Le salon s'engage à honorer les rendez-vous confirmés et à proposer un rendez-vous de remplacement en cas d'empêchement de sa part. Le salon ne peut être tenu pour responsable des indisponibilités liées à des cas de force majeure."}</P>
            <H3 th={th}>{"Modification des CGU"}</H3>
            <P th={th}>{"Les présentes conditions peuvent être modifiées à tout moment. En cas de modification substantielle, le client en sera informé par email et invité à les accepter à nouveau lors de sa prochaine connexion."}</P>
          </Section>

          {/* Politique de confidentialité */}
          <Section refSet={el => (sectionRefs.current['confidentialite'] = el)} id="confidentialite" th={th} title={SECTIONS_DEF[1].title}>
            <H3 th={th}>{"Responsable du traitement"}</H3>
            <P th={th}>{name + (address ? " (" + address + ")" : "") + (phone ? " — téléphone " + phone : "") + "."}</P>
            <H3 th={th}>{"Données collectées"}</H3>
            <P th={th}>{"Nom, prénom, email, téléphone, date de naissance (facultative), adresse postale (facultative)."}</P>
            <H3 th={th}>{"Finalités du traitement"}</H3>
            <P th={th}>{"Gestion des réservations et des rendez-vous (base contractuelle), programme de fidélité (base contractuelle), envois marketing — offres anniversaire, parrainage, notifications fidélité — uniquement si le client a coché la case d'opt-in à l'inscription (base : consentement libre et révocable), statistiques anonymisées du salon."}</P>
            <H3 th={th}>{"Durée de conservation"}</H3>
            <P th={th}>{"3 ans à compter de la dernière visite. Au-delà, les données personnelles (email, nom, prénom) sont anonymisées, tandis que l'historique des transactions est conservé sous forme anonyme pour les obligations comptables et fiscales."}</P>
            <H3 th={th}>{"Destinataires"}</H3>
            <P th={th}>{"Les données sont transmises uniquement aux prestataires nécessaires au fonctionnement du service : envoi des emails et notifications, paiement en ligne, hébergement des images. Chacun est encadré par un contrat conforme au RGPD. Aucune donnée n'est revendue ni transmise à des tiers à des fins commerciales."}</P>
            <H3 th={th}>{"Droits du client"}</H3>
            <P th={th}>{"Conformément au RGPD, le client dispose d'un droit d'accès, de rectification, d'effacement, de portabilité, d'opposition et de réclamation auprès de la CNIL. Ces droits peuvent être exercés directement depuis l'espace client, ou par contact direct avec le salon."}</P>
          </Section>

          {/* Fidélité */}
          <Section refSet={el => (sectionRefs.current['fidelite'] = el)} id="fidelite" th={th} title={SECTIONS_DEF[2].title}>
            <H3 th={th}>{"Règles du programme"}</H3>
            <P th={th}>{"À chaque visite encaissée à partir d'un montant minimum défini par le salon, le client cumule un tampon (ou un nombre de points selon le mode choisi). Une récompense est obtenue lorsque le seuil de tampons (ou de points) est atteint. La validité de la récompense est précisée à son obtention."}</P>
            <H3 th={th}>{"Consultation du solde"}</H3>
            <P th={th}>{"Le solde de fidélité est consultable en caisse à chaque visite. Si le client a accepté les notifications marketing à son inscription, il reçoit également des emails de rappel et le détail de son solde."}</P>
            <H3 th={th}>{"Conditions d'utilisation"}</H3>
            <P th={th}>{"La récompense de fidélité est applicable uniquement en boutique, sur présentation du compte client. Elle n'est pas cumulable avec d'autres promotions, sauf mention contraire. Une période d'inactivité supérieure à 12 mois entraîne la perte automatique du solde de tampons en cours."}</P>
            <H3 th={th}>{"Programme de base sans opt-in marketing"}</H3>
            <P th={th}>{"Le cumul de tampons et l'obtention de récompenses fonctionnent pour tous les clients, qu'ils aient ou non accepté les notifications marketing. Sans opt-in, le client ne reçoit simplement aucun email automatique : il consulte son solde directement en caisse."}</P>
          </Section>

          {/* Anniversaire */}
          <Section refSet={el => (sectionRefs.current['anniversaire'] = el)} id="anniversaire" th={th} title={SECTIONS_DEF[3].title}>
            <P th={th}>{"Le salon offre à chaque client ayant renseigné sa date de naissance ET ayant accepté les notifications marketing à son inscription un code promotionnel personnel le jour de son anniversaire."}</P>
            <H3 th={th}>{"Modalités"}</H3>
            <P th={th}>{"Le code est envoyé automatiquement par email (et SMS si configuré) le jour J. Il offre une remise de -20 % sur la prochaine prestation et reste valable 30 jours à compter de sa génération."}</P>
            <H3 th={th}>{"Limite"}</H3>
            <P th={th}>{"Le code anniversaire est attribué une seule fois par an et par client, y compris en cas de modification de la date de naissance dans le profil."}</P>
            <H3 th={th}>{"Sans opt-in marketing"}</H3>
            <P th={th}>{"Si le client n'a pas coché la case d'opt-in marketing à son inscription, aucun code anniversaire ne lui est envoyé. Cette règle est conforme au RGPD : un envoi marketing automatique nécessite un consentement explicite préalable."}</P>
          </Section>

          {/* Parrainage */}
          <Section refSet={el => (sectionRefs.current['parrainage'] = el)} id="parrainage" th={th} title={SECTIONS_DEF[4].title}>
            <H3 th={th}>{"Conditions d'éligibilité"}</H3>
            <P th={th}>{"Pour accéder au programme de parrainage, le parrain ET le filleul doivent avoir un compte client et avoir accepté les notifications marketing à leur inscription. Le code de parrainage est généré automatiquement dans l'espace client du parrain."}</P>
            <H3 th={th}>{"Récompenses"}</H3>
            <P th={th}>{"À la première visite validée du filleul, le parrain et le filleul reçoivent chacun un code promotionnel de -10 % utilisable en boutique. Les codes sont valables 60 jours."}</P>
            <H3 th={th}>{"Limites anti-abus"}</H3>
            <P th={th}>{"Maximum 10 filleuls par an et par parrain. Une seule récompense par couple parrain-filleul (un filleul ne peut pas être parrainé par plusieurs personnes). La création de plusieurs comptes à partir d'une même adresse email pour contourner cette limite n'ouvre droit à aucune récompense."}</P>
            <H3 th={th}>{"Validation"}</H3>
            <P th={th}>{"La validation du parrainage est effectuée par le salon après la 1re visite du filleul. Sans cette validation manuelle, aucune récompense n'est émise. Le salon se réserve le droit de refuser un parrainage en cas de fraude suspectée."}</P>
            <H3 th={th}>{"Sans opt-in marketing"}</H3>
            <P th={th}>{"Si l'un des deux participants (parrain ou filleul) n'a pas accepté les notifications marketing à son inscription, aucune récompense n'est émise. Cette règle est conforme au RGPD : l'envoi du code par email nécessite un consentement explicite des deux participants."}</P>
          </Section>

          {/* Annulation */}
          <Section refSet={el => (sectionRefs.current['annulation'] = el)} id="annulation" th={th} title={SECTIONS_DEF[5].title}>
            <P th={th}>{"L'annulation d'un rendez-vous est possible jusqu'à 2 heures avant l'heure prévue, directement depuis l'espace client (rubrique « Mes RDV ») ou en contactant le salon par téléphone."}</P>
            <H3 th={th}>{"Annulation tardive"}</H3>
            <P th={th}>{"Au-delà du délai des 2 heures, l'annulation reste possible mais peut entraîner le retrait du tampon de fidélité associé à la visite manquée."}</P>
            <H3 th={th}>{"Absences répétées"}</H3>
            <P th={th}>{"En cas d'absence non signalée à 2 reprises ou plus, le compte client peut être bloqué automatiquement de la réservation en ligne. Le déblocage s'effectue sur demande directe auprès du salon."}</P>
          </Section>

          {/* Suppression données */}
          <Section refSet={el => (sectionRefs.current['suppression-donnees'] = el)} id="suppression-donnees" th={th} title={SECTIONS_DEF[6].title}>
            <H3 th={th}>{"Demande de suppression"}</H3>
            <P th={th}>{"La suppression du compte est accessible depuis l'espace client : « Mon profil » > « Supprimer mon compte ». Une confirmation est demandée pour éviter toute suppression accidentelle."}</P>
            <H3 th={th}>{"Procédure"}</H3>
            <P th={th}>{"À la demande, le compte est désactivé pendant 30 jours (réversible sur simple demande au salon). Au terme de cette période, les données personnelles (email, nom, prénom, téléphone) sont définitivement anonymisées. L'historique des transactions est conservé sous forme anonyme pour les obligations comptables et fiscales."}</P>
            <H3 th={th}>{"Export des données"}</H3>
            <P th={th}>{"Avant toute demande de suppression, le client peut exporter l'intégralité de ses données depuis son espace client (« Exporter mes données »). Cet export comprend l'identité, l'historique des rendez-vous, les transactions, et les codes promotionnels obtenus."}</P>
            <H3 th={th}>{"Conformité RGPD"}</H3>
            <P th={th}>{"L'anonymisation garantit le respect du droit à l'effacement (article 17 du RGPD) tout en respectant les obligations comptables (article L123-22 du Code de commerce) qui imposent la conservation des écritures comptables pendant 10 ans."}</P>
          </Section>

        </div>

        {/* CTA retour */}
        <div style={{ marginTop:48, textAlign:'center' }}>
          <a href={`/book/${slug}`}
            style={{ display:'inline-flex', alignItems:'center', gap:8,
              padding:'13px 28px', borderRadius:12, background:th.accent,
              color: saved==='dark' ? '#000' : '#fff',
              fontWeight: 500, fontSize:14, textDecoration:'none' }}>
            {"Réserver un rendez-vous →"}
          </a>
        </div>
      </div>
    </div>
  );
}

// Composants prose réutilisés.
function Section({ id, refSet, th, title, children }) {
  return (
    <section id={id} ref={refSet} style={{ scrollMarginTop:140 }}>
      <h2 style={{ fontSize:16, fontWeight:500, color:th.text,
        margin:'0 0 14px', letterSpacing:'-0.01em' }}>
        {title}
      </h2>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {children}
      </div>
    </section>
  );
}

function H3({ th, children }) {
  return (
    <h3 style={{ margin:'8px 0 0', fontSize:13, fontWeight:500,
      color:th.text, letterSpacing:'-0.005em' }}>{children}</h3>
  );
}

function P({ th, children }) {
  return (
    <p style={{ margin:0, fontSize:13, color:th.muted,
      lineHeight:1.7 }}>{children}</p>
  );
}
