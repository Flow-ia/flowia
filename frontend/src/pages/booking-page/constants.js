// src/pages/booking-page/constants.js
// Constantes partagées — formulaire téléphone + ancres de navigation.

// Téléphone avec indicatif pays — liste des pays supportés
export const PHONE_COUNTRIES = [
  { code:'FR', dial:'+33', flag:'🇫🇷', len:[9,10], label:'France' },
  { code:'BE', dial:'+32', flag:'🇧🇪', len:[8,9],  label:'Belgique' },
  { code:'CH', dial:'+41', flag:'🇨🇭', len:[9,10], label:'Suisse' },
  { code:'LU', dial:'+352',flag:'🇱🇺', len:[8,9],  label:'Luxembourg' },
  { code:'CA', dial:'+1',  flag:'🇨🇦', len:[10],   label:'Canada' },
  { code:'MA', dial:'+212',flag:'🇲🇦', len:[9],    label:'Maroc' },
  { code:'TN', dial:'+216',flag:'🇹🇳', len:[8],    label:'Tunisie' },
  { code:'DZ', dial:'+213',flag:'🇩🇿', len:[9],    label:'Algérie' },
  { code:'SN', dial:'+221',flag:'🇸🇳', len:[9],    label:'Sénégal' },
  { code:'CI', dial:'+225',flag:'🇨🇮', len:[10],   label:'Côte d\'Ivoire' },
  { code:'DE', dial:'+49', flag:'🇩🇪', len:[10,11],label:'Allemagne' },
  { code:'ES', dial:'+34', flag:'🇪🇸', len:[9],    label:'Espagne' },
  { code:'IT', dial:'+39', flag:'🇮🇹', len:[9,10], label:'Italie' },
  { code:'PT', dial:'+351',flag:'🇵🇹', len:[9],    label:'Portugal' },
  { code:'GB', dial:'+44', flag:'🇬🇧', len:[10,11],label:'Royaume-Uni' },
  { code:'US', dial:'+1',  flag:'🇺🇸', len:[10],   label:'États-Unis' },
];

// Mapping ancres URL → IDs de section (scroll automatique au montage)
export const ANCHOR_MAP = {
  '#equipe':        'section-equipe',
  '#equipes':       'section-equipe',
  '#adresse':       'section-adresse',
  '#adresses':      'section-adresse',
  '#commentaires':  'section-avis',
  '#avis':          'section-avis',
  '#commentaire':   'section-avis',
  '#prestations':   'section-prestations',
  '#prestation':    'section-prestations',
  '#services':      'section-prestations',
  '#images':        'section-photos',
  '#photos':        'section-photos',
  '#album':         'section-photos',
};

// Garde-fou code parrainage (alphanumerique, 4-30 chars)
export const REF_RE = /^[A-Z0-9]{4,30}$/;
