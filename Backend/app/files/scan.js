// MALWARE SCAN SEAM for uploaded files — the architecture now, the engine when the deployment suits it
// (Ote, 2026-07-30: "keep the architecture seam now and leave the engine until it fits the deployment
// environment better"). Development is Windows-native and clamd there is real friction; the seam costs nothing
// and means enabling a scanner later is configuration, not surgery.
//
// WHERE THIS SITS AND WHY: exactly one call, on the DECODED BUFFER, after the size cap and BEFORE any parser or
// magic-byte branch touches the bytes (see extract.js). A scanner that runs after a parser has already read the
// file protects nothing — the parser is the thing being attacked.
//
// WHAT THIS IS NOT PROTECTING AGAINST. Uploaded bytes are never written to disk and never executed; only the
// extracted TEXT is persisted. So the threat model here is not "a virus runs on the server" — it is (a) parser
// exploitation and resource exhaustion, already covered by the size cap, magic-byte check, zip-bomb guard and
// forked-child parsing, and (b) OteLLMServices acting as a CARRIER: a user uploads an infected document, the
// text is extracted, and the original is passed along or downloaded elsewhere. (b) is what a scanner adds.
//
// Note one deliberate gap: a client-read PLAIN TEXT upload arrives as a string with no bytes at all, so there is
// nothing to scan and that path skips this by construction, not by oversight.

import { getSetting } from '../settings/index.js'

/** A scanner reports on a buffer. `{ clean: true }` or `{ clean: false, threat: '<name>' }`. */
const SCANNERS = new Map()

/**
 * 'off' — the default and a genuine no-op: no work, no latency, no behaviour change. It is NOT registered as a
 * scanner that always returns clean, because that would make "scanning is disabled" and "scanning ran and found
 * nothing" indistinguishable in the logs — the silent-zero mistake this project keeps paying for.
 */
export const SCANNER_OFF = 'off'

/**
 * Register a scanner implementation. Kept as a registry rather than an if-chain so a host can supply its own
 * (an ICAP service, a cloud API, a sandbox) without editing this file.
 * @param {string} name
 * @param {(buf: Buffer, meta: { name: string }) => Promise<{ clean: boolean, threat?: string }>} impl
 */
export function registerScanner(name, impl) {
  SCANNERS.set(name, impl)
}

/** Which scanner the platform is configured to use, and what to do when it is unreachable. */
export function scannerConfig(config) {
  const name = getSetting(config, 'files.scanner') || SCANNER_OFF
  return { name, failClosed: getSetting(config, 'files.scanFailClosed') !== false }
}

export class ScanRefusedError extends Error {
  constructor(message, { threat = null, reason = 'infected' } = {}) {
    super(message)
    this.name = 'ScanRefusedError'
    this.threat = threat
    this.reason = reason // 'infected' | 'scanner-unavailable'
  }
}

/**
 * Scan a decoded upload. Returns a RESULT rather than a boolean so a caller (and a log line) can always tell
 * "not scanned" from "scanned and clean" — those must never collapse into one value.
 *
 * FAIL-CLOSED BY DEFAULT when a scanner is configured but broken: if the operator asked for scanning, then
 * "could not scan" means "not allowed", because the alternative is a scanner outage silently becoming an
 * unscanned-upload window. `files.scanFailClosed=false` opts into availability over assurance, deliberately.
 *
 * @returns {Promise<{ scanned: boolean, scanner: string, clean: boolean|null, threat: string|null }>}
 * @throws {ScanRefusedError} when the file is infected, or unscannable while fail-closed
 */
export async function scanUpload(config, buf, { name = 'file' } = {}) {
  const { name: scanner, failClosed } = scannerConfig(config)
  if (scanner === SCANNER_OFF) return { scanned: false, scanner: SCANNER_OFF, clean: null, threat: null }

  const impl = SCANNERS.get(scanner)
  if (!impl) {
    if (failClosed) {
      throw new ScanRefusedError(
        `'${name}' could not be scanned: no scanner named '${scanner}' is installed. Install it, or set files.scanner to 'off'.`,
        { reason: 'scanner-unavailable' },
      )
    }
    return { scanned: false, scanner, clean: null, threat: null }
  }

  let verdict
  try {
    verdict = await impl(buf, { name })
  } catch (err) {
    if (failClosed) {
      throw new ScanRefusedError(`'${name}' could not be scanned (${scanner}: ${err?.message || 'error'}).`, { reason: 'scanner-unavailable' })
    }
    return { scanned: false, scanner, clean: null, threat: null }
  }

  if (!verdict?.clean) {
    throw new ScanRefusedError(
      `'${name}' was refused: ${verdict?.threat ? `threat detected (${verdict.threat})` : 'the scanner reported it as unsafe'}.`,
      { threat: verdict?.threat ?? null },
    )
  }
  return { scanned: true, scanner, clean: true, threat: null }
}

/**
 * The ClamAV slot, DELIBERATELY NOT IMPLEMENTED. Selecting 'clamav' without registering a real implementation
 * fails closed with an actionable message rather than pretending to scan — a scanner that silently does nothing
 * is worse than none, because it buys false confidence.
 *
 * To implement: speak clamd's INSTREAM protocol over TCP/unix socket (host+port from config), stream the
 * buffer in chunks, read the `stream: OK` / `stream: <threat> FOUND` reply, and registerScanner('clamav', …).
 * Nothing else in the codebase needs to change — that is the point of the seam.
 */
export const CLAMAV_NOT_IMPLEMENTED = 'clamav'
