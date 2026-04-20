// src/pages/booking-page/helpers.js
// Fonctions pures — formatage / validation téléphone, routing URL.

import { PHONE_COUNTRIES } from './constants';

// Formater le numéro final : +<dial><numéro sans zéro initial>
export const formatPhone = (country, local) => {
  const digits = local.replace(/\D/g, '');
  if (!digits) return '';
  const stripped = digits.startsWith('0') ? digits.slice(1) : digits;
  return `${country.dial}${stripped}`;
};

// Valider le numéro local
export const validatePhone = (country, local) => {
  const digits = local.replace(/\D/g, '');
  if (!digits) return 'Numéro requis';
  const stripped = digits.startsWith('0') ? digits.slice(1) : digits;
  if (!country.len.includes(stripped.length)) {
    return `Numéro invalide pour ${country.label} (${country.len.join(' ou ')} chiffres attendus)`;
  }
  return '';
};

// Parser un numéro international existant → { country, local }
export const parsePhone = (phone) => {
  if (!phone) return { country: PHONE_COUNTRIES[0], local: '' };
  const match = PHONE_COUNTRIES.find(c => phone.startsWith(c.dial));
  if (match) {
    const rest = phone.slice(match.dial.length);
    return { country: match, local: rest };
  }
  return { country: PHONE_COUNTRIES[0], local: phone };
};

// Construire l'URL pour chaque étape du flow réservation
export const stepToPath = (slug, s, svcId, empId, dateStr, slot) => {
  const base = `/book/${slug}`;
  if (s === 1) return base;
  if (s === 2 && svcId) return `${base}/service/${svcId}/employe`;
  if (s === 3 && svcId && empId) return `${base}/service/${svcId}/employe/${empId}/date`;
  if (s === 4 && svcId && empId && dateStr) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau`;
  if (s === 5 && svcId && empId && dateStr && slot) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau/${slot}/infos`;
  if (s === 6 && svcId && empId && dateStr && slot) return `${base}/service/${svcId}/employe/${empId}/date/${dateStr}/creneau/${slot}/confirmation`;
  return base;
};

// Grouper services par catégorie booking (booking_category_name prioritaire,
// fallback category_name). Retourne { svcGroups, svcNoCat }.
export const groupServicesByCategory = (services) => {
  const svcGroups = [];
  const svcNoCat  = [];
  const _catMap   = new Map();
  services.forEach(s => {
    const label = s.booking_category_name || s.category_name || null;
    const color = s.booking_category_color || null;
    const icon  = s.booking_category_icon  || null;
    if (!label) { svcNoCat.push(s); return; }
    if (!_catMap.has(label)) {
      _catMap.set(label, svcGroups.length);
      svcGroups.push({ label, color, icon, svcs: [] });
    }
    svcGroups[_catMap.get(label)].svcs.push(s);
  });
  return { svcGroups, svcNoCat };
};
