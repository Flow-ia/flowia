// adminAudit.js — Helper d'écriture dans admin_audit_log. Write-only (aucune
// méthode d'update/delete exposée). Try/catch silencieux : un échec d'audit
// ne doit jamais faire échouer la requête principale.

const { pool } = require('../db');

async function logAuditAction(params = {}) {
  const {
    adminId       = null,
    adminEmail    = null,
    action,
    targetType    = null,
    targetId      = null,
    payloadBefore = null,
    payloadAfter  = null,
    req           = null,
    status        = 'success',
    errorMessage  = null,
  } = params;

  if (!action) return;

  const ip = req?.ip || req?.connection?.remoteAddress || null;
  const ua = req?.headers?.['user-agent'] || null;

  try {
    await pool.query(
      `INSERT INTO admin_audit_log
         (admin_id, admin_email, action, target_type, target_id,
          payload_before, payload_after, ip_address, user_agent, status, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        adminId,
        adminEmail ? String(adminEmail).slice(0, 255) : null,
        String(action).slice(0, 100),
        targetType ? String(targetType).slice(0, 50) : null,
        targetId,
        payloadBefore ? JSON.stringify(payloadBefore) : null,
        payloadAfter  ? JSON.stringify(payloadAfter)  : null,
        ip ? String(ip).slice(0, 45) : null,
        ua ? String(ua).slice(0, 1000) : null,
        status === 'failure' ? 'failure' : 'success',
        errorMessage ? String(errorMessage).slice(0, 500) : null,
      ]
    );
  } catch (e) {
    console.error('[adminAudit] insert failed:', e.message);
  }
}

module.exports = { logAuditAction };
