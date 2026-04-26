const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { pool } = require('../../db');
const { sendReferralWelcome } = require('../../utils/email');
const { validatePhone } = require('../../utils/phone');
const { parseBirthDate } = require('../../utils/birthDate');

module.exports = function attachClientAuthRoutes(router) {
  // GET /:slug/client/check-email?email=xx
  // Vérifie si un email existe dans client_accounts (local) OU global_clients
  // Retourne : { exists, type: 'local'|'global'|'both'|null }
  router.get('/:slug/client/check-email', async (req, res) => {
    try {
      // AUDIT #17 : filtre is_enabled même sur endpoints lecture — cohérence
      // avec désactivation complète du booking.
      const { rows: biz } = await pool.query(
        'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE', [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const userId = biz[0].user_id;
      const { email } = req.query;
      if (!email || !email.includes('@')) return res.json({ exists: false, type: null });

      const emailLow = email.trim().toLowerCase();

      const [localR, globalR] = await Promise.all([
        pool.query('SELECT id FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2', [userId, emailLow]),
        pool.query('SELECT id, is_verified FROM global_clients WHERE LOWER(email)=$1', [emailLow]),
      ]);

      const hasLocal  = localR.rows.length > 0;
      const hasGlobal = globalR.rows.length > 0 && globalR.rows[0].is_verified;

      if (!hasLocal && !hasGlobal) return res.json({ exists: false, type: null });

      let type = hasLocal && hasGlobal ? 'both' : hasGlobal ? 'global' : 'local';
      res.json({ exists: true, type });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // POST /:slug/client/register
  router.post('/:slug/client/register', async (req, res) => {
    try {
      const { rows: biz } = await pool.query(
        'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE', [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const userId   = biz[0].user_id;
      const { email, password, first_name, last_name, phone, birth_date, marketing_opt_in } = req.body;
      if (!email || !password || !first_name || !last_name)
        return res.status(400).json({ error: 'Champs requis.' });
      if (password.length < 6)
        return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });
      // RGPD commit 20 : téléphone obligatoire + validé E.164.
      const phoneCheck = validatePhone(phone, { required: true });
      if (!phoneCheck.valid) {
        return res.status(400).json({
          error: phoneCheck.error === 'PHONE_REQUIRED' ? 'Téléphone requis.' : 'Numéro de téléphone invalide pour le pays.',
          code:  phoneCheck.error,
        });
      }
      const phoneRaw  = phoneCheck.raw;
      const phoneE164 = phoneCheck.e164;
      // Audit Z : opt-in marketing explicite. Par défaut FALSE.
      const optIn = marketing_opt_in === true || marketing_opt_in === 'true';

      const emailLow = email.toLowerCase().trim();
      // Commit 24a : strict YYYY-MM-01 (mois 01-12, année [-100, -13]).
      const birthCheck = parseBirthDate(birth_date);
      if (!birthCheck.valid) {
        return res.status(400).json({ error: 'Date de naissance invalide.', code: 'BIRTH_DATE_INVALID' });
      }
      const bd = birthCheck.value;

      // 1. Vérifier si compte global existe déjà avec cet email
      const { rows: gcEx } = await pool.query(
        'SELECT * FROM global_clients WHERE LOWER(email)=$1', [emailLow]
      );
      if (gcEx.length && gcEx[0].is_verified) {
        // Compte global existant vérifié → refuser la création, demander connexion
        return res.status(409).json({
          error: 'Un compte existe déjà avec cet email. Veuillez vous connecter.',
          code:  'USE_LOGIN',
        });
      }

      // 2. Vérifier si fiche locale existe déjà chez ce commerçant
      const { rows: localEx } = await pool.query(
        'SELECT id FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2', [userId, emailLow]
      );
      if (localEx.length) return res.status(409).json({ error: 'Email déjà utilisé.', code: 'USE_LOGIN' });

      const hash = await bcrypt.hash(password, 10);

      // 3. Créer ou mettre à jour le compte global
      let gcId;
      if (gcEx.length) {
        // Compte global non vérifié (invitation) → activer
        const { rows: updated } = await pool.query(
          `UPDATE global_clients SET
             password_hash=$2, is_verified=TRUE, invite_token=NULL,
             first_name=COALESCE(NULLIF($3,''), first_name),
             last_name=COALESCE(NULLIF($4,''), last_name),
             phone=COALESCE(NULLIF($5,''), phone),
             phone_e164=COALESCE(NULLIF($6,''), phone_e164),
             birth_date=COALESCE($7, birth_date),
             updated_at=NOW()
           WHERE LOWER(email)=$1 RETURNING id`,
          [emailLow, hash, first_name, last_name||'', phoneRaw||'', phoneE164||'', bd]
        );
        gcId = updated[0].id;
      } else {
        // Nouveau compte global
        const consentIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
        const { rows: newGc } = await pool.query(
          `INSERT INTO global_clients
             (email, password_hash, first_name, last_name, phone, phone_e164, birth_date, is_verified, consent_at, consent_ip, marketing_opt_in, marketing_opt_in_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,NOW(),$8,$9, CASE WHEN $9 THEN NOW() ELSE NULL END) RETURNING id`,
          [emailLow, hash, first_name, last_name||'', phoneRaw||null, phoneE164||null, bd, consentIp, optIn]
        );
        gcId = newGc[0].id;
      }

      // 4. Créer la fiche locale liée au compte global
      const { rows } = await pool.query(
        `INSERT INTO client_accounts (user_id, email, password_hash, first_name, last_name, phone, phone_e164, birth_date, global_client_id, marketing_opt_in, marketing_opt_in_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $10 THEN NOW() ELSE NULL END)
         ON CONFLICT (user_id, email) DO UPDATE SET
           global_client_id = EXCLUDED.global_client_id,
           password_hash    = EXCLUDED.password_hash,
           phone            = COALESCE(NULLIF(EXCLUDED.phone,''),      client_accounts.phone),
           phone_e164       = COALESCE(NULLIF(EXCLUDED.phone_e164,''), client_accounts.phone_e164),
           birth_date       = COALESCE(EXCLUDED.birth_date, client_accounts.birth_date),
           marketing_opt_in = EXCLUDED.marketing_opt_in,
           marketing_opt_in_at = CASE WHEN EXCLUDED.marketing_opt_in THEN NOW() ELSE NULL END
         RETURNING id, email, first_name, last_name, phone, phone_e164, birth_date, postal_code, city, global_client_id, marketing_opt_in`,
        [userId, emailLow, hash, first_name, last_name||'', phoneRaw||null, phoneE164||null, bd, gcId, optIn]
      );
      const client = rows[0];

      // 5. Lier toutes les fiches locales existantes (autres commerçants) au même compte global
      await pool.query(
        'UPDATE client_accounts SET global_client_id=$1 WHERE LOWER(email)=$2 AND global_client_id IS NULL',
        [gcId, emailLow]
      );

      const token = jwt.sign(
        { clientId: client.id, merchantId: userId, globalClientId: gcId, scope: 'client' },
        process.env.JWT_SECRET, { expiresIn: '30d' }
      );

      // Email de bienvenue filleul si inscription via lien de parrainage.
      // Check d'éligibilité COMPLET avant envoi (via resolveReferralForFilleul)
      // pour ne pas promettre une remise qu'on refusera : self-referral, quota,
      // déjà-servi… Non-bloquant : setImmediate, try/catch interne, l'envoi se
      // fait après res.json().
      const incomingRef = String(req.body?.referral_code || '').trim().toUpperCase();
      if (incomingRef) {
        setImmediate(async () => {
          try {
            const { resolveReferralForFilleul } = require('../referrals');
            const resolved = await resolveReferralForFilleul(userId, incomingRef, emailLow, 0);
            if (!resolved.ok) return; // silencieux — UI front affichera déjà l'alerte
            const { rows: biz } = await pool.query(
              'SELECT business_name FROM users WHERE id=$1', [userId]
            );
            await sendReferralWelcome({
              to:           emailLow,
              filleulName:  first_name,
              businessName: biz[0]?.business_name || 'votre commerçant',
              code:         incomingRef,
              type:         resolved.filleul_type,
              value:        resolved.filleul_value,
            });
          } catch (e) { console.warn('[referral welcome mail]', e.message); }
        });
      }

      res.json({ ok: true, token, client: { ...client, has_global_account: true } });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ── Quick register via QR code ────────────────────────────────────────────
  // Flow : client scan QR → /j/:slug → /book/:slug/auth?quick=1 → formulaire
  // court (prénom + téléphone) → POST ici. Objectif : fiche créée en < 15s pour
  // que le commerçant encaisse. Idempotent sur (user_id, phone_normalized) :
  // re-scan du même QR par le même tel renvoie le même compte (pas de doublon).
  // Email synthétique `qr-<phoneDigits>-<rand>@qr.flowia.local` pour rester
  // compatible avec le schéma client_accounts (email NOT NULL + UNIQUE par
  // marchand). Password bcrypt random (inutilisable au login classique).
  router.post('/:slug/client/quick-register', async (req, res) => {
    try {
      const { rows: biz } = await pool.query(
        'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE', [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const userId = biz[0].user_id;

      const first = String(req.body?.first_name || '').trim();
      const last  = String(req.body?.last_name  || '').trim();
      const phoneRawInput = String(req.body?.phone || '').trim();
      if (!first) return res.status(400).json({ error: 'Prénom requis.' });
      if (first.length > 100) return res.status(400).json({ error: 'Prénom trop long.' });
      if (last.length  > 100) return res.status(400).json({ error: 'Nom trop long.' });

      // RGPD commit 20 : validation libphonenumber-js (remplace l'ancienne
      // validation custom basée sur longueur/répétitions). Anti-bot conservé
      // sur la version digits-only (séquences évidentes).
      const phoneCheck = validatePhone(phoneRawInput, { required: true });
      if (!phoneCheck.valid) {
        return res.status(400).json({
          error: phoneCheck.error === 'PHONE_REQUIRED' ? 'Téléphone requis.' : 'Numéro de téléphone invalide pour le pays.',
          code:  phoneCheck.error,
        });
      }
      const phoneRaw  = phoneCheck.raw;
      const phoneE164 = phoneCheck.e164;
      const phoneDigits = phoneE164.replace(/\D/g, '');
      if (/^(\d)\1+$/.test(phoneDigits) || phoneDigits === '0123456789' || phoneDigits === '9876543210')
        return res.status(400).json({ error: 'Téléphone invalide.' });

      // Idempotence : retrouver fiche existante pour ce marchand via téléphone
      // E.164 (priorité) ou fallback sur digits-only de l'ancien champ phone.
      const { rows: existing } = await pool.query(
        `SELECT id, email, first_name, last_name, phone, phone_e164, birth_date, postal_code, city, global_client_id
         FROM client_accounts
         WHERE user_id=$1
           AND (phone_e164 = $2
                OR regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = $3)
         LIMIT 1`,
        [userId, phoneE164, phoneDigits]
      );

      // Audit Z : opt-in marketing explicite (par défaut FALSE même en QR,
      // le commerçant devra inviter le client à opter-in plus tard si besoin).
      const optIn = req.body?.marketing_opt_in === true || req.body?.marketing_opt_in === 'true';

      // Commit 24a : birth_date optionnelle (YYYY-MM-01).
      const birthCheck = parseBirthDate(req.body?.birth_date);
      if (!birthCheck.valid) {
        return res.status(400).json({ error: 'Date de naissance invalide.', code: 'BIRTH_DATE_INVALID' });
      }
      const bd = birthCheck.value;

      let client;
      if (existing.length) {
        // Re-scan : on peut mettre à jour l'opt-in si le client nous l'a cochée
        // cette fois. Jamais le décocher silencieusement (respect choix user).
        if (optIn) {
          await pool.query(
            `UPDATE client_accounts SET marketing_opt_in = TRUE, marketing_opt_in_at = NOW()
               WHERE id=$1 AND marketing_opt_in = FALSE`,
            [existing[0].id]
          ).catch(() => {});
        }
        // Si la fiche existante n'a pas de birth_date et que le client en
        // fournit une au re-scan, on l'enregistre (sans écraser l'existant).
        if (bd) {
          await pool.query(
            `UPDATE client_accounts SET birth_date=$2 WHERE id=$1 AND birth_date IS NULL`,
            [existing[0].id, bd]
          ).catch(() => {});
        }
        client = existing[0];
      } else {
        const rand  = Math.random().toString(36).slice(2, 10);
        const email = `qr-${phoneDigits}-${rand}@qr.flowia.local`;
        const hash  = await bcrypt.hash(rand + Date.now(), 10);
        const { rows } = await pool.query(
          `INSERT INTO client_accounts
             (user_id, email, password_hash, first_name, last_name, phone, phone_e164, birth_date, source, marketing_opt_in, marketing_opt_in_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'qr',$9, CASE WHEN $9 THEN NOW() ELSE NULL END)
           RETURNING id, email, first_name, last_name, phone, phone_e164, birth_date, postal_code, city, global_client_id`,
          [userId, email, hash, first, last || '', phoneRaw, phoneE164, bd, optIn]
        );
        client = rows[0];
      }

      const token = jwt.sign(
        { clientId: client.id, merchantId: userId, globalClientId: client.global_client_id || null, scope: 'client' },
        process.env.JWT_SECRET, { expiresIn: '30d' }
      );
      res.json({ ok: true, token, client: { ...client, has_global_account: !!client.global_client_id } });
    } catch (e) { console.error('[quick-register]', e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // POST /:slug/client/login
  router.post('/:slug/client/login', async (req, res) => {
    try {
      const { rows: biz } = await pool.query(
        'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE', [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const userId  = biz[0].user_id;
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });

      const emailLow = email.toLowerCase().trim();

      // 1. Chercher le compte global — source de vérité pour le mot de passe
      //    Pas de filtre sur is_verified ni password_hash pour toujours avoir le hash le plus frais
      const { rows: gcRows } = await pool.query(
        'SELECT * FROM global_clients WHERE LOWER(email)=$1', [emailLow]
      );

      // 2. Chercher la fiche locale
      const { rows: localRows } = await pool.query(
        'SELECT * FROM client_accounts WHERE user_id=$1 AND LOWER(email)=$2', [userId, emailLow]
      );

      if (!gcRows.length && !localRows.length)
        return res.status(401).json({ error: 'Email introuvable.' });

      let valid = false;
      let gc    = gcRows[0] || null;
      let local = localRows[0] || null;

      // 3. Vérifier le mot de passe — global en priorité (hash toujours à jour après reset)
      if (gc?.password_hash) {
        valid = await bcrypt.compare(password, gc.password_hash);
      }
      // Fallback : mot de passe local (ancien compte sans compte global)
      if (!valid && local?.password_hash) {
        valid = await bcrypt.compare(password, local.password_hash);
        // Si valide depuis local → synchroniser vers global
        if (valid && gc) {
          await pool.query(
            'UPDATE global_clients SET password_hash=$1, updated_at=NOW() WHERE id=$2',
            [local.password_hash, gc.id]
          ).catch(e => console.warn('[sync gc hash]', e.message));
        }
      }

      if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect.' });

      // Admin commit #4 : refus si le compte global est bloqué par un admin
      // FlowIA. Le blocage est cross-merchant (table global_clients), donc ce
      // client ne peut se connecter sur AUCUN salon FlowIA.
      if (gc?.is_blocked) return res.status(403).json({ error: 'Connexion refusee. Contactez le support FlowIA.' });

      // 4. Si fiche locale absente mais compte global existe → créer la fiche locale automatiquement
      if (!local && gc) {
        const { rows: created } = await pool.query(
          `INSERT INTO client_accounts (user_id, email, password_hash, first_name, last_name, phone, global_client_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (user_id, email) DO UPDATE SET
             global_client_id = EXCLUDED.global_client_id,
             first_name = EXCLUDED.first_name,
             last_name  = EXCLUDED.last_name
           RETURNING *`,
          [userId, emailLow, gc.password_hash, gc.first_name, gc.last_name||'', gc.phone||null, gc.id]
        );
        local = created[0];
      }

      // 5. Lier fiche locale au compte global si pas encore fait
      if (local && gc && !local.global_client_id) {
        await pool.query(
          'UPDATE client_accounts SET global_client_id=$1 WHERE id=$2',
          [gc.id, local.id]
        ).catch(() => {});
        local.global_client_id = gc.id;
      }

      // 6. Synchroniser le mot de passe dans global si login par compte local
      if (gc && local?.password_hash && !gc.password_hash) {
        await pool.query(
          'UPDATE global_clients SET password_hash=$1, is_verified=TRUE WHERE id=$2',
          [local.password_hash, gc.id]
        ).catch(() => {});
      }

      const token = jwt.sign(
        {
          clientId:       local.id,
          merchantId:     userId,
          globalClientId: gc?.id || null,
          scope:          'client',
        },
        process.env.JWT_SECRET, { expiresIn: '30d' }
      );

      res.json({
        ok: true, token,
        client: {
          id:               local.id,
          email:            local.email,
          first_name:       local.first_name,
          last_name:        local.last_name,
          phone:            local.phone,
          birth_date:       local.birth_date || null,
          postal_code:      local.postal_code || null,
          city:             local.city || null,
          global_client_id: local.global_client_id,
          has_global_account: !!local.global_client_id,
        },
      });
    } catch (e) { console.error('[login]', e); res.status(500).json({ error: 'Erreur serveur.' }); }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  GOOGLE OAUTH — Connexion client via compte Google
  //  Callback générique — le slug est passé dans le state OAuth
  //  (NOTE : le callback lui-même est dans backend/src/routes/auth.js)
  // ═══════════════════════════════════════════════════════════════════════
  // GET /:slug/client/auth/google — redirige vers Google
  // Query param optionnel ?ref=CODE → encodé dans le state pour que le callback
  // applique le même traitement parrainage que /client/register classique.
  router.get('/:slug/client/auth/google', (req, res) => {
    const { slug } = req.params;
    const ref = String(req.query.ref || '').trim().toUpperCase();
    // origin = window.location.origin de l'opener (transmis par le frontend).
    // Permet au callback de router le postMessage vers le bon sous-domaine
    // (ex: haircoifflille.fr vs commercant.haircoifflille.fr). Validé
    // côté callback contre l'allowlist FRONTEND_URL.
    const origin = String(req.query.origin || '').trim();
    // RGPD commit 17 : opt-in marketing transmis via le state OAuth.
    // m=1 → m1 (opté), m=0 ou absent → m0 (refusé, défaut safe).
    const marketingFlag = String(req.query.m || '').trim() === '1' ? 'm1' : 'm0';
    const clientId    = process.env.GOOGLE_CLIENT_ID;
    const BACKEND_URL = process.env.BACKEND_URL || 'https://flowia-backend.onrender.com';
    // Callback générique — 1 seule URL enregistrée chez Google
    const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;

    // state = slug | REFCODE? | origin? | m1|m0?
    // — séparateur | car ni slug ni code ne peuvent en contenir. Origine
    //   encodée URL pour supporter les caractères spéciaux. Le 4e segment
    //   (marketingFlag) est rétro-compatible : si absent, défaut = m0 (refus).
    const encodedOrigin = origin ? encodeURIComponent(origin) : '';
    const stateVal = `${slug}|${ref || ''}|${encodedOrigin}|${marketingFlag}`;

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         'openid email profile',
      access_type:   'online',
      prompt:        'select_account',
      state:         stateVal,
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  GOOGLE OAUTH — Finalisation de la création différée (RGPD commit 19)
  //
  //  Le callback /api/auth/google/callback détecte qu'aucun compte n'existe
  //  pour cet email/google_id et redirige le client vers une page de
  //  confirmation avec un JWT temporaire (scope=oauth_pending, exp=10min).
  //  Cette route concrétise la création UNIQUEMENT après que le client a
  //  coché les cases CGU + (optionnel) marketing.
  //
  //  Rate limiter strict 10/5min (cf. backend/src/index.js).
  // ═══════════════════════════════════════════════════════════════════════
  router.post('/:slug/oauth-google/finalize', async (req, res) => {
    try {
      const { rows: biz } = await pool.query(
        'SELECT user_id FROM booking_settings WHERE slug=$1 AND is_enabled=TRUE',
        [req.params.slug]
      );
      if (!biz.length) return res.status(404).json({ error: 'Commerce introuvable.' });
      const userId = biz[0].user_id;

      const { pre_token, contract_accepted, marketing_accepted, phone, birth_date } = req.body || {};
      if (!pre_token) {
        return res.status(401).json({ error: 'Session OAuth manquante.', code: 'OAUTH_PRE_TOKEN_INVALID' });
      }
      if (contract_accepted !== true) {
        return res.status(400).json({
          error: "L'acceptation des conditions générales et de la politique de confidentialité est obligatoire.",
          code: 'CGU_REQUIRED',
        });
      }
      // RGPD commit 20 : téléphone obligatoire + validé E.164.
      const phoneCheck = validatePhone(phone, { required: true });
      if (!phoneCheck.valid) {
        return res.status(400).json({
          error: phoneCheck.error === 'PHONE_REQUIRED' ? 'Téléphone requis.' : 'Numéro de téléphone invalide pour le pays.',
          code:  phoneCheck.error,
        });
      }
      const phoneRaw  = phoneCheck.raw;
      const phoneE164 = phoneCheck.e164;
      // Commit 24a : birth_date optionnelle (YYYY-MM-01).
      const birthCheck = parseBirthDate(birth_date);
      if (!birthCheck.valid) {
        return res.status(400).json({ error: 'Date de naissance invalide.', code: 'BIRTH_DATE_INVALID' });
      }
      const bd = birthCheck.value;

      // 1. Vérifier le pre_token (scope + expiration)
      let payload;
      try {
        payload = jwt.verify(pre_token, process.env.JWT_SECRET);
      } catch (e) {
        if (e.name === 'TokenExpiredError') {
          return res.status(410).json({
            error: 'Le délai de confirmation est dépassé. Recommencez la connexion Google.',
            code: 'OAUTH_PRE_TOKEN_EXPIRED',
          });
        }
        return res.status(401).json({ error: 'Session OAuth invalide.', code: 'OAUTH_PRE_TOKEN_INVALID' });
      }
      if (payload.scope !== 'oauth_pending') {
        return res.status(401).json({ error: 'Session OAuth invalide.', code: 'OAUTH_PRE_TOKEN_INVALID' });
      }
      if (payload.slug !== req.params.slug) {
        return res.status(401).json({ error: 'Session OAuth invalide pour ce commerce.', code: 'OAUTH_PRE_TOKEN_INVALID' });
      }

      const optIn   = marketing_accepted === true;
      const emailLow = String(payload.email || '').toLowerCase().trim();
      const consentIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;

      // 2. Idempotency : si entre-temps un compte global a été créé pour ce
      //    google_id ou cet email (race condition double-clic ou autre flow),
      //    on récupère le compte existant sans dupliquer.
      let gc = null;
      const { rows: existing } = await pool.query(
        'SELECT * FROM global_clients WHERE google_id=$1 OR LOWER(email)=$2 LIMIT 1',
        [payload.google_id, emailLow]
      );
      if (existing.length) {
        gc = existing[0];
        // Si le compte existait sans google_id (créé via email/password puis
        // login OAuth) on le rattache, sans toucher l'opt-in marketing existant.
        if (!gc.google_id) {
          await pool.query(
            'UPDATE global_clients SET google_id=$1, is_verified=TRUE, updated_at=NOW() WHERE id=$2',
            [payload.google_id, gc.id]
          );
          gc.google_id = payload.google_id;
        }
        // Commit 24a : enregistrer la birth_date si le compte global n'en avait
        // pas (ne pas écraser une valeur existante — l'utilisateur peut l'avoir
        // déjà saisie sur un autre commerçant).
        if (bd && !gc.birth_date) {
          await pool.query(
            'UPDATE global_clients SET birth_date=$1, updated_at=NOW() WHERE id=$2',
            [bd, gc.id]
          ).catch(() => {});
          gc.birth_date = bd;
        }
      } else {
        const { rows: created } = await pool.query(
          `INSERT INTO global_clients
             (email, google_id, first_name, last_name, phone, phone_e164, birth_date, avatar_url,
              is_verified, consent_at, consent_ip,
              marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,NOW(),$9,$10,
                   CASE WHEN $10 THEN NOW() ELSE NULL END,
                   CASE WHEN $10 THEN 'oauth_google' ELSE NULL END)
           RETURNING *`,
          [emailLow, payload.google_id, payload.first_name || '', payload.last_name || '',
           phoneRaw, phoneE164, bd, payload.picture || null, consentIp, optIn]
        );
        gc = created[0];
      }

      // 3. Créer la fiche locale chez ce commerçant.
      // Commit 24a : propage birth_date sur la fiche locale (utilisé par le
      // cron anniversaire qui lit client_accounts.birth_date).
      const { rows: localRows } = await pool.query(
        `INSERT INTO client_accounts
           (user_id, email, first_name, last_name, phone, phone_e164, birth_date,
            global_client_id, source,
            marketing_opt_in, marketing_opt_in_at, marketing_opt_in_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'google',$9,
                 CASE WHEN $9 THEN NOW() ELSE NULL END,
                 CASE WHEN $9 THEN 'oauth_google' ELSE NULL END)
         ON CONFLICT (user_id, email) DO UPDATE SET
           global_client_id = EXCLUDED.global_client_id,
           first_name = COALESCE(NULLIF(client_accounts.first_name,''), EXCLUDED.first_name),
           last_name  = COALESCE(NULLIF(client_accounts.last_name,''),  EXCLUDED.last_name),
           phone      = COALESCE(NULLIF(client_accounts.phone,''),      EXCLUDED.phone),
           phone_e164 = COALESCE(NULLIF(client_accounts.phone_e164,''), EXCLUDED.phone_e164),
           birth_date = COALESCE(client_accounts.birth_date, EXCLUDED.birth_date)
         RETURNING *`,
        [userId, emailLow, gc.first_name, gc.last_name || '',
         phoneRaw, phoneE164, gc.birth_date || bd, gc.id, optIn]
      );
      const local = localRows[0];

      // 3bis. Fan-out fiches locales pré-existantes du même email chez d'autres
      // commerçants (cohérent avec /client/register classique et OAuth callback).
      await pool.query(
        `UPDATE client_accounts SET global_client_id=$1, source='platform'
          WHERE LOWER(email)=LOWER($2) AND global_client_id IS NULL`,
        [gc.id, emailLow]
      ).catch(e => console.warn('[oauth finalize fan-out]', e.message));

      // 4. Welcome parrainage si ref_code présent dans le pre_token.
      if (payload.ref_code) {
        setImmediate(async () => {
          try {
            const { resolveReferralForFilleul } = require('../referrals');
            const resolved = await resolveReferralForFilleul(userId, payload.ref_code, emailLow, 0);
            if (!resolved.ok) return;
            const { rows: bizInfo } = await pool.query(
              'SELECT business_name FROM users WHERE id=$1', [userId]
            );
            await sendReferralWelcome({
              to:           emailLow,
              filleulName:  gc.first_name,
              businessName: bizInfo[0]?.business_name || 'votre commerçant',
              code:         payload.ref_code,
              type:         resolved.filleul_type,
              value:        resolved.filleul_value,
            });
          } catch (e) { console.warn('[oauth finalize referral welcome]', e.message); }
        });
      }

      // 5. JWT final scope='client' (cohérent avec le callback OAuth pour login).
      const token = jwt.sign(
        { clientId: local.id, merchantId: userId, globalClientId: gc.id, scope: 'client' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      const clientObj = {
        id: local.id, email: gc.email,
        first_name: gc.first_name, last_name: gc.last_name,
        phone: local.phone || null,
        birth_date: local.birth_date || gc.birth_date || null,
        avatar_url: gc.avatar_url || null,
        global_client_id: gc.id, has_global_account: true,
      };

      res.json({ token, client: clientObj });
    } catch (e) {
      console.error('[OAUTH FINALIZE]', e.message);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  });
};
