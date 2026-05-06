// Types de commerce FlowIA — mirror frontend du fichier backend
// (backend/src/utils/businessTypes.js).
// Doit rester aligne (cles strictement identiques).

export const BUSINESS_TYPES = [
  { key: 'barbier',          label: 'Coiffeur Hommes / Barbier',  short: 'Hommes',     group: 'coiffure' },
  { key: 'coiffeur_femme',   label: 'Coiffeur Femmes',            short: 'Femmes',     group: 'coiffure' },
  { key: 'salon_mixte',      label: 'Salon de Coiffure Mixte',    short: 'Mixte',      group: 'coiffure' },
  { key: 'onglerie',         label: 'Onglerie / Manucure',        short: 'Onglerie',   group: 'beaute' },
  { key: 'institut_beaute',  label: 'Institut de Beaute',         short: 'Institut',   group: 'beaute' },
  { key: 'spa',              label: 'Spa & Bien-etre',            short: 'Spa',        group: 'bien-etre' },
];

export const BUSINESS_TYPE_KEYS = BUSINESS_TYPES.map(t => t.key);

export function isValidBusinessType(key) {
  return typeof key === 'string' && BUSINESS_TYPE_KEYS.includes(key);
}

export function labelFor(key) {
  return BUSINESS_TYPES.find(t => t.key === key)?.label || null;
}
