// File-attachment text extraction — turns uploaded documents into prompt text.
// Office/PDF files arrive as base64 data URLs and are resolved server-side;
// plain-text files are read in the browser and arrive as text already.
//
//   .pdf                 -> pdf-parse (PDFParse.getText)
//   .docx                -> mammoth.extractRawText
//   .xlsx / .xls / .ods  -> SheetJS -> CSV per sheet
//   anything textual     -> passed through as-is
//
// Nothing is written to disk or executed — bytes are parsed in-memory to extract text,
// then discarded (only the text is persisted). The threat here is therefore NOT a virus
// running, but malicious bytes attacking the PARSER or exhausting resources, so before
// any parser sees the buffer we:
//   1. cap the decoded size (the client cap is bypassable; this one isn't),
//   2. check magic bytes — a file whose contents don't match its claimed type is rejected
//      before it reaches a parser (a fake ".pdf" never touches pdf-parse),
//   3. guard against ZIP decompression bombs (docx/xlsx/ods are ZIPs) by reading the
//      central directory's DECLARED uncompressed sizes without decompressing anything,
//   4. run the ACTUAL parsing in a forked CHILD PROCESS (extract-worker.js) with a hard
//      SIGKILL timeout — a synchronous parse hang or parser crash dies in the child,
//      never the server (this replaced the old best-effort Promise.race timeout, which
//      could not interrupt sync CPU work on the main thread).
// Every result is also clipped so one giant file can't blow up the context window.

import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { scanUpload } from './scan.js'

export const MAX_FILE_TEXT = 60_000 // chars per file kept for the prompt/persistence
export const MAX_FILES = 4
// Decoded-buffer ceiling. The composer caps at 10MB and the route schema caps the data
// URL at ~12MB base64 (~9MB decoded), so this never rejects a legitimate in-schema file —
// it's the backstop for a caller that bypasses the browser.
const MAX_FILE_BYTES = 15 * 1024 * 1024
// A ZIP (docx/xlsx/ods) whose entries DECLARE more than this in total uncompressed bytes,
// or more than this many entries, is refused as a likely decompression bomb.
const MAX_ZIP_UNCOMPRESSED = 100 * 1024 * 1024
const MAX_ZIP_ENTRIES = 2048
const PARSE_TIMEOUT_MS = 20_000

const clip = (s) => {
  const t = String(s ?? '').replace(/\r\n/g, '\n').trim()
  return t.length > MAX_FILE_TEXT ? `${t.slice(0, MAX_FILE_TEXT)}\n…[truncated — file continues]` : t
}

function bufferFromDataUrl(dataUrl) {
  const b64 = String(dataUrl).split(',')[1]
  if (!b64) throw new Error('invalid data URL')
  return Buffer.from(b64, 'base64')
}

export function extension(name) {
  return String(name || '').toLowerCase().split('.').pop() || ''
}

// Magic-byte checks — cheap content sniffing so a mislabeled/hostile file is rejected
// before it reaches a parser. (Exported for the unit test.)
export const magic = {
  pdf: (b) => b.length >= 5 && b.toString('latin1', 0, 5) === '%PDF-',
  // ZIP local-file header PK\x03\x04 (also \x05\x06 empty, \x07\x08 spanned)
  zip: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07),
  // OLE2 compound file — legacy .xls
  ole: (b) => b.length >= 8 && b.toString('hex', 0, 8) === 'd0cf11e0a1b11ae1',
}

// Sum the uncompressed sizes DECLARED in a ZIP's central directory, without decompressing
// anything (so the check itself can't be bombed). Walks exactly the recorded number of
// central-directory records from the End-Of-Central-Directory pointer. Throws on a
// malformed archive, too many entries, ZIP64 (too complex for our <=15MB uploads), or a
// declared expansion over the budget. (Exported for the unit test.)
export function assertZipNotBomb(buf, name) {
  const EOCD_SIG = 0x06054b50
  const CDH_SIG = 0x02014b50
  // EOCD is the last record; its comment is <=64KB, so scan back at most 22+65535 bytes.
  let eocd = -1
  const lowest = Math.max(0, buf.length - (22 + 0xffff))
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break }
  }
  if (eocd < 0) throw new Error(`'${name}' is not a valid archive`)
  const entries = buf.readUInt16LE(eocd + 10)
  const cdStart = buf.readUInt32LE(eocd + 16)
  if (entries === 0xffff || cdStart === 0xffffffff) throw new Error(`'${name}' archive is too complex (ZIP64)`)
  if (entries > MAX_ZIP_ENTRIES) throw new Error(`'${name}' has too many entries (${entries})`)
  let total = 0
  let off = cdStart
  for (let i = 0; i < entries; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== CDH_SIG) throw new Error(`'${name}' archive is malformed`)
    total += buf.readUInt32LE(off + 24) // uncompressed size (this record)
    if (total > MAX_ZIP_UNCOMPRESSED) throw new Error(`'${name}' expands too large — refused as a possible zip bomb`)
    off += 46 + buf.readUInt16LE(off + 28) + buf.readUInt16LE(off + 30) + buf.readUInt16LE(off + 32) // + name + extra + comment
  }
}

// Parse in an isolated CHILD PROCESS with a HARD timeout: SIGKILL stops even a
// synchronous CPU-bound parse hang (which no in-process timer could interrupt), and a
// parser crash dies in the child instead of the server. Fork-per-file (~100ms) is
// negligible for human-triggered uploads and can't leak state between files.
// (Deliberately a process, not a worker thread — worker teardown intermittently
// crashes 0xC0000005 on Windows/Node 24; OS isolation is boring and reliable.)
const WORKER_PATH = fileURLToPath(new URL('./extract-worker.js', import.meta.url))

function parseInWorker(kind, name, buf) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER_PATH, [], { serialization: 'advanced', stdio: 'ignore' })
    // settle ONLY on 'exit', after the child is fully gone — no shutdown races
    let result = null
    let failure = null
    const timer = setTimeout(() => {
      failure = new Error(`'${name}' took too long to parse — refused`)
      child.kill('SIGKILL') // the ONLY kill: a hung parse
    }, PARSE_TIMEOUT_MS)
    child.once('message', (m) => {
      if (m.ok) result = m.out
      else failure = new Error(m.error || `'${name}' could not be parsed`)
    })
    child.once('error', (e) => { failure = failure || e })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (failure) reject(failure)
      else if (result) resolve(result)
      else reject(new Error(`'${name}' parser exited (${code}) before producing a result`))
    })
    child.send({ kind, buf })
  })
}

// {name, text?} (client-read plain text) or {name, dataUrl} (binary) -> {name, text, note?}
// `config` is optional so existing callers keep working; pass it to enable the malware-scan seam.
export async function extractFile(file, config = null) {
  const name = String(file.name || 'file').slice(0, 200)
  const ext = extension(name)

  // client-read plain text — never a binary parser, so it skips the byte guards
  if (typeof file.text === 'string') {
    return { name, text: clip(file.text) }
  }
  if (!file.dataUrl) throw new Error(`No content for file '${name}'`)
  const buf = bufferFromDataUrl(file.dataUrl)
  if (buf.length > MAX_FILE_BYTES) {
    throw new Error(`'${name}' is too large (${(buf.length / 1048576).toFixed(1)}MB; max ${MAX_FILE_BYTES / 1048576}MB)`)
  }

  // MALWARE SCAN SEAM (files/scan.js) — deliberately HERE: after the size cap, BEFORE the magic-byte branch and
  // before any parser sees the bytes. A scan that runs after parsing protects nothing, because the parser is the
  // thing under attack. Default `files.scanner` is 'off', so this is a no-op until a scanner is registered.
  if (config) await scanUpload(config, buf, { name })

  if (ext === 'pdf') {
    if (!magic.pdf(buf)) throw new Error(`'${name}' does not look like a PDF (content check failed)`)
    const out = await parseInWorker('pdf', name, buf)
    return { name, text: clip(out.text), note: out.note }
  }
  if (ext === 'docx') {
    if (!magic.zip(buf)) throw new Error(`'${name}' does not look like a Word document (content check failed)`)
    assertZipNotBomb(buf, name)
    const out = await parseInWorker('docx', name, buf)
    return { name, text: clip(out.text), note: out.note }
  }
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods' || ext === 'csv') {
    // xlsx/ods are ZIPs (bomb-guarded); legacy .xls is an OLE2 compound file; a stray
    // .csv here (usually read as text client-side) is plain bytes SheetJS parses cheaply.
    if (ext === 'xlsx' || ext === 'ods') {
      if (!magic.zip(buf)) throw new Error(`'${name}' does not look like a spreadsheet (content check failed)`)
      assertZipNotBomb(buf, name)
    } else if (ext === 'xls' && !magic.ole(buf)) {
      throw new Error(`'${name}' does not look like a legacy .xls file (content check failed)`)
    }
    const out = await parseInWorker('sheet', name, buf)
    return { name, text: clip(out.text), note: out.note }
  }
  // last resort: treat the bytes as UTF-8 text (covers unknown text formats)
  const asText = buf.toString('utf8')
  const junk = (asText.slice(0, 2000).match(/[ �]/g) || []).length
  if (junk > 2) {
    throw new Error(`Unsupported file type '.${ext}' — supported: pdf, docx, xlsx/xls/ods/csv, and plain-text files`)
  }
  return { name, text: clip(asText) }
}
