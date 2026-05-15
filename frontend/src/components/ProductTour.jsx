import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Button } from './primitives';

// Visite guidee interactive declenchee apres FirstRunSetup pour les nouveaux
// comptes (user.tourCompleted === false). Tooltip flottant ancre sur les
// elements identifies par data-tour="nav-<id>", navigation auto entre les
// routes. Skip via "Passer la visite", marque tour_completed=TRUE en fin OU
// au skip. Re-declenchable depuis Reglages > Mon compte.

const STEPS = [
  {
    key: 'welcome',
    centered: true,
    title: 'Bienvenue sur FlowIA',
    body: "Faisons un tour rapide en 5 etapes pour vous montrer l'essentiel. Vous pourrez le relancer plus tard depuis Reglages.",
    cta: 'Demarrer la visite',
    route: null,
    anchor: null,
  },
  {
    key: 'agenda',
    title: 'Votre agenda',
    body: "Tous vos rendez-vous arrivent ici, par employe et par jour. Cliquez sur un creneau libre pour reserver, ou sur un RDV existant pour le modifier.",
    cta: 'Suivant',
    route: '/agenda',
    anchor: 'nav-agenda',
  },
  {
    key: 'caisse',
    title: 'Encaisser un client',
    body: "La caisse FlowIA accepte especes, CB locale, cheque et virement, plus le paiement en ligne via Stripe Connect quand active. Tout est traque pour la comptabilite.",
    cta: 'Suivant',
    route: '/caisse',
    anchor: 'nav-caisse',
  },
  {
    key: 'clients',
    title: 'Votre base clients',
    body: "Historique des RDV, anniversaires, programme de fidelite, parrainage : votre fichier client est central. Tous les nouveaux clients sont crees automatiquement a la 1ere reservation.",
    cta: 'Suivant',
    route: '/clients',
    anchor: 'nav-clients',
  },
  {
    key: 'final',
    centered: true,
    title: "C'est parti",
    body: "Pour aller plus loin : ouvrez Reglages pour configurer votre equipe, vos services, votre abonnement, et activer le PIN admin qui securisera l'acces. Bonne utilisation de FlowIA.",
    cta: 'Commencer',
    route: null,
    anchor: null,
  },
];

export function ProductTour() {
  const { theme: t } = useTheme();
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [closing, setClosing] = useState(false);
  const cur = STEPS[step];

  // Position du tooltip : recompute getBoundingClientRect quand le step
  // change (apres navigation eventuelle) ET au resize / scroll. Le delai
  // 150ms apres navigate() laisse le temps a la sidebar de re-rendre sur
  // la nouvelle route avant le measure.
  const measure = useCallback(() => {
    if (!cur.anchor) { setTargetRect(null); return; }
    const el = document.querySelector(`[data-tour="${cur.anchor}"]`);
    if (!el) { setTargetRect(null); return; }
    setTargetRect(el.getBoundingClientRect());
  }, [cur.anchor]);

  useEffect(() => {
    if (cur.route) navigate(cur.route);
    const id = setTimeout(measure, 150);
    return () => clearTimeout(id);
  }, [step, cur.route, measure, navigate]);

  useEffect(() => {
    if (!cur.anchor) return;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [cur.anchor, measure]);

  const finish = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await api.tourComplete();
      updateUser({ tourCompleted: true });
    } catch {
      // Best-effort : si l'API echoue, on ferme quand meme localement pour
      // ne pas bloquer le commercant. Au prochain login, /me re-lira l'etat
      // et le tour reapparaitra si toujours FALSE.
      updateUser({ tourCompleted: true });
    }
  };

  const skip = () => finish();
  const next = () => {
    if (step >= STEPS.length - 1) { finish(); return; }
    setStep(s => s + 1);
  };
  const prev = () => setStep(s => Math.max(0, s - 1));

  // Position du tooltip : ancre OU centre.
  const TOOLTIP_W = 340, TOOLTIP_H_EST = 200;
  let tooltipStyle = {
    position: 'fixed', zIndex: 9999,
    width: TOOLTIP_W, maxWidth: 'calc(100vw - 32px)',
    background: t.card, color: t.text,
    borderRadius: 14, padding: 20,
    border: `0.5px solid ${t.border}`,
    boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
    fontFamily: 'inherit',
  };
  let arrowStyle = null;

  if (cur.centered || !targetRect) {
    tooltipStyle = {
      ...tooltipStyle,
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  } else {
    // Place a droite si y'a la place, sinon en dessous, sinon au dessus.
    const r = targetRect;
    const vw = window.innerWidth, vh = window.innerHeight;
    const PAD = 14;
    const roomRight = vw - r.right;
    const roomBelow = vh - r.bottom;
    if (roomRight >= TOOLTIP_W + PAD + 16) {
      // A droite
      const top = Math.max(16, Math.min(vh - TOOLTIP_H_EST - 16,
                                         r.top + r.height / 2 - TOOLTIP_H_EST / 2));
      tooltipStyle.top  = top;
      tooltipStyle.left = r.right + PAD;
      arrowStyle = {
        position: 'fixed',
        top: r.top + r.height / 2 - 6,
        left: r.right + PAD - 6,
        width: 12, height: 12, transform: 'rotate(45deg)',
        background: t.card,
        borderLeft: `0.5px solid ${t.border}`,
        borderBottom: `0.5px solid ${t.border}`,
        zIndex: 9999,
      };
    } else if (roomBelow >= TOOLTIP_H_EST + PAD + 16) {
      // En dessous
      const left = Math.max(16, Math.min(vw - TOOLTIP_W - 16,
                                          r.left + r.width / 2 - TOOLTIP_W / 2));
      tooltipStyle.top  = r.bottom + PAD;
      tooltipStyle.left = left;
      arrowStyle = {
        position: 'fixed',
        top: r.bottom + PAD - 6,
        left: r.left + r.width / 2 - 6,
        width: 12, height: 12, transform: 'rotate(45deg)',
        background: t.card,
        borderLeft: `0.5px solid ${t.border}`,
        borderTop: `0.5px solid ${t.border}`,
        zIndex: 9999,
      };
    } else {
      // Au dessus
      const left = Math.max(16, Math.min(vw - TOOLTIP_W - 16,
                                          r.left + r.width / 2 - TOOLTIP_W / 2));
      tooltipStyle.top  = r.top - TOOLTIP_H_EST - PAD;
      tooltipStyle.left = left;
      arrowStyle = {
        position: 'fixed',
        top: r.top - PAD - 6,
        left: r.left + r.width / 2 - 6,
        width: 12, height: 12, transform: 'rotate(45deg)',
        background: t.card,
        borderRight: `0.5px solid ${t.border}`,
        borderBottom: `0.5px solid ${t.border}`,
        zIndex: 9999,
      };
    }
  }

  // Ring autour de la cible (highlight subtle, sans bloquer le clic).
  const ringStyle = targetRect ? {
    position: 'fixed', zIndex: 9998,
    top:    targetRect.top    - 4,
    left:   targetRect.left   - 4,
    width:  targetRect.width  + 8,
    height: targetRect.height + 8,
    borderRadius: 10,
    boxShadow: `0 0 0 3px rgba(99, 102, 241, 0.45), 0 0 0 9999px rgba(0,0,0,0.35)`,
    pointerEvents: 'none',
    transition: 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
  } : null;

  // Backdrop transparent quand on est en mode centre (welcome / final),
  // sinon le ring fait deja l'effet de surlignage via box-shadow.
  const backdropStyle = (cur.centered || !targetRect) ? {
    position: 'fixed', inset: 0, zIndex: 9997,
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(2px)',
  } : null;

  const node = (
    <>
      {backdropStyle && <div style={backdropStyle}/>}
      {ringStyle && <div style={ringStyle}/>}
      {arrowStyle && <div style={arrowStyle}/>}
      <div style={tooltipStyle}>
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 22 : 6, height: 6,
              borderRadius: 3,
              background: i <= step ? t.text : t.border,
              transition: 'width 0.2s ease, background 0.2s ease',
            }}/>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: t.muted }}>
            {step + 1} / {STEPS.length}
          </span>
        </div>

        <h2 style={{ fontSize: 17, fontWeight: 500, color: t.text, margin: '0 0 8px' }}>
          {cur.title}
        </h2>
        <p style={{ fontSize: 13, color: t.muted, lineHeight: 1.55, margin: '0 0 16px' }}>
          {cur.body}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={skip} disabled={closing}
                  style={{
                    background: 'transparent', border: 'none',
                    color: t.muted, fontSize: 12, fontFamily: 'inherit',
                    cursor: closing ? 'wait' : 'pointer', padding: 4,
                  }}>
            Passer la visite
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <Button type="button" variant="ghost" size="small" onClick={prev}
                      disabled={closing}>
                Retour
              </Button>
            )}
            <Button type="button" variant="primary" size="small" onClick={next}
                    disabled={closing}>
              {cur.cta}
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(node, document.body);
}
