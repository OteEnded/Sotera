// ANSWER WITH SPEAK — the browser half: cut the LIVE token stream into speakable pieces.
//
// Ote, 2026-08-04: *"when model start generating final answer, we catch thoese text stream and start
// feeding to tts stream and make it speak"* · *"try client-side first, but also prepare for server-side"*.
//
// ⚠ THIS IS A MIRROR. The AUTHORITY is `Backend/app/voice/stream-speech.js` + `speakable.js`. The two are
// kept in step by `test/unit/speech-mirror.test.mjs`, which runs BOTH over the same replies and fails if
// they disagree — because "documented mirror" was not enough:
//
//   ⚠ THE BUG THIS FILE CAUSED. Its header used to say normalisation happens on the server; the server's
//   /speak-text said "the piece is still normalised by the streamer" and called render(), which speaks
//   EXACTLY what it is handed. Each file named the other as the one doing the work, so NOTHING normalised
//   the live pieces and raw markdown — '##', '|', '**' — went to the TTS. Ote heard it as *"it sound
//   random"*. The server normalises now (that is the real fix); this file's job is only WHERE TO CUT.
//
// The rules, small and side by side so the mirror is checkable by eye:
//   • a cut may never land INSIDE a block (fence, pipe table, indented code, $$ math) — each of those is
//     only recognisable whole, and half a table normalises back into prose and gets read out cell by cell
//   • nothing at or after an UNCLOSED block is final: hold it, a later delta can still change what it is
//   • otherwise cut on SENTENCE ends — and for Thai on politeness particles, because Thai has no spaces
//   • ramp the size: small first piece, doubling to the target

// ⚠⚠ A COLON IS NOT A BOUNDARY — IT IS A CONTINUATION. Nobody stops at a colon; it promises what follows.
// This was `[;:](?=\s)`, and on Ote's four-round Thai reply EIGHT OF TWELVE pieces ended on a colon, so every
// label was severed from what it introduced — "… Round สอง:" / "ลึกใน LangGraph — architecture …" as two clips
// with a render boundary and a prosody reset between them. Same complaint he opened with (*"i dont hear it read
// these — Round 1: / Round 2: …"*), reached by a second mechanism: the first was markdown glued at round
// boundaries, this is the cutter volunteering the worst place to breathe.
// A semicolon stays — it ends a clause you can genuinely pause after. A colon-only run still gets divided by
// the space and length fallbacks, just not AT the colon.
// ⚠ MIRRORED with Backend/app/voice/speakable.js's EN_END. test/unit/speech-mirror.test.mjs runs both cutters
// over the same inputs and fails if they drift, so change both in one commit.
const EN_END = /[.!?…](?=\s|$)|;(?=\s)/g
const TH_END = /(?:ครับ|ค่ะ|คะ|นะคะ|นะครับ|ฯ)/g
const FENCE_MARK = /^\s{0,3}(```|~~~|\$\$)/
const INDENT_CODE = /^(?: {4}|\t)\S/

function boundaries(s: string): number[] {
  const out = new Set<number>()
  for (const re of [EN_END, TH_END]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) !== null) {
      out.add(m.index + m[0].length)
      if (m.index === re.lastIndex) re.lastIndex += 1
    }
  }
  return [...out].sort((a, b) => a - b)
}

type Span = { start: number; end: number; kind: string; closed: boolean }

/** Regions that only make sense whole. `closed: false` = a later delta could still extend it. */
export function blockSpans(input: string): Span[] {
  const s = String(input ?? '')
  const spans: Span[] = []
  const lines: { text: string; start: number; end: number }[] = []
  let at = 0
  for (const text of s.split('\n')) {
    lines.push({ text, start: at, end: Math.min(at + text.length + 1, s.length) })
    at += text.length + 1
  }
  const last = lines.length - 1
  const endsRun = (j: number, isPipe: boolean): boolean => {
    const n = lines[j + 1]
    if (!n) return false
    if (j + 1 < last) return true
    return isPipe ? Boolean(n.text.trim()) && !n.text.includes('|') : Boolean(n.text.trim())
  }
  let i = 0
  while (i < lines.length) {
    const L = lines[i]
    const fence = L.text.match(FENCE_MARK)
    if (fence) {
      const rest = L.text.trim().slice(fence[1].length)
      if (rest.includes(fence[1])) { i += 1; continue }   // one-line ```code``` is already whole
      let j = i + 1
      while (j < lines.length && !lines[j].text.includes(fence[1])) j += 1
      const closed = j < lines.length
      spans.push({ start: L.start, end: closed ? lines[j].end : s.length, kind: 'fence', closed })
      i = closed ? j + 1 : lines.length
      continue
    }
    if (L.text.includes('|') || INDENT_CODE.test(L.text)) {
      const isPipe = L.text.includes('|')
      const same = (t: string) => (isPipe ? t.includes('|') : INDENT_CODE.test(t))
      let j = i
      while (j + 1 < lines.length && same(lines[j + 1].text)) j += 1
      spans.push({ start: L.start, end: lines[j].end, kind: isPipe ? 'table' : 'code', closed: endsRun(j, isPipe) })
      i = j + 1
      continue
    }
    i += 1
  }
  return spans
}

/** cuts = usable cut offsets · blockEnds = block ends only · safeEnd = nothing from here on is final. */
export function speakCuts(input: string): { cuts: number[]; blockEnds: number[]; safeEnd: number; spans: Span[] } {
  const s = String(input ?? '')
  const spans = blockSpans(s)
  const open = spans.find((b) => !b.closed)
  const safeEnd = open ? open.start : s.length
  const inside = (c: number) => spans.some((b) => c > b.start && c < b.end)
  const ends = spans.filter((b) => b.closed && b.end <= safeEnd).map((b) => b.end)
  const cuts = boundaries(s).filter((c) => c > 0 && c <= safeEnd && !inside(c)).concat(ends)
  return { cuts: [...new Set(cuts)].sort((a, b) => a - b), blockEnds: ends.sort((a, b) => a - b), safeEnd, spans }
}

/**
 * Characters up to `upTo` that will actually be SPOKEN — raw length minus the blocks inside it.
 * Sizes are measured in these, not raw characters: a piece that is mostly a dropped table looks full-sized
 * by raw count but buys under 2s of audio, and then the player catches up with the renderer. That gap is the
 * silence Ote heard "on those table" (measured: 317 raw chars → 1.91s of speech, next piece needed 7.4s).
 */
export function proseLen(spans: Span[], upTo: number): number {
  let n = upTo
  for (const b of spans || []) {
    if (b.start >= upTo) break
    n -= Math.min(b.end, upTo) - b.start
  }
  return Math.max(0, n)
}

/** Anything to say once the blocks are taken out? A piece that is only a table costs a round trip for silence. */
export function hasProse(input: string): boolean {
  const s = String(input ?? '')
  const spans = blockSpans(s)
  let out = ''
  let at = 0
  for (const b of spans) { out += s.slice(at, b.start); at = Math.max(at, b.end) }
  out += s.slice(at)
  return /[\p{L}\p{N}]/u.test(out.replace(/[#*_>`~|\-=+[\]().,:;!?'"/\\]/g, ''))
}

/**
 * A piece, with WHERE IT CAME FROM. `start`/`end` are character offsets into the reply's markdown source —
 * they are what lets the UI highlight the sentence being spoken (Ote: *"i want to hightlist chuck that the tts
 * speaking on"*). react-markdown gives every rendered block its mdast source offsets, so the two meet up.
 */
export type SpeechPiece = { text: string; start: number; end: number }

export type SpeechStreamer = {
  push: (delta: string) => SpeechPiece[]
  flush: () => SpeechPiece[]
  held: () => number
}

export function createSpeechStreamer({ target = 600, firstTarget }: { target?: number; firstTarget?: number } = {}): SpeechStreamer {
  let buf = ''
  let consumed = 0        // chars taken off the front of the stream so far = this piece's source offset
  // ADAPTIVE RAMP — see stream-speech.js for the measurement. Each piece must buy enough audio to cover the
  // NEXT piece's render; OmniVoice's RTF is 0.38-0.54 (worse when longer), so growth is capped at 1.4x of what
  // the last piece ACTUALLY produced. A fixed doubling ramp only asks: piece 0 asked 200 and got 111 speakable
  // chars while piece 1 took 374, a 3.4x jump that cost 6.5s of dead air mid-reply.
  // Floor 60, not 150: first sound is this clip's own render and nothing else (measured 133 chars → 5.5s,
  // 60 chars → ~2s). Safe only because growth is pinned to 1.4x of reality rather than doubling.
  const first = Math.min(target, Math.max(60, firstTarget ?? Math.round(target / 3)))
  const GROWTH = 1.4
  // ⚠ MUST EQUAL Backend/app/voice/stream-speech.js's MIN_SPEAKABLE. Measured floor, not taste: below ~12
  // speakable characters OmniVoice returns zero samples. test/unit/speech-mirror.test.mjs runs both cutters
  // over the same inputs and fails if they ever disagree.
  const MIN_SPEAKABLE = 15
  let lastProse = 0
  const wantFor = () => (lastProse > 0 ? Math.min(target, Math.max(first, Math.round(lastProse * GROWTH))) : first)

  // Cuts are found in the RAW text on purpose. An earlier server version normalised first and mapped the
  // offset back, which split words ("This is a sentence o" / "f roughly") because normalisation is not
  // length-preserving. Sentence boundaries survive normalisation, so raw is both simpler and correct —
  // as long as the candidates respect blocks, which is what speakCuts is for.
  const rawCut = (want: number, force: boolean): number | null => {
    const { cuts, blockEnds, safeEnd, spans } = speakCuts(buf)
    if (safeEnd <= 0) return force ? buf.length : null
    const at_ = (c: number) => proseLen(spans, c)        // sizes are SPEAKABLE chars, not raw ones
    if (!force && at_(safeEnd) < want) return null
    const max = Math.round(want * 1.6)
    const within = cuts.filter((c) => c <= safeEnd && at_(c) <= max)
    const at = within.filter((c) => at_(c) <= want).pop() ?? within[0]
    if (at != null) return at
    // A table wider than the window goes WHOLE — but only while it is at the FRONT of the buffer. Measured
    // from a real reply: this branch runs BEFORE the far-sentence search, so a table sitting 1342 speakable
    // chars in made the cut swallow all the prose ahead of it and produced an 84-SECOND piece. A block at the
    // front measures ~0 speakable, so it still overshoots the RAW ceiling as intended; one behind prose now
    // falls through, the prose is cut at a sentence end, and the block is taken whole on the next pass.
    // ⚠ MIRRORS stream-speech.js — that file is the authority and carries the full note.
    const block = blockEnds.find((c) => c <= safeEnd)
    if (block != null && at_(block) <= max) return block
    // A sentence end further out beats cutting mid-sentence: with a ~70 char opening target, a long first
    // sentence used to fall through to the space fallback and split "black hole theory" in half (Ote's report).
    const far = cuts.find((c) => c <= safeEnd && at_(c) <= want * 3)
    if (far != null) return far
    // ...and keep waiting for it: giving up at 1.6x space-cut long sentences before their full stop arrived.
    if (!force && at_(safeEnd) < want * 3) return null
    const slice = buf.slice(0, Math.min(max, safeEnd))
    const sp = slice.lastIndexOf(' ')
    if (sp > want * 0.4) return sp + 1
    return force ? safeEnd : Math.min(max, safeEnd)
  }

  const take = (force: boolean): SpeechPiece[] => {
    const out: SpeechPiece[] = []
    let carry = ''          // a runt held back to be spoken as part of the NEXT piece
    let carryStart = 0      // ...and where it began, so the highlight still covers it
    for (;;) {
      if (!buf.trim()) break
      const at = rawCut(wantFor(), force)
      if (at == null || at <= 0) break
      const raw = carry + buf.slice(0, at)
      // ⚠ SPEAKABLE LENGTH OF THE SLICE, in both implementations — the one unit the browser can measure
      // without normalising (proseLen only needs to know where the blocks are). Using the normalised length
      // would make the two disagree about the next cut point the moment a table was dropped. A piece that is
      // only a table still sets it (to ~0), which conservatively resets the ramp to its opening size.
      const candProse = raw.trim() ? proseLen(speakCuts(raw).spans, raw.length) : 0
      // ⚠ MIRRORS Backend/app/voice/stream-speech.js — same rule, same unit, same constant. Below ~12
      // speakable characters OmniVoice returns ZERO SAMPLES (measured: 2/8 renders of a 10-char Thai greeting,
      // 3/8 of "Hello", 0/8 at 12+), so a runt piece is silence or a 500 on the FIRST thing the listener
      // hears. Mid-stream: wait for the next delta. At flush: carry forward, else merge backward.
      // If these two files ever disagree, the browser highlights a span the speech is not on.
      if (!force && candProse > 0 && candProse < MIN_SPEAKABLE) break
      const start = carry ? carryStart : consumed
      buf = buf.slice(at)
      consumed += at
      // Carry FORWARD when the runt is first in the batch — at flush the whole reply is usually cut in one
      // pass, so a short greeting has nothing behind it to merge into.
      if (force && candProse > 0 && candProse < MIN_SPEAKABLE && !out.length && buf.trim()) {
        carry = raw
        carryStart = start
        continue
      }
      carry = ''
      if (raw.trim()) {
        lastProse = candProse
        if (hasProse(raw)) {
          const prev = out[out.length - 1]
          if (force && candProse < MIN_SPEAKABLE && prev) {
            prev.text += raw          // merge backward, and extend the highlight span with it
            prev.end = consumed
          } else {
            out.push({ text: raw, start, end: consumed })
          }
        }
      }
      if (!force && !buf.trim()) break
    }
    return out
  }

  return {
    push: (delta: string) => { buf += String(delta ?? ''); return take(false) },
    flush: () => take(true),
    held: () => buf.length,
  }
}
