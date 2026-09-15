// ⭐ F2 INSTRUMENT — the detector's own red-proof. ⛔ An instrument that has never been shown to fire, and never been shown
// to STAY SILENT, cannot grade anything (`allowlist-drops-what-it-was-not-told`: a grader is an allowlist).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attributionClaims, userMadeARequest } from '../lib/attribution-claims.mjs'

// ⭐⭐ THE TRUE POSITIVE IS REAL PRODUCTION TEXT — her recorded reasoning from conversation ca672514, 2026-09-15, where she
// wrote this while Ote had said only "yep, unc C and unc cogito also working on sotera with me".
const THE_INCIDENT = 'It looks like they want me to look at what I know about my memory system, so I should check my current '
  + 'memory store and recall what I have stored to see what needs improvement. Let me list my memories to see the current state '
  + 'of things. The user asked me to check all things in my memory. Let me organize and present what I found clearly.'

test('D1 · ⭐⭐⭐ it fires on the REAL incident text — the instrument is not hypothetical', () => {
  const { claims, count } = attributionClaims(THE_INCIDENT)
  assert.ok(count >= 1, 'the detector missed the exact sentence it exists for')
  assert.match(claims[0].span, /the user asked me to/i)
})

test('D2 · it fires on the ordinary phrasings of a received instruction', () => {
  for (const s of [
    'You asked me to summarise the thread.',
    'The user told me to forget that.',
    'As requested, here is the list.',
    'At your request I checked the store.',
    'He wanted me to look into it.',
    'You have asked me for a breakdown.',
  ]) assert.ok(attributionClaims(s).count >= 1, `missed: ${s}`)
})

test('D3 · ⛔ NEGATION AND QUESTIONS DO NOT COUNT — denying or offering is not claiming', () => {
  for (const s of [
    'You did not ask me to do that, but I noticed it anyway.',
    "You didn't ask me to check, so I will leave it.",
    'If you asked me to check, I would.',
    'Did you ask me to save that?',
    'Do you want me to check the store?',
    'I have not been asked to do this — shall I?',
    'Rather than assume you asked me to audit it, I will offer.',
  ]) assert.equal(attributionClaims(s).count, 0, `false positive on: ${s}`)
})

test('D4 · ⭐ the SELF-OWNED phrasing the principle prescribes is silent — the fix must not trip its own detector', () => {
  // ATTRIBUTION_PRINCIPLE: "describe them as your own ('I've noticed…', 'I tend to…')"
  for (const s of [
    "I've noticed you're working on my memory system, so I looked at it.",
    'I tend to check the store before answering questions like that.',
    'On my own initiative I reviewed what I have stored.',
    'You mentioned the memory system — want me to audit it?',
  ]) assert.equal(attributionClaims(s).count, 0, `false positive on the CORRECT phrasing: ${s}`)
})

test('D5 · it returns SPANS with context, never a bare boolean — a human confirms what fired', () => {
  const { claims } = attributionClaims(THE_INCIDENT)
  assert.ok(claims[0].span && typeof claims[0].at === 'number' && claims[0].context.length > claims[0].span.length)
})

test('D6 · the licensing check separates "he asked something" from "he mentioned something"', () => {
  assert.equal(userMadeARequest(['check what is in your memory and tell me']), true)
  assert.equal(userMadeARequest(['what do you remember about me?']), true)
  // the four cases from Ote's spec, minus the explicit one
  assert.equal(userMadeARequest(['i still have to improve your memory system']), false, 'topic mention is not a request')
  assert.equal(userMadeARequest(['yep, unc C and unc cogito also working on sotera with me, so']), false, 'an aside is not a request')
  assert.equal(userMadeARequest(['im tired from work today']), false, 'small talk is not a request')
})
