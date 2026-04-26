// backend/src/utils/birthDate.js
// Validation et normalisation centralisée des dates de naissance
// (commit 24a — picker mois + année).
//
// Format attendu : "YYYY-MM-01" (jour forcé à 01, le commerçant n'a besoin
// que du mois et de l'année pour le programme anniversaire).
//
// Tolérance rétro-compat :
//   - "YYYY-MM"      : accepté, normalisé en "YYYY-MM-01"
//   - "YYYY-MM-DD"   : refusé si DD != 01 (le picker n'écrit que le -01)
//
// Bornes :
//   - Année minimale : currentYear - 100   (centenaire)
//   - Année maximale : currentYear - 13    (RGPD : majorité numérique CNIL)
//
// Retour : { valid, value, error }
//   - input vide / null / undefined → { valid: true, value: null }
//   - input invalide                → { valid: false, error: 'BIRTH_DATE_INVALID' }
//   - input valide                  → { valid: true,  value: 'YYYY-MM-01' }

function parseBirthDate(input) {
  if (input === undefined || input === null) return { valid: true, value: null };
  if (typeof input !== 'string') return { valid: false, error: 'BIRTH_DATE_INVALID' };

  const s = input.trim();
  if (!s) return { valid: true, value: null };

  let normalized;
  if (/^\d{4}-\d{2}-01$/.test(s)) {
    normalized = s;
  } else if (/^\d{4}-\d{2}$/.test(s)) {
    normalized = s + '-01';
  } else {
    return { valid: false, error: 'BIRTH_DATE_INVALID' };
  }

  const year  = parseInt(normalized.slice(0, 4), 10);
  const month = parseInt(normalized.slice(5, 7), 10);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return { valid: false, error: 'BIRTH_DATE_INVALID' };
  }
  if (month < 1 || month > 12) {
    return { valid: false, error: 'BIRTH_DATE_INVALID' };
  }
  const currentYear = new Date().getFullYear();
  if (year < currentYear - 100 || year > currentYear - 13) {
    return { valid: false, error: 'BIRTH_DATE_INVALID' };
  }
  return { valid: true, value: normalized };
}

module.exports = { parseBirthDate };
