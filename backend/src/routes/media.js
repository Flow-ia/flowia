// routes/media.js
// Architecture media scalable — proxy transparent entre frontend et provider
// Le frontend n'accède JAMAIS directement aux URLs Cloudinary/S3/local
// Changer de provider = modifier uniquement ce fichier
const express = require('express');
const { pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// ── Helpers provider ──────────────────────────────────────────────────────────
const PROVIDER = process.env.MEDIA_PROVIDER || 'local'; // 'local' | 'cloudinary' | 's3'

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
  const fs   = require('fs');
  const fPath = require('path').join(process.cwd(), 'uploads', path);
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
  } catch (e) { res.status(404).json({ error: e.message }); }
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
  } catch (e) { res.status(404).json({ error: e.message }); }
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
  } catch (e) { res.status(404).json({ error: e.message }); }
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
  } catch (e) { res.status(404).json({ error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    const { v2: cld } = require('cloudinary');
    cld.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'daovpx82c',
      api_key:    process.env.CLOUDINARY_API_KEY    || '656558537324395',
      api_secret: process.env.CLOUDINARY_API_SECRET || 'UpTgNOyLYKXPD3vWQ0VncEHEkOQ',
      secure: true,
    });
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

// Pour local : multer diskStorage. Pour cloudinary : memoryStorage puis upload stream
const storage = PROVIDER === 'cloudinary'
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont acceptées'));
  },
});

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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/media/commercant/logo — Upload logo commerçant (remplace l'ancien)
router.post('/commercant/logo', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise' });
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
  } catch (e) { console.error('[POST logo]', e); res.status(500).json({ error: e.message }); }
});

// POST /api/media/commercant/cover — Ajouter une photo galerie (max 4)
router.post('/commercant/cover', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise' });
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
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/media/service/:serviceId/image — Image d'un service
// Architecture : flowia/commercant_${userId}/services/${serviceId} (1 image par service)
router.post('/service/:serviceId/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image requise' });
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
  } catch (e) { console.error('[POST service/image]', e); res.status(500).json({ error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
