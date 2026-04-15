// src/utils/api.js
const BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('ff_token');
}
function getPinToken() {
  return localStorage.getItem('ff_pin_token');
}
// Requête avec PIN admin (pour PUT/DELETE transactions)
async function adminRequest(path, options = {}) {
  const token    = getToken();
  const pinToken = getPinToken();
  const headers  = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token)    headers['Authorization'] = `Bearer ${token}`;
  if (pinToken) headers['x-pin-session'] = pinToken;
  const res  = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || 'Erreur serveur'), { code: data.error });
  return data;
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

export const api = {
  // ── Auth — Inscription ──────────────────────────────────────────────────
  register:           (b) => request('/auth/register',            { method: 'POST', body: JSON.stringify(b) }),
  confirmRegister:    (b) => request('/auth/register/confirm',    { method: 'POST', body: JSON.stringify(b) }),
  resendCode:         (b) => request('/auth/resend-code',          { method: 'POST', body: JSON.stringify(b) }),
  deleteMerchantAccount: () => request('/auth/account',            { method: 'DELETE' }),

  // ── Auth — Connexion ────────────────────────────────────────────────────
  login:              (b) => request('/auth/login',               { method: 'POST', body: JSON.stringify(b) }),

  // ── Auth — Mot de passe oublié ──────────────────────────────────────────
  forgot:             (b) => request('/auth/forgot',              { method: 'POST', body: JSON.stringify(b) }),
  forgotVerify:       (b) => request('/auth/forgot/verify',       { method: 'POST', body: JSON.stringify(b) }),
  forgotReset:        (b) => request('/auth/forgot/reset',        { method: 'POST', body: JSON.stringify(b) }),

  // ── Auth — Changement email ─────────────────────────────────────────────
  changeEmail:        (b) => request('/auth/change-email',        { method: 'POST', body: JSON.stringify(b) }),
  confirmChangeEmail: (b) => request('/auth/change-email/confirm',{ method: 'POST', body: JSON.stringify(b) }),

  // ── Auth — Profil ───────────────────────────────────────────────────────
  me:                 ()  => request('/auth/me'),
  changePassword:     (b) => request('/auth/change-password', { method: 'POST', body: JSON.stringify(b) }),
  updateProfile:      (b) => request('/auth/profile',         { method: 'PUT',  body: JSON.stringify(b) }),

  // ── PIN Admin — vérification via BDD (jamais en local) ──────────────────
  // Statut : le compte a-t-il un PIN en base ?
  pinStatus:          ()  => request('/auth/pin/status'),

  // Vérifier le PIN saisi → retourne { valid, pinSessionToken } si correct
  pinVerify:          (b) => request('/auth/pin/verify',          { method: 'POST', body: JSON.stringify(b) }),

  // Vérifier si la session PIN stockée en localStorage est encore valide
  // ET appartient au compte connecté (userId vérifié côté backend)
  pinCheckSession:    (b) => request('/auth/pin/check-session',   { method: 'POST', body: JSON.stringify(b) }),

  // Créer / remplacer le PIN en BDD (après OTP email confirmé)
  pinSet:             (b) => request('/auth/pin/set',             { method: 'POST', body: JSON.stringify(b) }),

  // Supprimer le PIN du compte
  pinDelete:          ()  => request('/auth/pin',                 { method: 'DELETE' }),

  // ── PIN — Processus changement (OTP envoyé à l'email du compte) ─────────
  pinChangeRequest:   (b) => request('/auth/pin-change-request',  { method: 'POST', body: JSON.stringify(b) }),
  pinChangeConfirm:   (b) => request('/auth/pin-change-confirm',  { method: 'POST', body: JSON.stringify(b) }),

  // ── PIN — Processus oubli (sans être connecté) ──────────────────────────
  pinForgotRequest:   (b) => request('/auth/pin-forgot-request',  { method: 'POST', body: JSON.stringify(b) }),
  pinForgotVerify:    (b) => request('/auth/pin-forgot-verify',   { method: 'POST', body: JSON.stringify(b) }),

  // ── PIN — Alerte lockout ─────────────────────────────────────────────────
  notifyPinLockout:   ()  => request('/auth/pin-lockout-notify',  { method: 'POST' }),

  // ── Catégories ───────────────────────────────────────────────────────────
  getCategories:      ()       => request('/categories'),
  createCategory:     (b)      => request('/categories',          { method: 'POST',   body: JSON.stringify(b) }),
  updateCategory:     (id, b)  => request(`/categories/${id}`,    { method: 'PUT',    body: JSON.stringify(b) }),
  deleteCategory:     (id)     => request(`/categories/${id}`,    { method: 'DELETE' }),
  reorderCategories:  (order)  => request('/categories/reorder',  { method: 'PATCH',  body: JSON.stringify({ order }) }),

  // ── Employés ─────────────────────────────────────────────────────────────
  getEmployees:       ()       => request('/employees'),
  createEmployee:     (b)      => request('/employees',           { method: 'POST',   body: JSON.stringify(b) }),
  updateEmployee:     (id, b)  => request(`/employees/${id}`,     { method: 'PUT',    body: JSON.stringify(b) }),
  deleteEmployee:         (id) => request(`/employees/${id}`,  { method: 'DELETE' }),
  getEmployeeFutureAppts: (id) => request(`/employees/${id}/future-appointments`),
  smartDeleteEmployee:    (id) => request(`/employees/${id}/smart-delete`, { method: 'POST' }),

  // ── Codes PIN employés ────────────────────────────────────────────────────
  getEmployeePins:           ()           => request('/employee-pins'),
  getEmployeePinStatus:      (empId)      => request(`/employee-pins/${empId}/status`),
  setEmployeePin:            (empId, b)   => request(`/employee-pins/${empId}/set`,           { method: 'POST',   body: JSON.stringify(b) }),
  deleteEmployeePin:         (empId)      => request(`/employee-pins/${empId}`,               { method: 'DELETE' }),
  toggleEmployeePin:         (empId, b)   => request(`/employee-pins/${empId}/toggle`,         { method: 'PATCH',  body: JSON.stringify(b) }),
  verifyEmployeePin:         (empId, b)   => request(`/employee-pins/${empId}/verify`,         { method: 'POST',   body: JSON.stringify(b) }),
  checkEmployeePinSession:   (empId, b)   => request(`/employee-pins/${empId}/check-session`,  { method: 'POST',   body: JSON.stringify(b) }),

  // ── Transactions ──────────────────────────────────────────────────────────
  getTransactions:    (q)      => request('/transactions' + (q ? '?' + new URLSearchParams(q) : '')),
  createTransaction:  (b)      => request('/transactions',        { method: 'POST',   body: JSON.stringify(b) }),
  updateTransaction:  (id, b)  => adminRequest(`/transactions/${id}`,  { method: 'PUT',    body: JSON.stringify(b) }),
  deleteTransaction:  (id)     => adminRequest(`/transactions/${id}`,  { method: 'DELETE' }),
};
// ── Réservations (commerçant) ─────────────────────────────────────────────────
export const bookingApi = {

  // Agenda employé
  getEmployeeAgenda:   (empId, q) => request('/booking/employee-agenda?' + new URLSearchParams({ employee_id: empId, ...q })),
  createEmpAppt:       (b)        => request('/booking/employee-agenda/appointments', { method: 'POST', body: JSON.stringify(b) }),
  updateEmpAppt:       (id, b)    => request(`/booking/employee-agenda/appointments/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  getEmpPermissions:   (id)       => request(`/booking/employee-permissions/${id}`),
  saveEmpPermissions:  (id, b)    => request(`/booking/employee-permissions/${id}`, { method: 'PUT', body: JSON.stringify(b) }),

  // Paramètres
  getSettings:    ()    => request('/booking/settings'),
  saveSettings:   (b)   => request('/booking/settings',         { method: 'POST', body: JSON.stringify(b) }),
  checkSlug:      (slug) => request(`/booking/check-slug?slug=${encodeURIComponent(slug)}`),

  // Horaires
  getHours:       ()    => request('/booking/hours'),
  saveHours:      (b)   => request('/booking/hours',            { method: 'POST', body: JSON.stringify(b) }),

  // Services
  getServices:    ()    => request('/booking/services'),
  createService:  (b)   => request('/booking/services',         { method: 'POST',   body: JSON.stringify(b) }),
  updateService:  (id,b)=> request(`/booking/services/${id}`,   { method: 'PUT',    body: JSON.stringify(b) }),
  deleteService:  (id)  => request(`/booking/services/${id}`,   { method: 'DELETE' }),

  // RDV
  getAppointments:(q)   => request('/booking/appointments' + (q ? '?'+new URLSearchParams(q) : '')),
  createAppt:     (b)   => request('/booking/appointments',     { method: 'POST', body: JSON.stringify(b) }),
  updateAppt:     (id,b)=> request(`/booking/appointments/${id}`,{ method: 'PUT',  body: JSON.stringify(b) }),
  deleteAppt:     (id)  => request(`/booking/appointments/${id}`,{ method: 'DELETE' }),
  checkoutAppt:   (id,b)=> request(`/booking/appointments/${id}/checkout`, { method: 'POST', body: JSON.stringify(b) }),

  // Clients
  getClients:     ()    => request('/booking/clients'),

  // Horaires par employé
  getEmpHours:    (empId)   => request(`/booking/employee-hours/${empId}`),
  saveEmpHours:   (b)       => request('/booking/employee-hours',            { method: 'POST', body: JSON.stringify(b) }),
  deleteEmpHours: (empId)   => request(`/booking/employee-hours/${empId}`, { method: 'DELETE' }),
  // Pauses commerçant
  getBreaks:      ()        => request('/booking/breaks'),
  saveBreaks:     (b)       => request('/booking/breaks',                   { method: 'POST', body: JSON.stringify(b) }),
  // Plages horaires multiples employés
  getEmpSlots:    (empId)   => request(`/booking/employee-slots/${empId}`),
  saveEmpSlots:   (b)       => request('/booking/employee-slots',           { method: 'POST', body: JSON.stringify(b) }),
  deleteEmpSlots: (empId)   => request(`/booking/employee-slots/${empId}`, { method: 'DELETE' }),

  // Disponibilités
  getAvailability:(empId, q) => request(`/booking/availability/${empId}` + (q ? '?'+new URLSearchParams(q) : '')),
  setAvailability:(b)   => request('/booking/availability',     { method: 'POST', body: JSON.stringify(b) }),

  // Catégories de services (site de réservation)
  getServiceCategories:    ()       => request('/booking/service-categories'),
  createServiceCategory:   (b)      => request('/booking/service-categories',        { method: 'POST',   body: JSON.stringify(b) }),
  updateServiceCategory:   (id, b)  => request(`/booking/service-categories/${id}`,  { method: 'PUT',    body: JSON.stringify(b) }),
  deleteServiceCategory:   (id)     => request(`/booking/service-categories/${id}`,  { method: 'DELETE' }),
  reorderServiceCategories:(order)  => request('/booking/service-categories/reorder',{ method: 'PATCH',  body: JSON.stringify({ order }) }),
};

// ── Media (images profil, galerie, services) ─────────────────────────────────
export const mediaApi = {
  // URLs publiques (utilisées directement dans <img src=...>)
  profileUrl:  (userId)            => `${BASE}/media/commercant/${userId}/profile`,
  coverUrl:    (userId, imageId)   => `${BASE}/media/commercant/${userId}/cover/${imageId}`,
  serviceUrl:  (serviceId)         => `${BASE}/media/service/${serviceId}/image`,

  // Métadonnées
  getMeta:     (userId)            => request(`/media/commercant/${userId}/meta`),

  // Upload (multipart/form-data — pas de JSON)
  uploadProfile: async (file) => {
    const token = localStorage.getItem('ff_token');
    const fd = new FormData(); fd.append('image', file);
    const res = await fetch(`${BASE}/media/commercant/profile`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur upload');
    return data;
  },
  uploadCover: async (file) => {
    const token = localStorage.getItem('ff_token');
    const fd = new FormData(); fd.append('image', file);
    const res = await fetch(`${BASE}/media/commercant/cover`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur upload');
    return data;
  },
  uploadServiceImage: async (serviceId, file) => {
    const token = localStorage.getItem('ff_token');
    const fd = new FormData(); fd.append('image', file);
    const res = await fetch(`${BASE}/media/service/${serviceId}/image`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur upload');
    return data;
  },
  deleteMedia: (id) => request(`/media/${id}`, { method: 'DELETE' }),
};

// ── Site public de réservation ────────────────────────────────────────────────
const PUB_BASE = import.meta.env.VITE_API_URL || '/api';
async function pubRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const clientToken = localStorage.getItem('ff_client_token');
  if (clientToken) headers['Authorization'] = `Bearer ${clientToken}`;
  const res = await fetch(`${PUB_BASE}/pub${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}
export const pubApi = {
  getBusiness:    (slug)    => pubRequest(`/${slug}`),
  getServices:    (slug)    => pubRequest(`/${slug}/services`),
  getEmployees:   (slug)    => pubRequest(`/${slug}/employees`),
  getSlots:       (slug, q) => pubRequest(`/${slug}/slots?` + new URLSearchParams(q)),
  book:           (slug, b) => pubRequest(`/${slug}/book`,             { method: 'POST', body: JSON.stringify(b) }),
  register:       (slug, b) => pubRequest(`/${slug}/client/register`,  { method: 'POST', body: JSON.stringify(b) }),
  login:          (slug, b) => pubRequest(`/${slug}/client/login`,     { method: 'POST', body: JSON.stringify(b) }),
  myAppointments: (slug)    => pubRequest(`/${slug}/client/appointments`),
  cancel:         (slug,id,b)=> pubRequest(`/${slug}/client/appointments/${id}/cancel`, { method: 'PUT', body: JSON.stringify(b) }),
  getClosedDays:   (slug)    => pubRequest(`/${slug}/closed-days`),
  getMonthStatus:  (slug, q) => pubRequest(`/${slug}/month-status?` + new URLSearchParams(q)),
  checkPromo:     (slug, body) => pubRequest(`/${slug}/check-promo`, { method: 'POST', body: JSON.stringify(body) }),
  updateClientProfile: (slug, body) => pubRequest(`/${slug}/client/profile`, { method: 'PUT', body: JSON.stringify(body) }),
  checkEmail:     (slug, email) => pubRequest(`/${slug}/client/check-email?email=${encodeURIComponent(email)}`),
};

// ── Notifications (Feature 3 & 7) ────────────────────────────────────────────
export const notifApi = {
  getSettings:    ()  => request('/notifications/settings'),
  saveSettings:   (b) => request('/notifications/settings', { method: 'PUT', body: JSON.stringify(b) }),
  testRecap:      ()  => request('/notifications/test-recap', { method: 'POST' }),
  // Web Push
  getVapidKey:    ()  => request('/notifications/vapid-public-key'),
  subscribePush:  (b) => request('/notifications/push-subscribe', { method: 'POST', body: JSON.stringify({ subscription: b }) }),
  unsubscribePush:(b) => request('/notifications/push-subscribe', { method: 'DELETE', body: JSON.stringify(b) }),
  // In-app
  getInApp:       (q) => request('/notifications/inapp' + (q ? '?' + new URLSearchParams(q) : '')),
  markRead:       (b) => request('/notifications/inapp/read', { method: 'PATCH', body: JSON.stringify(b) }),
  deleteInApp:    (id)=> request(`/notifications/inapp/${id}`, { method: 'DELETE' }),
};

// ── Export comptable (Feature 4) ──────────────────────────────────────────────
export const exportApi = {
  getSummary:  (q)    => request('/export/summary?' + new URLSearchParams(q)),
  getCsvUrl:   (q)    => `${BASE}/export/csv?`  + new URLSearchParams(q),
  getPdfUrl:   (q)    => `${BASE}/export/pdf?`  + new URLSearchParams(q),
  downloadFile: async (url, filename) => {
    const token = localStorage.getItem('ff_token');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error('Erreur export');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

// ── Absences employés (Feature 5) ────────────────────────────────────────────
export const absencesApi = {
  list:   (q)    => request('/absences?' + new URLSearchParams(q||{})),
  stats:  (q)    => request('/absences/stats?' + new URLSearchParams(q||{})),
  create: (b)    => request('/absences', { method: 'POST', body: JSON.stringify(b) }),
  update: (id,b) => request(`/absences/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  cancel: (id,b) => request(`/absences/${id}/cancel`, { method: 'PATCH', body: JSON.stringify(b||{}) }),
  remove: (id)   => request(`/absences/${id}`, { method: 'DELETE' }),
};

// ── Commissions (Feature 6) ───────────────────────────────────────────────────
export const commissionsApi = {
  get:          (q)       => request('/commissions?' + new URLSearchParams(q||{})),
  getSettings:  ()        => request('/commissions/settings'),
  saveRate:     (empId,b) => request(`/commissions/settings/${empId}`, { method: 'PUT', body: JSON.stringify(b) }),
};

// ── Fidélité (Feature 9) ──────────────────────────────────────────────────────
export const loyaltyApi = {
  getProgram:     ()   => request('/loyalty/program'),
  saveProgram:    (b)  => request('/loyalty/program', { method: 'PUT', body: JSON.stringify(b) }),
  getClients:     (q)  => request('/loyalty/clients?' + new URLSearchParams(q||{})),
  addStamp:       (b)  => request('/loyalty/stamp',        { method: 'POST', body: JSON.stringify(b) }),
  addService:     (b)  => request('/loyalty/add-service',  { method: 'POST', body: JSON.stringify(b) }),
  removeClient:   (id) => request(`/loyalty/clients/${id}`, { method: 'DELETE' }),
  promoHistory:   ()   => request('/loyalty/promo-history'),
  searchClients:  (q)  => request('/loyalty/search-clients?q=' + encodeURIComponent(q || '')),
  getStats:       ()   => request('/loyalty/stats'),
};

// ── Codes promo (Feature 10) ──────────────────────────────────────────────────
export const promoApi = {
  list:       ()        => request('/promo'),
  getStats:   ()        => request('/promo/stats'),
  check:      (b)       => request('/promo/check', { method: 'POST', body: JSON.stringify(b) }),
  create:     (b)       => request('/promo', { method: 'POST', body: JSON.stringify(b) }),
  update:     (id,b)    => request(`/promo/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  remove:     (id)      => request(`/promo/${id}`, { method: 'DELETE' }),
  sendEmails: (id, b)   => request(`/promo/${id}/send-emails`, { method: 'POST', body: JSON.stringify(b) }),
};

export const statsApi = {
  getProductStats: (q) => request('/stats/products' + (q && Object.keys(q).length ? '?' + new URLSearchParams(q) : '')),
  getForecast:     (q) => request('/stats/forecast?' + new URLSearchParams(q||{})),
  getHeatmap:      (q) => request('/stats/heatmap?' + new URLSearchParams(q||{})),
  getToday:        ()  => request('/stats/today'),
};

export const clientNotesApi = {
  search:     (q)  => request('/client-notes/search?q=' + encodeURIComponent(q || '')),
  getHistory: (email, empId) => request('/client-notes/history?email=' + encodeURIComponent(email) + (empId ? '&employee_id=' + encodeURIComponent(empId) : '')),
  getNotes:   (email) => request('/client-notes?email=' + encodeURIComponent(email)),
  addNote:    (b)  => request('/client-notes',    { method: 'POST',   body: JSON.stringify(b) }),
  updateNote: (id, b) => request(`/client-notes/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  deleteNote: (id) => request(`/client-notes/${id}`, { method: 'DELETE' }),
};
export const clientsApi = {
  list:    (params={}) => request('/clients?' + new URLSearchParams(params)),
  search:  (q)        => request('/clients/search?q=' + encodeURIComponent(q||'')),
  get:     (id)       => request('/clients/' + id),
  create:  (data)     => request('/clients', { method:'POST', body: JSON.stringify(data) }),
  update:  (id, data) => request('/clients/' + id, { method:'PUT', body: JSON.stringify(data) }),
  remove:  (id)       => request('/clients/' + id, { method:'DELETE' }),
  invite:  (id)       => request('/clients/' + id + '/invite', { method:'POST' }),
  addNote: (id, data) => request('/clients/' + id + '/note', { method:'POST', body: JSON.stringify(data) }),
  block:   (id, blocked) => request('/clients/' + id + '/block', { method:'PATCH', body: JSON.stringify({ blocked }) }),
};

export const creditsApi = {
  list:       (params={}) => request('/credits?' + new URLSearchParams(params)),
  getClient:  (clientId)  => request('/credits/client/' + clientId),
  grant:      (data)      => request('/credits/grant',  { method:'POST', body: JSON.stringify(data) }),
  repay:      (data)      => request('/credits/repay',  { method:'POST', body: JSON.stringify(data) }),
  remove:     (id)        => request('/credits/' + id,  { method:'DELETE' }),
};
async function gcRequest(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res  = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur reseau');
  return data;
}

export const globalClientApi = {
  register:       (data)        => gcRequest('/global-clients/register',        { method:'POST', body: JSON.stringify(data) }),
  login:          (data)        => gcRequest('/global-clients/login',           { method:'POST', body: JSON.stringify(data) }),
  activate:       (data)        => gcRequest('/global-clients/activate',        { method:'POST', body: JSON.stringify(data) }),
  me:             (token)       => gcRequest('/global-clients/me',              {}, token),
  updateMe:       (token, data) => gcRequest('/global-clients/me',              { method:'PUT',  body: JSON.stringify(data) }, token),
  deleteAccount:  (token)       => gcRequest('/global-clients/me',              { method:'DELETE' }, token),
  appointments:   (token)       => gcRequest('/global-clients/appointments',    {}, token),
  loyalty:        (token)       => gcRequest('/global-clients/loyalty',         {}, token),
  changePwd:      (token, data) => gcRequest('/global-clients/change-password', { method:'POST', body: JSON.stringify(data) }, token),
  forgotPassword: (data)        => gcRequest('/global-clients/forgot-password', { method:'POST', body: JSON.stringify(data) }),
  resetPassword:  (data)        => gcRequest('/global-clients/reset-password',  { method:'POST', body: JSON.stringify(data) }),
  // RGPD
  exportData:     ()            => gcRequest('/global-clients/me/export'),
  deleteAccount:  ()            => gcRequest('/global-clients/me',              { method:'DELETE' }),
};