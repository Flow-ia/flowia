// HeroSocialBg.jsx — couche décorative de logos réseaux sociaux qui montent
// en boucle derrière la section Hero du site de présentation flowiapro.com.
//
// Objectif visuel : évoquer la diffusion / viralité multi-canale du produit.
// Les icônes (Instagram / Facebook / WhatsApp / SMS / TikTok) sont semi-
// transparentes (opacity peak 0.18 dans @keyframes floatUpHero), partent du
// bas de la section et s'envolent vers le haut. Bornées par overflow:hidden
// du parent (Hero <section>).
//
// Utilisation : insérer directement dans le <section> Hero ; le parent doit
// avoir position:relative et overflow:hidden, et le contenu doit être dans
// un wrapper position:relative + zIndex:1.
//
// pointer-events:none -> ne bloque jamais un clic CTA.

import { useMemo } from 'react';

const SVGS = {
  whatsapp: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488',
  facebook: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073',
  instagram:'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069M12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0m0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8m6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881',
  tiktok:   'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.1z',
};

function SMSBubble({ color, size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}
         fill="none" stroke={color} strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" style={{ display:'block' }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

const ICONS = [
  { name:'whatsapp',  color:'#25D366' },
  { name:'facebook',  color:'#1877F2' },
  { name:'instagram', color:'#E4405F' },
  { name:'tiktok',    color:'#0F0F0F' },
  { name:'sms',       color:'#0EA5E9' },
];

const COUNT = 16;

function buildSeed() {
  const arr = [];
  for (let i = 0; i < COUNT; i++) {
    const proto = ICONS[i % ICONS.length];
    arr.push({
      key:      i,
      name:     proto.name,
      color:    proto.color,
      // Répartition horizontale pseudo-uniforme.
      left:     Math.round(((i * 67 + 7) % 100) * 100) / 100,
      // Tailles 32-58 px : visibles mais discrètes (opacity peak 0.18).
      size:     32 + ((i * 13) % 26),
      // Durée 14-24 s : assez lent pour rester décoratif.
      duration: 14 + ((i * 5) % 10),
      // Délai initial échelonné pour éviter qu'elles partent toutes ensemble.
      delay:    (i * 1.1) % 10,
    });
  }
  return arr;
}

export default function HeroSocialBg() {
  const items = useMemo(buildSeed, []);

  return (
    <div aria-hidden
         style={{ position:'absolute', inset:0, overflow:'hidden',
                  pointerEvents:'none', zIndex:0 }}>
      {items.map(it => (
        <div key={it.key}
             style={{ position:'absolute', left:`${it.left}%`, bottom:-80,
                      width:it.size, height:it.size,
                      animation:`floatUpHero ${it.duration}s linear ${it.delay}s infinite`,
                      willChange:'transform, opacity' }}>
          {it.name === 'sms' ? (
            <SMSBubble color={it.color} size={it.size}/>
          ) : (
            <svg viewBox="0 0 24 24" width={it.size} height={it.size}
                 style={{ display:'block', color:it.color }}>
              <path fill="currentColor" d={SVGS[it.name]}/>
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
