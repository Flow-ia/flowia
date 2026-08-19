// backend/src/utils/phone.js
// RGPD commit 20 — validation téléphone E.164 via libphonenumber-js.
// Utilisé sur toutes les routes back qui acceptent un téléphone client
// (defense in depth derrière la validation côté front PhoneInput).

const { parsePhoneNumberFromString } = require('libphonenumber-js');

// Salon DZ : pays par defaut Algerie (mobiles 05/06/07, prefixe +213).
const DEFAULT_COUNTRY = 'DZ';

/**
 * Valide un téléphone et retourne sa forme E.164.
 *
 * @param {string|null|undefined} raw           - valeur brute (peut déjà être au format +33..., ou local 06..., ou null)
 * @param {object} [opts]
 * @param {boolean} [opts.required=true]        - si false, raw vide/null retourne { valid:true, e164:null }
 * @param {string}  [opts.defaultCountry='DZ']  - pays par défaut si raw n'a pas de préfixe international
 * @returns {{ valid:boolean, error: 'PHONE_REQUIRED'|'PHONE_INVALID'|'PHONE_PARSE_ERROR'|null, e164: string|null, raw: string|null }}
 */
function validatePhone(raw, opts = {}) {
  const required = opts.required !== false;
  const defaultCountry = opts.defaultCountry || DEFAULT_COUNTRY;

  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    if (required) return { valid: false, error: 'PHONE_REQUIRED', e164: null, raw: null };
    return { valid: true, error: null, e164: null, raw: null };
  }

  let parsed;
  try {
    parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  } catch (e) {
    return { valid: false, error: 'PHONE_PARSE_ERROR', e164: null, raw: trimmed };
  }

  if (!parsed || !parsed.isValid()) {
    return { valid: false, error: 'PHONE_INVALID', e164: null, raw: trimmed };
  }

  return { valid: true, error: null, e164: parsed.number, raw: trimmed };
}

/**
 * Helper Express : termine la requête avec 400 + message UI si invalide.
 * Retourne le résultat de validatePhone (à réutiliser dans le handler si valid).
 *
 * @returns {{ valid:boolean, e164: string|null, raw: string|null }} ou null si réponse déjà envoyée
 */
function validatePhoneOrRespond(res, raw, opts = {}) {
  const result = validatePhone(raw, opts);
  if (result.valid) return result;
  const message = result.error === 'PHONE_REQUIRED'
    ? 'Téléphone requis.'
    : 'Numéro de téléphone invalide pour le pays.';
  res.status(400).json({ error: message, code: result.error });
  return null;
}

module.exports = { validatePhone, validatePhoneOrRespond };
