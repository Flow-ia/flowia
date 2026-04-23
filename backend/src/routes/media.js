// routes/media.js
// Architecture media scalable — proxy transparent entre frontend et provider
// Le frontend n'accède JAMAIS directement aux URLs Cloudinary/S3/local
// Changer de provider = modifier uniquement ce fichier
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// ── Helpers provider ──────────────────────────────────────────────────────────
// Détection auto : si MEDIA_PROVIDER non défini mais que les 3 credentials
// Cloudinary sont présents, on utilise cloudinary (cas prod Render typique).
// Sinon fallback 'local' (dev). Avant : MEDIA_PROVIDER manquant → 'local' →
// upload sur disque éphémère Render → fichiers perdus au redéploy + jamais
// écrits sur Cloudinary. Ici : dès que les credentials sont là, on les utilise.
function resolveProvider() {
  const explicit = (process.env.MEDIA_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'cloudinary' || explicit === 's3' || explicit === 'local') return explicit;
  if (process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET) {
    return 'cloudinary';
  }
  return 'local';
}
const PROVIDER = resolveProvider();
console.log('[MEDIA] provider =', PROVIDER);

async function fetchImageBuffer(path, provider) {
  if (provider === 'cloudinary') {
    // Cloudinary : path = public_id (ex: "flowia/commercant_123/profile")
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const https = require('https');
    const url = `https://res.cloudinary.com/${cloudName}/image/upload/${path}`;
    const buf = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode !== 200) { reject(new Error('Image introuvable')); return; }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
    return { buf, ct: 'image/jpeg' };
  }
  if (provider === 's3') {
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: process.env.AWS_REGION });
    const res = await s3.send(new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: path,
    }));
    const chunks = [];
    for await (const c of res.Body) chunks.push(c);
    const buf = Buffer.concat(chunks);
    return { buf, ct: res.ContentType || 'image/jpeg' };
  }
  // local — path relatif dans uploads/
  const fs    = require('fs');
  const pMod  = require('path');
  const root  = pMod.join(process.cwd(), 'uploads');
  const fPath = pMod.resolve(root, path);
  // Anti path-traversal : un path DB malicieux "../../etc/passwd" résoudrait
  // hors de uploads/ et permettrait de lire n'importe quel fichier serveur.
  // resolve + startsWith(root + sep) bloque le traversal (plus robuste que
  // join() qui normalise mais n'empêche pas la sortie du répertoire).
  if (!fPath.startsWith(root + pMod.sep) && fPath !== root) {
    throw new Error('Chemin invalide');
  }
  if (!fs.existsSync(fPath)) throw new Error('Image introuvable');
  const buf = fs.readFileSync(fPath);
  const ext = path.split('.').pop().toLowerCase();
  const ct  = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif' }[ext] || 'image/jpeg';
  return { buf, ct };
}

// ── Middleware auth optionnel pour les routes publiques ───────────────────────
function optionalAuth(req, res, next) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    return authMiddleware(req, res, next);
  }
  next();
}

// ── GET /api/media/commercant/:userId/profile ─────────────────────────────────
// Retourne la photo de profil du commerçant (accessible publiquement)
router.get('/commercant/:userId/profile', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT path, provider FROM media WHERE user_id=$1 AND type=$2 ORDER BY created_at DESC LIMIT 1',
      [req.params.userId, 'profile']
    );
    if (!rows.length) return res.status(404).json({ error: 'Aucune image' });
    const { buf, ct } = await fetchImageBuffer(rows[0].path, rows[0].provider);
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (e) { res.status(404).json({ error: 'Image introuvable' }); }
});

// ── GET /api/media/commercant/:userId/logo ───────────────────────────────────
// Logo du commerçant (accessible publiquement)
router.get('/commercant/:userId/logo', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT path, provider FROM media WHERE user_id=$1 AND type=$2 ORDER BY created_at DESC LIMIT 1',
      [req.params.userId, 'logo']
    );
    if (!rows.length) return res.status(404).json({ error: 'Aucune image' });
    const { buf, ct } = await fetchImageBuffer(rows[0].path, rows[0].provider);
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (e) { res.status(404).json({ error: 'Image introuvable' }); }
});

// ── GET /api/media/commercant/:userId/cover/:imageId ─────────────────────────
// Photo de galerie du commerçant
router.get('/commercant/:userId/cover/:imageId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT path, provider FROM media WHERE id=$1 AND user_id=$2 AND type=$3',
      [req.params.imageId, req.params.userId, 'cover']
    );
    if (!rows.length) return res.status(404).json({ error: 'Image introuvable' });
    const { buf, ct } = await fetchImageBuffer(rows[0].path, rows[0].provider);
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (e) { res.status(404).json({ error: 'Image introuvable' }); }
});

// ── GET /api/media/service/:serviceId/image ───────────────────────────────────
// Photo d'un service
router.get('/service/:serviceId/image', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT path, provider FROM media WHERE ref_id=$1 AND type=$2 ORDER BY created_at DESC LIMIT 1',
      [req.params.serviceId, 'service']
    );
    if (!rows.length) return res.status(404).json({ error: 'Aucune image' });
    const { buf, ct } = await fetchImageBuffer(rows[0].path, rows[0].provider);
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (e) { res.status(404).json({ error: 'Image introuvable' }); }
});

// ── GET /api/media/employee/:employeeId/image ────────────────────────────────
// Photo d'un employé (accessible publiquement sur le site de réservation)
router.get('/employee/:employeeId/image', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT path, provider FROM media WHERE ref_id=$1 AND type=$2 ORDER BY created_at DESC LIMIT 1',
      [req.params.employeeId, 'employee']
    );
    if (!rows.length) return res.status(404).json({ error: 'Aucune image' });
    const { buf, ct } = await fetchImageBuffer(rows[0].path, rows[0].provider);
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (e) { res.status(404).json({ error: 'Image introuvable' }); }
});

// ── Métadonnées (pour le frontend savoir si une image existe) ─────────────────
// GET /api/media/commercant/:userId/meta
// Le frontend construit les URLs via mediaApi.logoUrl() etc. + ?v=version
router.get('/commercant/:userId/meta', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, ref_id, sort_order, created_at FROM media WHERE user_id=$1 ORDER BY type, sort_order ASC`,
      [req.params.userId]
    );
    const logo    = rows.find(r => r.type === 'logo');
    const profile = rows.find(r => r.type === 'profile');
    const covers  = rows.filter(r => r.type === 'cover');
    const ver = (r) => r ? new Date(r.created_at).getTime() : 0;
    res.json({
      logo_id:         logo?.id    || null,
      logo_version:    ver(logo),
      profile_id:      profile?.id || null,
      profile_version: ver(profile),
      cover_list:      covers.map(c => ({ id: c.id, version: ver(c), sort_order: c.sort_order })),
    });
  } catch (e) { console.error('[MEDIA]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Routes protégées (admin)
// ═══════════════════════════════════════════════════════════════════════════════
router.use(authMiddleware);

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Storage adaptatif selon provider ──────────────────────────────────────────
let cloudinaryInst = null;
function getCloudinary() {
  if (!cloudinaryInst) {
    // SECRETS : jamais de fallback hardcodé. Avant, les clés Cloudinary
    // étaient en dur dans le source -> compromission publique via le repo
    // GitHub. Credentials à rotater dans le dashboard Cloudinary (les
    // anciennes sont dans l'historique git).
    const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
    const api_key    = process.env.CLOUDINARY_API_KEY;
    const api_secret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud_name || !api_key || !api_secret) {
      throw new Error('Cloudinary non configuré : définir CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.');
    }
    const { v2: cld } = require('cloudinary');
    cld.config({ cloud_name, api_key, api_secret, secure: true });
    cloudinaryInst = cld;
  }
  return cloudinaryInst;
}

// Upload vers le provider configuré — retourne le path à stocker en BDD
async function uploadToProvider(filePath, folder) {
  if (PROVIDER === 'cloudinary') {
    const cld = getCloudinary();
    const result = await cld.uploader.upload(filePath, {
      folder: `flowia/${folder}`,
      resource_type: 'image',
      quality: 'auto',
      fetch_format: 'auto',
    });
    return result.public_id; // ex: "flowia/commercant_xxx/profile"
  }
  // local : retourner le filename tel quel
  return path.basename(filePath);
}

// Supprimer une ressource chez le provider (cloudinary destroy OU unlink local)
async function deleteFromProvider(resourcePath, provider) {
  if (!resourcePath) return;
  try {
    if (provider === 'cloudinary') {
      const cld = getCloudinary();
      await cld.uploader.destroy(resourcePath, { resource_type: 'image', invalidate: true });
    } else if (provider === 'local') {
      const fPath = path.join(uploadDir, resourcePath);
      if (fs.existsSync(fPath)) fs.unlinkSync(fPath);
    }
  } catch (e) {
    console.warn('[deleteFromProvider]', provider, resourcePath, e.message);
  }
}

// Whitelist stricte MIME + extensions (avant : `startsWith('image/')`
// laissait passer image/svg+xml -> XSS si servi inline, et image/heic
// cassait les libs image côté client).
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Pour local : multer diskStorage. Pour cloudinary : memoryStorage puis upload stream
const storage = PROVIDER === 'cloudinary'
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        // Normalise l'extension vers une valeur whitelistée (fileFilter
        // a déjà validé) — évite d'écrire un `file.exe.jpg` avec l'extension
        // originale préservée.
        const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg';
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`);
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Type d\'image non autorisé (jpeg/png/webp/gif).'));
    }
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new Error('Extension de fichier non autorisée.'));
    }
    cb(null, true);
  },
});

// Magic-bytes : le MIME client est déclaratif et falsifiable. On vérifie
// que les premiers octets du fichier correspondent à un format image réel.
// Lance une Error qui sera capturée par le handler -> 400.
const MAGIC = [
  { name: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { name: 'image/png',  bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { name: 'image/gif',  bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP : RIFF....WEBP (octets 0-3 = RIFF, 8-11 = WEBP)
];
function matchPrefix(buf, bytes) {
  if (buf.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[i] !== bytes[i]) return false;
  return true;
}
function isValidImageBuffer(buf) {
  if (!buf || buf.length < 12) return false;
  for (const m of MAGIC) if (matchPrefix(buf, m.bytes)) return true;
  // WebP
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' &&
      buf.slice(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
}
function assertImageBuffer(buf) {
  if (!isValidImageBuffer(buf))
    throw Object.assign(new Error('Fichier non reconnu comme image valide.'), { _status: 400 });
}
// Lit le début du fichier (cloudinary : buffer mémoire / local : disque)
function getUploadBuffer(req) {
  if (req.file.buffer) return req.file.buffer; // memoryStorage
  return fs.readFileSync(req.file.path);       // diskStorage
}

// Helper : après upload multer, persister vers provider et retourner le path final
async function persistUpload(req, folder) {
  if (PROVIDER === 'cloudinary') {
    const cld = getCloudinary();
    return await new Promise((resolve, reject) => {
      const stream = cld.uploader.upload_stream(
        { folder: `flowia/${folder}`, resource_type: 'image', quality: 'auto', fetch_format: 'auto' },
        (err, result) => err ? reject(err) : resolve(result.public_id)
      );
      stream.end(req.file.buffer);
    });
  }
  return req.file.filename; // local — fichier déjà sur disque
}

// POST /api/media/commercant/profile — Upload photo de profil
router.post('/commercant/profile', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise' });
    if (!isValidImageBuffer(getUploadBuffer(req)))
      return res.status(400).json({ error: 'Fichier non reconnu comme image valide.' });
    // 1. Récupérer l'ancien profil (pour cleanup provider)
    const { rows: old } = await pool.query(
      'SELECT path, provider FROM media WHERE user_id=$1 AND type=$2',
      [req.user.userId, 'profile']
    );
    // 2. Upload nouveau
    const filePath = await persistUpload(req, `commercant_${req.user.userId}`);
    // 3. Cleanup ancien (provider + DB)
    for (const m of old) await deleteFromProvider(m.path, m.provider);
    await pool.query('DELETE FROM media WHERE user_id=$1 AND type=$2', [req.user.userId, 'profile']);
    // 4. Insert nouvelle référence
    const { rows } = await pool.query(
      'INSERT INTO media (user_id, type, path, provider) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.user.userId, 'profile', filePath, PROVIDER]
    );
    res.json({ id: rows[0].id, url: `/api/media/commercant/${req.user.userId}/profile` });
  } catch (e) { console.error('[MEDIA]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/media/commercant/logo — Upload logo commerçant (remplace l'ancien)
router.post('/commercant/logo', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise' });
    if (!isValidImageBuffer(getUploadBuffer(req)))
      return res.status(400).json({ error: 'Fichier non reconnu comme image valide.' });
    const { rows: old } = await pool.query(
      'SELECT path, provider FROM media WHERE user_id=$1 AND type=$2',
      [req.user.userId, 'logo']
    );
    const filePath = await persistUpload(req, `commercant_${req.user.userId}/logo`);
    for (const m of old) await deleteFromProvider(m.path, m.provider);
    await pool.query('DELETE FROM media WHERE user_id=$1 AND type=$2', [req.user.userId, 'logo']);
    const { rows } = await pool.query(
      'INSERT INTO media (user_id, type, path, provider) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.user.userId, 'logo', filePath, PROVIDER]
    );
    res.json({ id: rows[0].id, url: `/api/media/commercant/${req.user.userId}/logo` });
  } catch (e) { console.error('[POST logo]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/media/commercant/cover — Ajouter une photo galerie (max 4)
router.post('/commercant/cover', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise' });
    if (!isValidImageBuffer(getUploadBuffer(req)))
      return res.status(400).json({ error: 'Fichier non reconnu comme image valide.' });
    const { rows: existing } = await pool.query(
      'SELECT id FROM media WHERE user_id=$1 AND type=$2', [req.user.userId, 'cover']
    );
    if (existing.length >= 4) return res.status(400).json({ error: 'Maximum 4 photos de galerie' });
    const filePath = await persistUpload(req, `commercant_${req.user.userId}/covers`);
    const { rows } = await pool.query(
      'INSERT INTO media (user_id, type, path, provider, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.user.userId, 'cover', filePath, PROVIDER, existing.length]
    );
    res.json({ id: rows[0].id, url: `/api/media/commercant/${req.user.userId}/cover/${rows[0].id}` });
  } catch (e) { console.error('[MEDIA]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// DELETE /api/media/:id — Supprimer une image
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM media WHERE id=$1 AND user_id=$2 RETURNING path, provider',
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Image introuvable' });
    await deleteFromProvider(rows[0].path, rows[0].provider);
    res.json({ ok: true });
  } catch (e) { console.error('[MEDIA]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/media/service/:serviceId/image — Image d'un service
// Architecture : flowia/commercant_${userId}/services/${serviceId} (1 image par service)
router.post('/service/:serviceId/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise' });
    if (!isValidImageBuffer(getUploadBuffer(req)))
      return res.status(400).json({ error: 'Fichier non reconnu comme image valide.' });
    const { rows: svc } = await pool.query(
      'SELECT id FROM booking_services WHERE id=$1 AND user_id=$2',
      [req.params.serviceId, req.user.userId]
    );
    if (!svc.length) return res.status(403).json({ error: 'Service introuvable' });
    // 1. Anciennes images (pour cleanup provider)
    const { rows: old } = await pool.query(
      'SELECT path, provider FROM media WHERE ref_id=$1 AND type=$2',
      [req.params.serviceId, 'service']
    );
    // 2. Upload nouveau (folder isolé par commerçant+service)
    const filePath = await persistUpload(req, `commercant_${req.user.userId}/services/${req.params.serviceId}`);
    // 3. Cleanup ancien (provider + DB) — évite les orphelins Cloudinary
    for (const m of old) await deleteFromProvider(m.path, m.provider);
    await pool.query('DELETE FROM media WHERE ref_id=$1 AND type=$2', [req.params.serviceId, 'service']);
    // 4. Insert nouvelle référence
    const { rows } = await pool.query(
      'INSERT INTO media (user_id, type, ref_id, path, provider) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.user.userId, 'service', req.params.serviceId, filePath, PROVIDER]
    );
    res.json({ id: rows[0].id, url: `/api/media/service/${req.params.serviceId}/image` });
  } catch (e) { console.error('[POST service/image]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// POST /api/media/employee/:employeeId/image — Image d'un employé
// Architecture : flowia/commercant_${userId}/employees/${employeeId}
router.post('/employee/:employeeId/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise' });
    if (!isValidImageBuffer(getUploadBuffer(req)))
      return res.status(400).json({ error: 'Fichier non reconnu comme image valide.' });
    const { rows: emp } = await pool.query(
      'SELECT id FROM employees WHERE id=$1 AND user_id=$2',
      [req.params.employeeId, req.user.userId]
    );
    if (!emp.length) return res.status(403).json({ error: 'Employé introuvable' });
    // 1. Anciennes images (pour cleanup provider)
    const { rows: old } = await pool.query(
      'SELECT path, provider FROM media WHERE ref_id=$1 AND type=$2',
      [req.params.employeeId, 'employee']
    );
    // 2. Upload nouveau (folder isolé par commerçant+employé)
    const filePath = await persistUpload(req, `commercant_${req.user.userId}/employees/${req.params.employeeId}`);
    // 3. Cleanup ancien (provider + DB)
    for (const m of old) await deleteFromProvider(m.path, m.provider);
    await pool.query('DELETE FROM media WHERE ref_id=$1 AND type=$2', [req.params.employeeId, 'employee']);
    // 4. Insert nouvelle référence
    const { rows } = await pool.query(
      'INSERT INTO media (user_id, type, ref_id, path, provider) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [req.user.userId, 'employee', req.params.employeeId, filePath, PROVIDER]
    );
    res.json({ id: rows[0].id, url: `/api/media/employee/${req.params.employeeId}/image` });
  } catch (e) { console.error('[POST employee/image]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// DELETE /api/media/employee/:employeeId/image — Supprimer l'image d'un employé
router.delete('/employee/:employeeId/image', async (req, res) => {
  try {
    const { rows: emp } = await pool.query(
      'SELECT id FROM employees WHERE id=$1 AND user_id=$2',
      [req.params.employeeId, req.user.userId]
    );
    if (!emp.length) return res.status(403).json({ error: 'Employé introuvable' });
    const { rows } = await pool.query(
      'DELETE FROM media WHERE ref_id=$1 AND type=$2 AND user_id=$3 RETURNING path, provider',
      [req.params.employeeId, 'employee', req.user.userId]
    );
    for (const m of rows) await deleteFromProvider(m.path, m.provider);
    res.json({ ok: true });
  } catch (e) { console.error('[MEDIA]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

// DELETE /api/media/service/:serviceId/image — Supprimer l'image d'un service
router.delete('/service/:serviceId/image', async (req, res) => {
  try {
    const { rows: svc } = await pool.query(
      'SELECT id FROM booking_services WHERE id=$1 AND user_id=$2',
      [req.params.serviceId, req.user.userId]
    );
    if (!svc.length) return res.status(403).json({ error: 'Service introuvable' });
    const { rows } = await pool.query(
      'DELETE FROM media WHERE ref_id=$1 AND type=$2 AND user_id=$3 RETURNING path, provider',
      [req.params.serviceId, 'service', req.user.userId]
    );
    for (const m of rows) await deleteFromProvider(m.path, m.provider);
    res.json({ ok: true });
  } catch (e) { console.error('[MEDIA]', e.message); res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;
