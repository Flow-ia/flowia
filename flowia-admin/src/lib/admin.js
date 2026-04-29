// admin.js — API helpers pour les ressources admin (merchants, clients, etc.).
// Wrap apiJson pour fournir une surface ergonomique.

import { apiJson } from './api.js';

// ── Merchants ───────────────────────────────────────────────────────────────
export async function listMerchants({ search = '', status = 'all', limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  if (status && status !== 'all') qs.set('status', status);
  qs.set('limit',  String(limit));
  qs.set('offset', String(offset));
  return await apiJson(`/api/admin/merchants?${qs.toString()}`);
}

export async function getMerchant(id) {
  return await apiJson(`/api/admin/merchants/${encodeURIComponent(id)}`);
}

export async function updateMerchant(id, fields) {
  return await apiJson(`/api/admin/merchants/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export async function freezeMerchant(id, reason) {
  return await apiJson(`/api/admin/merchants/${encodeURIComponent(id)}/freeze`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function unfreezeMerchant(id) {
  return await apiJson(`/api/admin/merchants/${encodeURIComponent(id)}/unfreeze`, {
    method: 'POST',
  });
}

export async function adjustMerchantSmsBalance(id, { delta, reason }) {
  return await apiJson(`/api/admin/merchants/${encodeURIComponent(id)}/sms-balance/adjust`, {
    method: 'POST',
    body: JSON.stringify({ delta, reason }),
  });
}

export async function getMerchantFeatures(id) {
  return await apiJson(`/api/admin/merchants/${encodeURIComponent(id)}/features`);
}

export async function setMerchantFeature(id, { feature, enabled, reason }) {
  return await apiJson(`/api/admin/merchants/${encodeURIComponent(id)}/features`, {
    method: 'PATCH',
    body: JSON.stringify({ feature, enabled, reason }),
  });
}

export async function forceMerchantSlug(id, { slug, lock }) {
  return await apiJson(`/api/admin/merchants/${encodeURIComponent(id)}/slug/force`, {
    method: 'POST',
    body: JSON.stringify({ slug, lock }),
  });
}

// ── Codes promo d'un commerçant (loyalty / birthday / referral / sms / manual)
// Catégories renvoyées par le backend dans counts_by_category + chaque ligne.
export async function listMerchantPromoCodes(merchantId, {
  category = 'all', status = 'all', search = '', limit = 50, offset = 0,
} = {}) {
  const qs = new URLSearchParams();
  if (category && category !== 'all') qs.set('category', category);
  if (status   && status   !== 'all') qs.set('status',   status);
  if (search)   qs.set('search', search);
  qs.set('limit',  String(limit));
  qs.set('offset', String(offset));
  return await apiJson(
    `/api/admin/merchants/${encodeURIComponent(merchantId)}/promo-codes?${qs.toString()}`
  );
}

export async function activateMerchantPromoCode(merchantId, codeId) {
  return await apiJson(
    `/api/admin/merchants/${encodeURIComponent(merchantId)}/promo-codes/${encodeURIComponent(codeId)}/activate`,
    { method: 'PATCH' }
  );
}

export async function deactivateMerchantPromoCode(merchantId, codeId) {
  return await apiJson(
    `/api/admin/merchants/${encodeURIComponent(merchantId)}/promo-codes/${encodeURIComponent(codeId)}/deactivate`,
    { method: 'PATCH' }
  );
}

export async function deleteMerchantPromoCode(merchantId, codeId) {
  return await apiJson(
    `/api/admin/merchants/${encodeURIComponent(merchantId)}/promo-codes/${encodeURIComponent(codeId)}`,
    { method: 'DELETE' }
  );
}

export async function deleteMerchantPromoCodesByCategory(merchantId, category) {
  const qs = new URLSearchParams({ category });
  return await apiJson(
    `/api/admin/merchants/${encodeURIComponent(merchantId)}/promo-codes?${qs.toString()}`,
    { method: 'DELETE' }
  );
}

// ── Reset destructif d'un commerçant ─────────────────────────────────────────
// feature ∈ transactions_walkin | transactions_appointment | transactions_all
//          | appointments | all
// Optionnel : from / to en YYYY-MM-DD pour limiter la plage.
// confirmBusinessName doit egaler exactement le business_name du commercant.
export async function resetMerchantData(id, { feature, from, to, confirmBusinessName }) {
  return await apiJson(`/api/admin/merchants/${encodeURIComponent(id)}/reset`, {
    method: 'POST',
    body: JSON.stringify({
      feature,
      from: from || undefined,
      to:   to   || undefined,
      confirm_business_name: confirmBusinessName,
    }),
  });
}

// ── Clients (global_clients cross-merchant) ─────────────────────────────────
export async function listClients({ search = '', status = 'all', limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  if (status && status !== 'all') qs.set('status', status);
  qs.set('limit',  String(limit));
  qs.set('offset', String(offset));
  return await apiJson(`/api/admin/clients?${qs.toString()}`);
}

export async function getClient(id) {
  return await apiJson(`/api/admin/clients/${encodeURIComponent(id)}`);
}

export async function blockClient(id, reason) {
  return await apiJson(`/api/admin/clients/${encodeURIComponent(id)}/block`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function unblockClient(id) {
  return await apiJson(`/api/admin/clients/${encodeURIComponent(id)}/unblock`, {
    method: 'POST',
  });
}

export async function anonymizeClient(id) {
  return await apiJson(`/api/admin/clients/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function restrictClientBooking(id, reason) {
  return await apiJson(`/api/admin/clients/${encodeURIComponent(id)}/restrict-booking`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function allowClientBooking(id) {
  return await apiJson(`/api/admin/clients/${encodeURIComponent(id)}/allow-booking`, {
    method: 'POST',
  });
}

// ── Stats globales ──────────────────────────────────────────────────────────
export async function getGlobalStats() {
  return await apiJson('/api/admin/stats');
}

// ── Audit log ───────────────────────────────────────────────────────────────
export async function listAudit({ action = '', adminId = '', targetType = '', status = '', search = '', since = '', until = '', limit = 100, offset = 0 } = {}) {
  const qs = new URLSearchParams();
  if (action)     qs.set('action',     action);
  if (adminId)    qs.set('adminId',    adminId);
  if (targetType) qs.set('targetType', targetType);
  if (status)     qs.set('status',     status);
  if (search)     qs.set('search',     search);
  if (since)      qs.set('since',      since);
  if (until)      qs.set('until',      until);
  qs.set('limit',  String(limit));
  qs.set('offset', String(offset));
  return await apiJson(`/api/admin/audit?${qs.toString()}`);
}

export async function listAuditActions() {
  return await apiJson('/api/admin/audit/actions');
}
