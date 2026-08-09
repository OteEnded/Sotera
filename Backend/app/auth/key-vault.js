// Key vault — reversible encryption for API-key re-copy.
//
// Policy (Ote, 2026-07-03): raw keys stay ALWAYS copyable for convenience, but any copy
// after the first (the mint response) requires the user to re-enter their credentials.
// To support that, the raw key is stored encrypted at rest (AES-256-GCM) and decrypted
// only by POST /v1/admin/apikeys/:id/reveal after a fresh credential check.
//
// The cipher key derives from config `auth.keyEncryptionSecret` (falls back to
// `auth.session.secret`). Rotating that secret makes previously stored keys
// unrecoverable (auth still works — lookups use key_hash) — they'd need re-minting.
// System chat keys are exempt: their raw key is deliberately never stored.

import crypto from 'node:crypto'

const ALGO = 'aes-256-gcm'

function cipherKey(config) {
  const secret = config?.auth?.keyEncryptionSecret || config?.auth?.session?.secret
  if (!secret) return null // no secret configured -> store hash-only, reveal unavailable
  return crypto.createHash('sha256').update(String(secret)).digest() // 32 bytes
}

// -> "iv.tag.ciphertext" (base64url), or null when no secret is configured.
export function encryptRawKey(config, rawKey) {
  const key = cipherKey(config)
  if (!key || !rawKey) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(rawKey, 'utf8'), cipher.final()])
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`
}

// -> raw key string, or null (nothing stored / secret changed / tampered payload).
export function decryptRawKey(config, stored) {
  const key = cipherKey(config)
  if (!key || !stored) return null
  try {
    const [iv, tag, data] = String(stored).split('.')
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
