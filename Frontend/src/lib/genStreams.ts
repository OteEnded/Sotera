import type { ChatMessage } from './chatApi'

// In-flight generation registry, hoisted OUT of the React tree: module state survives
// route changes, so a background reply keeps streaming while the user visits the
// Console (or any other page) and re-attaches when the chat app remounts. Previously
// this lived in a ChatApp ref and the unmount effect aborted everything — leaving the
// chat app killed background generations.
//
// `streams` holds each conversation's live entry (abort controller + the accumulating
// assistant message); `genIds` mirrors the keys as an array for React rendering via
// useSyncExternalStore (subscribe/get below).

export type GenEntry = { ctrl: AbortController; msg: ChatMessage }

export const streams = new Map<string, GenEntry>()

let genIds: string[] = []
const listeners = new Set<() => void>()

export const getGenIds = () => genIds
export const subscribeGenIds = (fn: () => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export const setGenIds = (updater: string[] | ((prev: string[]) => string[])) => {
  genIds = typeof updater === 'function' ? updater(genIds) : updater
  for (const fn of listeners) fn()
}

// Entry-update notifications: the stream loop calls notifyEntry(id) after mutating an
// entry's msg, and whichever ChatApp instance is CURRENTLY mounted subscribes and
// mirrors the entry into its view. This matters across remounts — the loop's closures
// capture the instance that STARTED the stream, whose setState turns into a no-op once
// that instance unmounts (a reply used to freeze on screen after a Console round-trip).
const entryListeners = new Set<(id: string) => void>()
export const notifyEntry = (id: string) => { for (const fn of entryListeners) fn(id) }
export const subscribeEntry = (fn: (id: string) => void) => {
  entryListeners.add(fn)
  return () => { entryListeners.delete(fn) }
}
