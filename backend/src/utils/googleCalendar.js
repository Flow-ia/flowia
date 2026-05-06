// utils/googleCalendar.js — Service Google Calendar API
//
// Responsabilites :
// - Refresh automatique des tokens expires (access_token expire ~1h, le
//   refresh_token reste valide tant que l'utilisateur ne revoque pas l'acces).
// - Push event (create/update/delete) avec lien RDV ↔ google_event_id.
// - Erreurs gracieuses : si la sync echoue (token revoque, 401/403, network),
//   on log + persist last_sync_error mais on ne casse PAS le flow booking.
//
// Le refresh_token peut etre absent si l'utilisateur s'est deja co/deco une
// fois (Google ne le redonne qu'au premier consent ou avec prompt=consent).
// On force `prompt=consent + access_type=offline` dans /connect pour garantir
// la presence du refresh_token.

const { pool } = require('../db');
const { encrypt, decrypt } = require('./tokenCrypto');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

function getOAuthCreds() {
  // Reutilise les credentials Google existants (login merchant). Si tu veux
  // separer pour clarte, ajoute GOOGLE_CALENDAR_CLIENT_ID/SECRET dedies.
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants');
  }
  return { clientId, clientSecret };
}

// ── Recharge access_token via refresh_token si expire ────────────────────
async function getValidAccessToken(integration) {
  const now = Date.now();
  const exp = integration.token_expires_at
    ? new Date(integration.token_expires_at).getTime() : 0;
  // Marge de 60s pour eviter de faire un appel avec un token sur le point d'expirer.
  if (exp && exp > now + 60_000) {
    return decrypt(integration.access_token_enc);
  }
  if (!integration.refresh_token_enc) {
    throw new Error('refresh_token absent — reconnecter Google Calendar');
  }
  const { clientId, clientSecret } = getOAuthCreds();
  const refreshToken = decrypt(integration.refresh_token_enc);
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    // refresh_token revoque (par l'utilisateur via myaccount.google.com OU
    // notre propre revoke), expire ou invalide. Conformement a notre
    // engagement Limited Use, on supprime IMMEDIATEMENT la copie chiffree
    // du jeton (deja sans valeur cote Google) au lieu de la garder en DB
    // avec un simple flag desactive. Pas de cron de cleanup necessaire :
    // c'est detecte au prochain usage.
    //
    // invalid_grant → revocation explicite cote Google (compte deconnecte
    //                  ou autorisation retiree par l'utilisateur)
    // 400 / 401     → token expire/invalide depuis trop longtemps
    if (r.status === 400 || r.status === 401) {
      await pool.query(
        `DELETE FROM merchant_calendar_integrations WHERE id=$1`,
        [integration.id]
      );
      console.log(`[CALSYNC] Token revoque/invalide → row supprimee (user ${integration.user_id}, raison: ${data.error || r.status})`);
    }
    throw new Error(`Google refresh failed: ${data.error || r.status}`);
  }
  // Persiste le nouveau token (l'expires_in est en secondes).
  const newExpires = new Date(now + (data.expires_in || 3600) * 1000);
  await pool.query(
    `UPDATE merchant_calendar_integrations
        SET access_token_enc=$2, token_expires_at=$3, updated_at=NOW()
      WHERE id=$1`,
    [integration.id, encrypt(data.access_token), newExpires]
  );
  return data.access_token;
}

// ── Construit l'objet event Google a partir d'un appointment ─────────────
function buildEventBody({ appt, businessName, serviceName, employeeName, timezone }) {
  // Conversion date+time → ISO en respectant la timezone du merchant.
  // On laisse l'object {date, start, end} en string Google API qui supporte
  // dateTime + timeZone (Google convertit cote serveur).
  const date = appt.date; // 'YYYY-MM-DD'
  const start = `${date}T${appt.start_time}:00`;
  const end   = `${date}T${appt.end_time}:00`;
  const tz    = timezone || 'Europe/Paris';

  const summary = `${appt.client_name || 'Client'} — ${serviceName || 'RDV'}`;
  const lines = [];
  if (employeeName) lines.push(`Avec : ${employeeName}`);
  if (appt.client_email) lines.push(`Email : ${appt.client_email}`);
  if (appt.client_phone) lines.push(`Telephone : ${appt.client_phone}`);
  if (appt.notes) lines.push(`\nNotes : ${appt.notes}`);
  lines.push('\n— RDV synchronise depuis FlowIA');

  return {
    summary,
    description: lines.join('\n'),
    location: businessName || undefined,
    start: { dateTime: start, timeZone: tz },
    end:   { dateTime: end,   timeZone: tz },
    // Evite que Google envoie un mail au client (le merchant a deja FlowIA pour ca)
    reminders: { useDefault: true },
    // Source : visible cote Google Calendar (link cliquable retour FlowIA).
    source: { title: 'FlowIA', url: 'https://flowiapro.com' },
    // Etat selon status RDV.
    status: appt.status === 'cancelled' ? 'cancelled' : 'confirmed',
  };
}

// ── Recupere l'integration active du merchant ────────────────────────────
async function getActiveIntegration(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM merchant_calendar_integrations
      WHERE user_id=$1 AND sync_enabled=TRUE
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

// ── PUSH : create / update / delete event Google ─────────────────────────
async function pushAppointment(userId, appt, opts = {}) {
  try {
    const integration = await getActiveIntegration(userId);
    if (!integration) return { skipped: true, reason: 'no_integration' };
    const accessToken = await getValidAccessToken(integration);
    const calendarId = integration.calendar_id || 'primary';
    const body = buildEventBody({ appt,
      businessName: opts.businessName,
      serviceName:  opts.serviceName,
      employeeName: opts.employeeName,
      timezone:     opts.timezone,
    });
    const r = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    const data = await r.json();
    if (!r.ok) throw new Error(`Google API ${r.status}: ${data.error?.message || 'unknown'}`);
    await pool.query(
      `UPDATE appointments
          SET google_event_id=$2, google_calendar_id=$3, google_synced_at=NOW()
        WHERE id=$1`,
      [appt.id, data.id, calendarId]
    );
    await pool.query(
      `UPDATE merchant_calendar_integrations
          SET last_sync_at=NOW(), last_sync_error=NULL, updated_at=NOW()
        WHERE id=$1`,
      [integration.id]
    );
    return { synced: true, event_id: data.id };
  } catch (e) {
    console.warn('[GCAL push]', e.message);
    try {
      await pool.query(
        `UPDATE merchant_calendar_integrations
            SET last_sync_error=$2, updated_at=NOW()
          WHERE user_id=$1`,
        [userId, String(e.message).slice(0, 500)]
      );
    } catch {}
    return { synced: false, error: e.message };
  }
}

async function updateAppointmentEvent(userId, appt, opts = {}) {
  try {
    if (!appt.google_event_id) {
      // Pas encore sync → on fait un push (cas : sync activee apres creation).
      return pushAppointment(userId, appt, opts);
    }
    const integration = await getActiveIntegration(userId);
    if (!integration) return { skipped: true, reason: 'no_integration' };
    const accessToken = await getValidAccessToken(integration);
    const calendarId = appt.google_calendar_id || integration.calendar_id || 'primary';
    const body = buildEventBody({ appt,
      businessName: opts.businessName,
      serviceName:  opts.serviceName,
      employeeName: opts.employeeName,
      timezone:     opts.timezone,
    });
    const r = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(appt.google_event_id)}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      // 404 = event supprime cote Google → on tente un push neuf.
      if (r.status === 404) {
        return pushAppointment(userId, { ...appt, google_event_id: null }, opts);
      }
      throw new Error(`Google API ${r.status}: ${data.error?.message || 'unknown'}`);
    }
    await pool.query(
      `UPDATE appointments SET google_synced_at=NOW() WHERE id=$1`,
      [appt.id]
    );
    return { synced: true };
  } catch (e) {
    console.warn('[GCAL update]', e.message);
    return { synced: false, error: e.message };
  }
}

async function deleteAppointmentEvent(userId, appt) {
  try {
    if (!appt.google_event_id) return { skipped: true };
    const integration = await getActiveIntegration(userId);
    if (!integration) return { skipped: true, reason: 'no_integration' };
    const accessToken = await getValidAccessToken(integration);
    const calendarId = appt.google_calendar_id || integration.calendar_id || 'primary';
    const r = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(appt.google_event_id)}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );
    // 404 ou 410 = deja supprime, on considere OK.
    if (!r.ok && r.status !== 404 && r.status !== 410) {
      const data = await r.json().catch(() => ({}));
      throw new Error(`Google API ${r.status}: ${data.error?.message || 'unknown'}`);
    }
    await pool.query(
      `UPDATE appointments
          SET google_event_id=NULL, google_synced_at=NOW()
        WHERE id=$1`,
      [appt.id]
    );
    return { synced: true };
  } catch (e) {
    console.warn('[GCAL delete]', e.message);
    return { synced: false, error: e.message };
  }
}

module.exports = {
  getActiveIntegration,
  pushAppointment,
  updateAppointmentEvent,
  deleteAppointmentEvent,
};
