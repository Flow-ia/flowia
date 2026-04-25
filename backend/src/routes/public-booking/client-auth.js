const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { pool } = require('../../db');
const { sendReferralWelcome } = require('../../utils/email');

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
      // Audit Z : opt-in marketing explicite. Par défaut FALSE.
      const optIn = marketing_opt_in === true || marketing_opt_in === 'true';

      const emailLow = email.toLowerCase().trim();
      // birth_date optionnelle : accepte YYYY-MM-DD OU YYYY-MM (= 1er du mois)
      let bd = null;
      if (typeof birth_date === 'string' && birth_date.trim()) {
        const s = birth_date.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s))      bd = s;
        else if (/^\d{4}-\d{2}$/.test(s))       bd = s + '-01';
      }

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
             birth_date=COALESCE($6, birth_date),
             updated_at=NOW()
           WHERE LOWER(email)=$1 RETURNING id`,
          [emailLow, hash, first_name, last_name||'', phone||'', bd]
        );
        gcId = updated[0].id;
      } else {
        // Nouveau compte global
        const consentIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
        const { rows: newGc } = await pool.query(
          `INSERT INTO global_clients
             (email, password_hash, first_name, last_name, phone, birth_date, is_verified, consent_at, consent_ip, marketing_opt_in, marketing_opt_in_at)
           VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW(),$7,$8, CASE WHEN $8 THEN NOW() ELSE NULL END) RETURNING id`,
          [emailLow, hash, first_name, last_name||'', phone||null, bd, consentIp, optIn]
        );
        gcId = newGc[0].id;
      }

      // 4. Créer la fiche locale liée au compte global
      const { rows } = await pool.query(
        `INSERT INTO client_accounts (user_id, email, password_hash, first_name, last_name, phone, birth_date, global_client_id, marketing_opt_in, marketing_opt_in_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $9 THEN NOW() ELSE NULL END)
         ON CONFLICT (user_id, email) DO UPDATE SET
           global_client_id = EXCLUDED.global_client_id,
           password_hash    = EXCLUDED.password_hash,
           birth_date       = COALESCE(EXCLUDED.birth_date, client_accounts.birth_date),
           marketing_opt_in = EXCLUDED.marketing_opt_in,
           marketing_opt_in_at = CASE WHEN EXCLUDED.marketing_opt_in THEN NOW() ELSE NULL END
         RETURNING id, email, first_name, last_name, phone, birth_date, postal_code, city, global_client_id, marketing_opt_in`,
        [userId, emailLow, hash, first_name, last_name||'', phone||null, bd, gcId, optIn]
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
      const phoneRaw = String(req.body?.phone || '').trim();
      if (!first) return res.status(400).json({ error: 'Prénom requis.' });
      if (first.length > 100) return res.status(400).json({ error: 'Prénom trop long.' });
      if (last.length  > 100) return res.status(400).json({ error: 'Nom trop long.' });

      // Normalisation téléphone : garder + et chiffres, puis ne conserver que les
      // chiffres pour la clé d'idempotence. +33 6 12… et 06 12… restent distincts.
      const phoneDigits = phoneRaw.replace(/\D/g, '');
      if (phoneDigits.length < 6 || phoneDigits.length > 20)
        return res.status(400).json({ error: 'Téléphone invalide.' });
      // Anti-bot : rejet des numéros manifestement fake (tous chiffres
      // identiques : 0000000000, 1111111111, séquences 0123456789 /
      // 9876543210). Sans ce garde, un bot peut créer des fiches variées en
      // changeant 1 digit (l'idempotence sur phone n'aide que sur répétition
      // exacte).
      if (/^(\d)\1+$/.test(phoneDigits) || phoneDigits === '0123456789' || phoneDigits === '9876543210')
        return res.status(400).json({ error: 'Téléphone invalide.' });

      // Idempotence : retrouver fiche existante pour ce marchand via téléphone
      // (comparaison sur chiffres uniquement côté SQL via regexp_replace).
      const { rows: existing } = await pool.query(
        `SELECT id, email, first_name, last_name, phone, birth_date, postal_code, city, global_client_id
         FROM client_accounts
         WHERE user_id=$1 AND regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = $2
         LIMIT 1`,
        [userId, phoneDigits]
      );

      // Audit Z : opt-in marketing explicite (par défaut FALSE même en QR,
      // le commerçant devra inviter le client à opter-in plus tard si besoin).
      const optIn = req.body?.marketing_opt_in === true || req.body?.marketing_opt_in === 'true';

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
        client = existing[0];
      } else {
        const rand  = Math.random().toString(36).slice(2, 10);
        const email = `qr-${phoneDigits}-${rand}@qr.flowia.local`;
        const hash  = await bcrypt.hash(rand + Date.now(), 10);
        const { rows } = await pool.query(
          `INSERT INTO client_accounts
             (user_id, email, password_hash, first_name, last_name, phone, source, marketing_opt_in, marketing_opt_in_at)
           VALUES ($1,$2,$3,$4,$5,$6,'qr',$7, CASE WHEN $7 THEN NOW() ELSE NULL END)
           RETURNING id, email, first_name, last_name, phone, birth_date, postal_code, city, global_client_id`,
          [userId, email, hash, first, last || '', phoneRaw, optIn]
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
};
