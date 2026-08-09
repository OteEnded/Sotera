// KARAOKE FOR THE VOICE — light up the sentence the TTS is currently reading.
//
// Ote, 2026-08-04: *"i want to hightlist chuck that the tts speaking on. colored it, or add animation on test
// to indicate that these chunk is speaking."* — and he was right that it is *"a lil tricky"*, because the
// piece the sidecar is speaking is a slice of MARKDOWN SOURCE, while what the user sees is rendered HTML.
// Nothing in the DOM knows about character 1,240 of the reply.
//
// ── HOW THE TWO ENDS MEET ─────────────────────────────────────────────────────────────────────────────
// 1. Every piece carries its source range (`speechStream.ts` → {text, start, end}).
// 2. react-markdown hands each rendered block its mdast source offsets, so `<Markdown>` stamps
//    `data-src-start/-end` on paragraphs and list items, and `data-src-base` on the segment container (a
//    reply with tool calls renders as several segments, each with its own local offsets).
// 3. Blocks the piece fully covers are highlighted whole. Where the piece covers only PART of a block —
//    the normal case, since pieces are cut at sentence boundaries inside a paragraph — the overlapping
//    source text is converted to what the eye sees and located in the block's own text nodes.
//
// ⚠ A WRONG HIGHLIGHT IS WORSE THAN NONE: it would tell the user the voice is somewhere it isn't. So every
// step here fails CLOSED — no match, no highlight.
//
// Painting uses the CSS Custom Highlight API, which needs no DOM mutation at all: no wrapper elements
// injected into React's tree, nothing to clean up if a render lands mid-speech. Where it is unavailable the
// fallback marks whole blocks with a class instead, which is coarser but never wrong.

// ⚠ THE RANGES DIE ON EVERY RE-RENDER, SO THE PAINT MUST BE REDONE, NOT JUST SET ONCE.
// Ote, first look at it: *"i seem to have a frash of red (on darktheme) just litle short time and not live
// through the speakign"*. Measured in a bare page: a Range registered in CSS.highlights reports area 7316
// while alive, then area 0 and toString() '' after the text is re-rendered — AND after the text node merely
// GROWS (`node.data += '…'` collapses any range inside it). A streaming reply does one or the other on every
// token, so the highlight painted once and was gone by the next frame.
//
// Worse, `CSS.highlights.get(name).size` stays 1 through all of that. The drive assertion that passed on
// `size > 0` was proving only that a dead range was still registered — the honest liveness check is that the
// range still covers pixels (getBoundingClientRect area) and still has text.
//
// So: keep the piece in module state and REPAINT on DOM mutation, coalesced to one per frame. Cheap, and the
// Highlight API helps here — writing to CSS.highlights mutates no DOM, so a repaint cannot trigger itself.
const NAME = 'tts-speaking'
const FALLBACK_CLASS = 'tts-speaking-block'

let current: { text: string; start: number; end: number } | null = null
let observer: MutationObserver | null = null
let frame = 0
let tries = 0

/**
 * Markdown → WHAT THE EYE SEES. Deliberately NOT `toSpeakable`: that one rewrites text for the ear (a URL
 * becomes "a link", emoji vanish), which would no longer match anything on screen. This one only removes
 * syntax, so the result is what react-markdown rendered.
 */
export function toDisplayText(raw: string): string {
  let s = String(raw ?? '')
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '')                    // heading markers
  s = s.replace(/^\s*>\s?/gm, '')                             // blockquote markers
  s = s.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')             // list markers
  s = s.replace(/^\s*\[([ xX])\]\s+/gm, '')                   // task boxes
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')              // images render as their alt text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')               // links render as their text
  s = s.replace(/(\*\*\*|___)(\S(?:[\s\S]*?\S)?)\1/g, '$2')
  s = s.replace(/(\*\*|__)(\S(?:[\s\S]*?\S)?)\1/g, '$2')
  s = s.replace(/~~(\S(?:[\s\S]*?\S)?)~~/g, '$1')
  s = s.replace(/(^|[\s(])\*(\S(?:[^*\n]*?\S)?)\*(?=[\s).,!?;:]|$)/g, '$1$2')
  s = s.replace(/(^|[\s(])_(\S(?:[^_\n]*?\S)?)_(?=[\s).,!?;:]|$)/g, '$1$2')
  s = s.replace(/`([^`]+)`/g, '$1')                           // inline code keeps its contents
  return s.replace(/\s+/g, ' ').trim()
}

type Char = { node: Text; off: number; ch: string }

/** Every visible character in `root`, with the text node and offset it lives at. Whitespace collapses. */
function charMap(root: Element): Char[] {
  const out: Char[] = []
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    const data = n.data
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]
      if (/\s/.test(ch)) {
        if (out.length && out[out.length - 1].ch !== ' ') out.push({ node: n, off: i, ch: ' ' })
      } else {
        out.push({ node: n, off: i, ch })
      }
    }
  }
  return out
}

/**
 * A Range covering `needle` inside `root`, or null. Matching happens on collapsed whitespace because the
 * source wraps where the rendering does not — and the map back to (node, offset) is exactly why the character
 * list is built rather than searching `textContent`.
 */
function findRange(root: Element, needle: string): Range | null {
  const want = needle.replace(/\s+/g, ' ').trim()
  if (want.length < 2) return null
  const chars = charMap(root)
  if (!chars.length) return null
  const hay = chars.map((c) => c.ch).join('')
  let at = hay.indexOf(want)
  let len = want.length
  if (at < 0) {
    // Anchor on the opening words instead. Display conversion is not perfect (a footnote, an odd entity),
    // and highlighting from the right place with an approximate length beats highlighting nothing.
    const head = want.slice(0, 40)
    if (head.length < 12) return null
    at = hay.indexOf(head)
    if (at < 0) return null
    len = Math.min(want.length, chars.length - at)
  }
  const a = chars[at]
  const b = chars[Math.min(at + len, chars.length) - 1]
  if (!a || !b) return null
  const r = document.createRange()
  try {
    r.setStart(a.node, a.off)
    r.setEnd(b.node, b.off + 1)
  } catch {
    return null
  }
  return r
}

function clearFallback() {
  for (const el of Array.from(document.querySelectorAll(`.${FALLBACK_CLASS}`))) el.classList.remove(FALLBACK_CLASS)
}

/** Stop highlighting. Safe to call at any time, including when nothing is highlighted. */
export function clearSpoken(): void {
  current = null
  if (observer) { observer.disconnect(); observer = null }
  if (frame) { cancelAnimationFrame(frame); frame = 0 }
  clearFallback()
  try { (CSS as unknown as { highlights?: Map<string, unknown> }).highlights?.delete(NAME) } catch { /* unsupported */ }
}

/**
 * Highlight the piece now being spoken. `piece.text` is its markdown source and start/end are its offsets
 * into the reply, which is everything needed to find it on screen. Stays lit until the next piece or a stop:
 * the ranges are rebuilt whenever the reply's DOM changes under them (see the note at the top of this file).
 */
export function paintSpoken(piece: { text: string; start: number; end: number } | null): void {
  clearSpoken()
  if (!piece) return
  current = piece
  tries = 0
  repaint()
  observer = new MutationObserver(() => {
    if (!current) return
    if (frame) cancelAnimationFrame(frame)
    // One repaint per frame however many mutations a token batch produced. Tokens arrive ~50/s; frames cap it.
    frame = requestAnimationFrame(() => { frame = 0; if (current) repaint() })
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
}

/** Rebuild the ranges for the piece currently being spoken and hand them to the highlight registry. */
function repaint(): void {
  const piece = current
  if (!piece) return
  clearFallback()
  // Only ever the reply being read aloud. TWO markers, because there are two ways a reply gets read:
  //   `data-live-answer`     — answer-with-speak, on the newest bubble as it streams
  //   `data-speaking-answer` — the 🔊 button, on whichever STORED reply is playing
  // ⚠ It was `[data-live-answer]` alone, which is why the highlight worked live and did nothing on the button
  // (Ote: *"i want to add text reading for 🔊button too. so i can see which part it reading"*). The failure was
  // silent: no container matched, repaint() returned early, and the audio played with nothing lit — which reads
  // as "the feature does not exist" rather than "the selector missed".
  const containers = Array.from(document.querySelectorAll<HTMLElement>('[data-live-answer],[data-speaking-answer]'))
  if (!containers.length) return

  const ranges: Range[] = []
  const whole: Element[] = []
  for (const container of containers) {
    const base = Number(container.dataset.srcBase || 0)
    for (const block of Array.from(container.querySelectorAll<HTMLElement>('[data-src-start]'))) {
      const bs = base + Number(block.dataset.srcStart)
      const be = base + Number(block.dataset.srcEnd)
      if (!Number.isFinite(bs) || !Number.isFinite(be)) continue
      if (be <= piece.start || bs >= piece.end) continue        // no overlap with what is being spoken
      if (bs >= piece.start && be <= piece.end) {
        // the piece covers this block entirely
        const r = document.createRange()
        try { r.selectNodeContents(block) } catch { continue }
        ranges.push(r)
        whole.push(block)
        continue
      }
      // Partial: derive the overlapping SOURCE text from the piece itself, then find what it looks like.
      const from = Math.max(0, bs - piece.start)
      const to = Math.min(piece.text.length, be - piece.start)
      const slice = piece.text.slice(from, to)
      const r = findRange(block, toDisplayText(slice))
      if (r) { ranges.push(r); whole.push(block) }
    }
  }
  // Nothing matched: leave whatever was painted alone rather than clearing (mid-stream the text a piece was cut
  // from can be momentarily absent while React rebuilds the block, and blinking off for a frame reads as the
  // flicker this mechanism exists to remove) — and TRY AGAIN NEXT FRAME.
  //
  // ⚠ The retry is not belt-and-braces, it closes a real hole: repaints are otherwise driven by DOM mutations,
  // and speech TRAILS the text by ~13x, so most pieces are spoken after the stream has ended and no mutation
  // will ever come. A first attempt that missed would then stay unlit forever. The drive caught this as an
  // empty first sample with every later one lit.
  if (!ranges.length) {
    if (tries++ < 12 && !frame) frame = requestAnimationFrame(() => { frame = 0; if (current) repaint() })
    return
  }
  tries = 0

  const api = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
  const store = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  if (api && store) {
    try {
      store.set(NAME, new api(...ranges))
      return
    } catch { /* fall through to the class */ }
  }
  for (const el of whole) el.classList.add(FALLBACK_CLASS)
}
