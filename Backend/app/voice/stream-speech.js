// SPEAK WHILE THE MODEL IS STILL WRITING — the incremental sentence emitter.
//
// Ote, 2026-08-04: *"i want to try making natual talking, so this is the starting point to POC"* —
// user turns on "answer with speak", and as the model streams its final answer we cut the text into
// speakable pieces and feed the TTS on the fly.
//
// ── THE NUMBER THAT SHAPES THIS WHOLE FEATURE ─────────────────────────────────────────────────────────
// From Ote's own stats line (47.9 tok/s): the model produces **~177 chars/s of text** while speech consumes
// **~14 chars/s**. **Text outruns speech by ~13×.** Two consequences, and both are counter-intuitive:
//   1. The TTS is NEVER waiting for text. There is no starvation risk, no need for native streaming, and
//      VoxCPM2's 0.2 s first-sample advantage buys nothing here — which is why OmniVoice is the right
//      engine for this, not a compromise.
//   2. The AUDIO TRAILS, badly. A 1645-char answer is written in 9 s and takes 118 s to speak. So "natural
//      talking" is really a constraint on ANSWER LENGTH — a PersonaTemplate concern, not a voice one. No
//      TTS architecture makes an essay feel like conversation.
// Ote's call for the POC: *"Speak everything for now (i surely have to improve it later)"*.
//
// ── WHY THIS FILE IS ON THE SERVER even though detection runs client-side today ───────────────────────
// Ote: *"try client-side first, but also prepare for server-side"*. The client has the token stream already,
// so client-side detection is the smaller POC. But scheduled turns and headless runs have no browser, and
// they will want the same voice. So the RULES live here, server-side and unit-tested, and the browser holds
// a documented mirror. This module is the authority; if the two ever disagree, this one is right.
//
// Pure and dependency-free: no server, no sidecar, no GPU needed to test it.
import { toSpeakable, speakCuts, proseLen } from './speakable.js'

/**
 * createSpeechStreamer({ target, firstTarget })
 *
 *   push(delta)  -> string[]  speakable pieces that are READY now (often empty)
 *   flush()      -> string[]  whatever is left when the stream ends
 *   stats()      -> { emitted, chars, held }
 *
 * Pieces come out already normalised by toSpeakable (markdown resolved, code/tables dropped) and cut at
 * sentence boundaries by chunkForSpeech, so the caller can hand each one straight to the sidecar.
 */
export function createSpeechStreamer({ target = 600, firstTarget } = {}) {
  let buf = ''             // raw text not yet emitted (markdown, exactly as the model wrote it)
  let emitted = 0
  let chars = 0

  // ── THE RAMP IS ADAPTIVE, AND THAT IS A MEASURED DECISION ──────────────────────────────────────────
  // The first piece is what the listener waits for, so it stays small. After that, each piece must buy
  // enough AUDIO to cover the NEXT piece's render, or the player runs dry and the reply stutters.
  //
  // ⚠ Measured 2026-08-04 on OmniVoice: RTF is 0.38 for a 5s clip and 0.54 for a 21s one — it gets WORSE
  // with length. At RTF 0.5 a piece can only cover a successor up to ~2x its own audio, so the old
  // doubling ramp sat exactly on the limit. And a ramp only ASKS: piece 0 asked for 200 speakable chars
  // and the sentence boundaries gave it 111, while piece 1 took 374 — a 3.4x jump and 6.5s of dead air.
  //
  // So the target for the next piece comes from what the last one ACTUALLY produced, not from what it was
  // asked for: 1.4x of reality, which leaves ~25% margin at the worst measured RTF. The buffer is what you
  // have, not what you wanted.
  // The floor is 60, not 150: FIRST SOUND is the one latency the listener actually experiences, and it is
  // just this clip's own render. Measured — a 133-char opening took 5.5s to come back, a 60-char one about 2s.
  // The old floor was written when the ramp doubled, where a small opening compounded into a huge third piece;
  // with growth pinned to 1.4x of reality it cannot, so the opening is free to be short.
  const first = Math.min(target, Math.max(60, firstTarget ?? Math.round(target / 3)))
  const GROWTH = 1.4
  // ⚠ MEASURED FLOOR, not a taste. Below ~12 speakable characters OmniVoice returns zero samples and the
  // sidecar has nothing to send (2/8 renders of a 10-char Thai greeting, 3/8 of "Hello", 0/8 at 12+). 15
  // leaves margin. ⚠ MIRRORED in Frontend/src/lib/speechStream.ts — the two cutters must agree exactly or the
  // browser highlights a different span than the one being spoken; test/unit/speech-mirror.test.mjs runs BOTH.
  const MIN_SPEAKABLE = 15
  let lastProse = 0
  const wantFor = () => (lastProse > 0 ? Math.min(target, Math.max(first, Math.round(lastProse * GROWTH))) : first)

  /**
   * Where to cut the RAW buffer. ⚠ THIS OPERATES ON RAW TEXT ON PURPOSE.
   *
   * The first version normalised the whole buffer, emitted a piece from the NORMALISED string, then
   * binary-searched back for the matching raw offset. Normalisation is not length-preserving, so that
   * mapping landed mid-word and pieces came out cut like "This is a sentence o" / "f roughly sixty".
   * Cutting raw first and normalising the SLICE removes the mapping problem entirely — and sentence
   * boundaries survive normalisation, so nothing is lost by looking for them here.
   *
   * ⚠ BUT RAW TEXT HAS BLOCKS IN IT, and that is what made a table sound like noise (see speakCuts).
   * The candidate cuts come from speakCuts now, so a cut can only land where the text is FINAL and
   * OUTSIDE a block. This function chooses among them; it does not get to invent one.
   */
  const rawCut = (want, force) => {
    const { cuts, blockEnds, safeEnd, spans } = speakCuts(buf)
    // Nothing is final yet: the buffer opens with a block that is still growing. At end-of-stream the
    // whole thing goes as ONE piece — a half fence has no ``` left to recognise, and toSpeakable would
    // read the code aloud instead of dropping it.
    if (safeEnd <= 0) return force ? buf.length : null
    // ⚠ SIZES ARE IN SPEAKABLE CHARACTERS, NOT RAW ONES (see proseLen). Counting raw text let a piece that
    // was mostly a dropped table pass for a full-sized chunk while buying under 2s of audio, and the player
    // caught up with the renderer — the silence Ote heard "on those table".
    const at_ = (c) => proseLen(spans, c)
    if (!force && at_(safeEnd) < want) return null   // not enough FINAL SPEECH yet (held text does not count)
    const max = Math.round(want * 1.6)
    const within = cuts.filter((c) => c <= safeEnd && at_(c) <= max)
    const at = within.filter((c) => at_(c) <= want).pop() ?? within[0]
    if (at != null) return at
    // A block wider than the size window — a long table. Take it WHOLE and past the ceiling: it
    // normalises to nothing, so it costs no synthesis, and slicing it is the bug this all prevents.
    //
    // ⚠ BUT ONLY WHEN THE BLOCK IS AT THE FRONT, AND THAT GUARD IS THE WHOLE POINT OF THIS LINE.
    // Ote heard the result: an **84-second** piece in one reply (1304 speakable chars). MEASURED cause —
    // this branch is checked BEFORE the far-sentence search, and `blockEnds.find(c => c <= safeEnd)` returns
    // the end of the first table wherever it happens to be. In that reply the table sat **1342 speakable
    // characters in**, so the cut swallowed all the prose ahead of it; `far` would have cut at 192.
    //
    // The comment above justified the overshoot with "it normalises to nothing, so it costs no synthesis" —
    // true of the BLOCK, false of the prose in front of it. So the test is the one unit the rest of this
    // function already thinks in: SPEAKABLE characters. A block at the front measures ~0 speakable, so it is
    // still taken whole and still overshoots the RAW ceiling exactly as intended. A block behind real prose
    // fails the test, falls through, and the prose gets cut at a sentence end first — the block is then at the
    // front on the next pass and taken whole there.
    // ⇒ INVARIANT: no piece may exceed the size window in SPEAKABLE characters just because a block follows.
    const block = blockEnds.find((c) => c <= safeEnd)
    if (block != null && at_(block) <= max) return block
    // ⚠ A SENTENCE END FURTHER OUT BEATS CUTTING MID-SENTENCE. Ote, from a real reply: *"you might adjust the
    // devider abit. so it not go like this black, / hole theory"* — the opening target is only ~70 speakable
    // chars now (for fast first sound), so a long first sentence had no boundary inside the 1.6x window and fell
    // through to the space fallback, splitting "black hole theory" in half. A fragment sounds broken read aloud
    // AND looks broken highlighted. So look up to 3x the target for a real sentence end before giving up on one.
    const far = cuts.find((c) => c <= safeEnd && at_(c) <= want * 3)
    if (far != null) return far
    // ⚠ AND KEEP WAITING FOR IT. Looking further out is useless if the rule gives up first: the old ceiling was
    // 1.6x the target, so a long sentence hit it and got space-cut BEFORE its full stop had even streamed in.
    // Wait to 3x the target for a real sentence end; only a genuine run-on falls through to the space fallback.
    if (!force && at_(safeEnd) < want * 3) return null
    // A run-on with no sentence end. Back off to a SPACE so a word is never split; Thai has none, so
    // fall through to a hard length cut there (the same trade chunkForSpeech makes). Run-on prose has no
    // blocks in it by definition, so raw and speakable lengths agree here.
    const slice = buf.slice(0, Math.min(max, safeEnd))
    const sp = slice.lastIndexOf(' ')
    if (sp > want * 0.4) return sp + 1
    return force ? safeEnd : Math.min(max, safeEnd)
  }

  const take = (force) => {
    const out = []
    let carry = ''          // a runt held back to be spoken as part of the NEXT piece
    for (;;) {
      if (!buf.trim()) break
      const want = wantFor()
      const at = rawCut(want, force)
      if (at == null || at <= 0) break
      const rawPiece = carry + buf.slice(0, at)
      // ⚠ A PIECE THIS SHORT MAKES THE ENGINE RETURN NOTHING. Measured 2026-08-05 against the live sidecar:
      // OmniVoice produced ZERO SAMPLES for 2 of 8 renders of a 10-character Thai greeting and 3 of 8 of
      // "Hello", but 0 of 8 at 12+ characters. The ramp deliberately opens small, so this lands on the FIRST
      // piece — the one the listener is actually waiting for — and a broken opener reads as "the voice is
      // inconsistent" while being a completely different fault. Mid-stream the fix is simply to WAIT: leave
      // the text in the buffer and let the next delta grow it past the floor.
      // ⚠ MEASURED IN proseLen, NOT in the normalised string's length. The two implementations must agree on
      // this number or they cut differently, and the browser then highlights a span the speech is not on.
      // proseLen is the one unit the mirror can compute without normalising anything — the same unit the ramp
      // already uses below. Using toSpeakable().text.length here (my first attempt) silently broke that.
      const candProse = proseLen(speakCuts(rawPiece).spans, rawPiece.length)
      if (!force && candProse > 0 && candProse < MIN_SPEAKABLE) break
      // ⚠ THE NEXT WANT IS MEASURED IN THE SAME UNIT ON BOTH SIDES: speakable characters of the slice just
      // taken, which the browser mirror can compute without normalising anything (proseLen only needs to know
      // where the BLOCKS are). If this used the normalised length instead, the two would disagree about the
      // next cut point the moment a table was dropped — and the mirror test would have to compare loosely.
      buf = buf.slice(at)
      // ⚠ A RUNT AT FLUSH NEEDS BOTH DIRECTIONS. Merging backward alone is not enough: at end-of-stream the
      // whole reply is usually cut in ONE take(), so a short greeting is the FIRST piece and has nothing
      // behind it to join. Carry it FORWARD into the next piece instead, and only merge backward when the
      // runt lands last. Found by the test, not by reading the code — "สวัสดีครับ" still escaped as a 10-char
      // piece after the backward-merge alone looked correct.
      if (force && candProse > 0 && candProse < MIN_SPEAKABLE && !out.length && buf.trim()) {
        carry = rawPiece
        continue
      }
      carry = ''
      if (rawPiece.trim()) lastProse = candProse
      const { text } = toSpeakable(rawPiece)
      if (text.trim()) {
        // A runt that reaches here has nothing left to join: MERGE IT BACKWARD rather than ship or drop it.
        // Dropping loses words; shipping risks the empty render above. Merging costs nothing — these pieces
        // have not left this function yet.
        if (force && candProse < MIN_SPEAKABLE && out.length) {
          out[out.length - 1] = `${out[out.length - 1]} ${text}`.replace(/\s+/g, ' ').trim()
          chars += text.length
        } else {
          out.push(text)
          emitted += 1
          chars += text.length
        }
      }
      if (!force && !buf.trim()) break
    }
    return out
  }

  return {
    /** Feed a text delta from the model. Returns pieces ready to speak right now (usually none). */
    push(delta) {
      buf += String(delta ?? '')
      return take(false)
    },
    /** The stream ended: emit whatever is left, block-open or not. */
    flush() {
      return take(true)
    },
    stats() {
      return { emitted, chars, held: buf.length }
    },
  }
}
