// Types de commerce FlowIA — source de verite partagee backend.
// Le frontend a sa propre constante alignee (frontend/src/utils/businessTypes.js).
//
// Format : { key: VARCHAR(30) DB, label: FR, group: 'coiffure'|'beaute'|'bien-etre' }
// La cle DB est immuable (cle metier) ; le label peut evoluer librement.

const BUSINESS_TYPES = [
  { key: 'barbier',          label: 'Coiffeur Hommes / Barbier',  group: 'coiffure' },
  { key: 'coiffeur_femme',   label: 'Coiffeur Femmes',            group: 'coiffure' },
  { key: 'salon_mixte',      label: 'Salon de Coiffure Mixte',    group: 'coiffure' },
  { key: 'onglerie',         label: 'Onglerie / Manucure',        group: 'beaute' },
  { key: 'institut_beaute',  label: 'Institut de Beaute',         group: 'beaute' },
  { key: 'spa',              label: 'Spa & Bien-etre',            group: 'bien-etre' },
];

const VALID_KEYS = new Set(BUSINESS_TYPES.map(t => t.key));

function isValidBusinessType(key) {
  return typeof key === 'string' && VALID_KEYS.has(key);
}

function labelFor(key) {
  return BUSINESS_TYPES.find(t => t.key === key)?.label || null;
}

module.exports = { BUSINESS_TYPES, VALID_KEYS, isValidBusinessType, labelFor };
