// IMMUTABLE RUN ARTIFACTS — the guarantee is "a prior run cannot be overwritten", so the test that
// matters is the COLLISION one. Everything else is naming cosmetics.
//
// ⚠️ The bug this prevents was real and silent: a fixed output path plus `writeFileSync(path, '')` meant
// launching run 2 destroyed run 1's replies on startup. Nothing errored. The data survived only because
// it had been committed an hour earlier.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { allocateRunPath, runStamp, openRunArtifact } from '../lib/run-artifacts.mjs'

const AT = new Date('2026-08-19T18:40:05.123Z')

test('⭐ COLLISION IS AN ERROR — it never silently picks another name', () => {
  const taken = '/results/self-model-falsifiers_2026-08-19T18-40-05Z_r15_modelqwen3.6-35b.jsonl'
  assert.throws(
    () => allocateRunPath({
      dir: '/results', stem: 'self-model-falsifiers', params: { r: 15, model: 'qwen3.6:35b' },
      now: AT, exists: (p) => p.replace(/\\/g, '/') === taken,
    }),
    /refusing to overwrite/,
    '⚠️ a collision must THROW — auto-suffixing would hide exactly the confusion this module exists to prevent',
  )
})

test('the same run parameters at a different second do NOT collide', () => {
  const p1 = allocateRunPath({ dir: '/r', stem: 's', params: { r: 15 }, now: AT, exists: () => false })
  const p2 = allocateRunPath({ dir: '/r', stem: 's', params: { r: 15 }, now: new Date('2026-08-19T18:40:06.000Z'), exists: () => false })
  assert.notEqual(p1, p2)
})

test('the name is self-describing — stem, UTC stamp, and every run parameter', () => {
  const p = allocateRunPath({
    dir: '/r', stem: 'self-model-falsifiers', params: { r: 15, model: 'qwen3.6:35b' },
    now: AT, exists: () => false,
  }).replace(/\\/g, '/')
  assert.match(p, /self-model-falsifiers/)
  assert.match(p, /2026-08-19T18-40-05Z/, 'UTC and filename-safe')
  assert.match(p, /_r15_/, 'repeats visible without opening the file')
  assert.match(p, /modelqwen3\.6-35b/, 'model visible, colon made filename-safe')
  assert.ok(p.endsWith('.jsonl'))
})

test('stamps sort chronologically as plain strings', () => {
  const a = runStamp(new Date('2026-08-19T09:00:00Z'))
  const b = runStamp(new Date('2026-08-19T18:40:05Z'))
  assert.ok(a < b, 'lexicographic order must match time order, or a directory listing misleads')
  assert.ok(!/[:]/.test(a), 'no colons — Windows filenames')
})

// ── Real filesystem: the wx flag is the half that survives a race ────────────────────────────────
test('⭐ on disk — a second open of the same path fails, and the first run\'s bytes are intact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'runart-'))
  try {
    const a = openRunArtifact({ dir, stem: 'exp', params: { r: 1 }, now: AT })
    a.write({ hello: 'run one' })
    assert.ok(existsSync(a.path))

    // Same stem, same params, same instant ⇒ same name ⇒ must refuse rather than truncate.
    assert.throws(() => openRunArtifact({ dir, stem: 'exp', params: { r: 1 }, now: AT }), /refusing to overwrite/)

    // ⭐ THE ACTUAL GUARANTEE: run one's data is still there after the failed second open.
    assert.equal(readFileSync(a.path, 'utf8').trim(), '{"hello":"run one"}')

    // And the manifest recorded the run at START, so a crashed run still leaves a trace.
    const manifest = readFileSync(join(dir, 'runs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    assert.equal(manifest.length, 1)
    assert.equal(manifest[0].stem, 'exp')
    assert.equal(manifest[0].artifact, a.path.split(/[\\/]/).pop())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('⭐ MUTATION PROOF — the old fixed-path behaviour WOULD have destroyed run one', () => {
  // Demonstrate the defect, so the test above is known to be testing something real rather than
  // passing over a guarantee nothing enforces.
  const dir = mkdtempSync(join(tmpdir(), 'runart-old-'))
  try {
    const fixed = join(dir, 'self-model-falsifiers.jsonl')
    writeFileSync(fixed, '{"hello":"run one"}\n')
    writeFileSync(fixed, '') // ← exactly what the runner used to do on startup
    assert.equal(readFileSync(fixed, 'utf8'), '', 'the old path truncates silently — this is the bug')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
