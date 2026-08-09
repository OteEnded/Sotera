// Client-side image prep for vision models: downscale + JPEG-encode to a data URL
// so a phone photo (~5MB) becomes ~150-300KB before it ever leaves the browser.
// 1568px matches the long-edge sweet spot most vision models are trained around.
// EVERY decodable format comes out as JPEG, so bmp/svg/avif/webp "just work"; formats
// the browser truly can't decode (HEIC on Chrome, TIFF) fail with a CLEAR message
// instead of a cryptic decode error or a silent drop.
// ⚠️ JPEG, NOT WebP (was WebP, 2026-07-22 fix): Ollama's vision pipeline (llama.cpp /
// stb_image) CANNOT decode WebP — a WebP image is silently dropped and the model
// "sees nothing" (reproduced: gemma4/qwen vision → "no image attached"). JPEG is decoded
// by every backend we target (Ollama, Anthropic, OpenAI). The vision capability probe
// used a PNG, so it falsely "confirmed" vision while real WebP uploads failed.
// The ORIGINAL format/name/size ride along as metadata (persisted in images_meta) so
// "what did the user actually upload" survives the conversion.

export type PreparedImage = {
  url: string   // data URL, JPEG (Ollama vision can't decode WebP — see header)
  orig: string  // original format, e.g. 'png', 'jpeg', 'svg', 'avif'
  name: string  // original filename
  bytes: number // original file size (pre-conversion)
}

// createImageBitmap rejects some formats an <img> can still render (notably SVG in
// Chromium) — fall back to an HTMLImageElement decode before giving up.
async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file)
  } catch { /* fall through to the <img> path */ }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('undecodable'))
      img.src = url
    })
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('undecodable')
    return img
  } catch {
    const hint = /\.(heic|heif)$/i.test(file.name)
      ? ' (iPhone HEIC — most browsers cannot read it)'
      : /\.tiff?$/i.test(file.name) ? ' (TIFF)' : ''
    throw new Error(`'${file.name}' — this image format isn't supported by your browser${hint}. Convert it to JPG or PNG and attach that instead.`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// 'image/svg+xml' -> 'svg', '.JPG' -> 'jpeg' — short lowercase tag for display/meta.
function originalFormat(file: File): string {
  const sub = (/^image\/([a-z0-9.+-]+)/i.exec(file.type || '')?.[1]
    || /\.([a-z0-9]+)$/i.exec(file.name)?.[1]
    || 'unknown').toLowerCase()
  return sub === 'svg+xml' ? 'svg' : sub === 'jpg' ? 'jpeg' : sub
}

export async function prepareImage(file: File, maxDim = 1568, quality = 0.85): Promise<PreparedImage> {
  const src = await decodeImage(file)
  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width
  const sh = 'naturalHeight' in src ? src.naturalHeight : src.height
  const scale = Math.min(1, maxDim / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  // white behind transparency — keeps the JPEG fallback identical and avoids
  // unreadable transparent images on dark chat backgrounds
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(src, 0, 0, w, h)
  if ('close' in src) src.close()
  // JPEG, not WebP — Ollama vision (llama.cpp/stb_image) can't decode WebP (silent drop).
  // JPEG is universally decoded; the white fill above keeps transparency from going black.
  const url = canvas.toDataURL('image/jpeg', quality)
  return { url, orig: originalFormat(file), name: file.name, bytes: file.size }
}

// Open a data-URL image in a new tab (browsers block top-level data: navigation,
// so it goes through a blob URL).
export function openDataUrl(dataUrl: string) {
  const [meta, b64] = dataUrl.split(',')
  // Defense-in-depth: opening a blob whose mime is text/html would run as same-origin
  // HTML (script) in the new tab. Callers only ever pass image data URLs, but clamp the
  // blob type to an image allow-list here regardless, so a stray/hostile mime can't execute.
  const raw = (/data:([^;]+)/.exec(meta)?.[1] || '').toLowerCase()
  const mime = /^image\/(png|jpe?g|webp|gif|bmp|avif)$/.test(raw) ? raw : 'image/png'
  const bytes = atob(b64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([arr], { type: mime }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
