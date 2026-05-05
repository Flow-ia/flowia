// utils/tokenCrypto.js — Chiffrement symetrique AES-256-GCM pour les
// tokens OAuth tiers (Google Calendar tokens etc.) stockes en DB.
//
// Pourquoi : un acces lecture DB (breach, backup vole) ne doit pas
// permettre d'utiliser directement les tokens pour pousser des events
// dans l'agenda Google des merchants. Sans chiffrement, un access_token
// vole donne 1h de droits Google API (refresh_token = pire, illimite).
//
// Cle : env CALENDAR_TOKEN_KEY = string base64 ou hex 32 octets (256 bits).
// Generer : `openssl rand -base64 32` puis poser sur Render.

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;   // 96 bits, recommande GCM
const TAG_LEN = 16;  // 128 bits

let cachedKey = null;
function getKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.CALENDAR_TOKEN_KEY;
  if (!raw) {
    throw new Error('CALENDAR_TOKEN_KEY env manquante (32 octets base64/hex)');
  }
  // Accepte base64 ou hex. base64 fait 44 chars padded, hex fait 64 chars.
  let buf;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    buf = Buffer.from(raw, 'hex');
  } else {
    buf = Buffer.from(raw, 'base64');
  }
  if (buf.length !== 32) {
    throw new Error(`CALENDAR_TOKEN_KEY doit faire 32 octets (recu ${buf.length})`);
  }
  cachedKey = buf;
  return cachedKey;
}

// Encode : iv (12B) || ciphertext || authTag (16B), base64.
function encrypt(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString('base64');
}

function decrypt(payload) {
  if (!payload) return null;
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Payload chiffre invalide (trop court)');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString('utf8');
}

module.exports = { encrypt, decrypt };
