import { useEffect, useState } from 'react'

// Reactive media query, for the handful of places where a phone needs DIFFERENT CONTENT rather than
// different styling — CSS handles layout, but it cannot shorten a string. First use: the chat
// composer's placeholder, which reads "Send a message…  (Enter to send, Shift+Enter for newline)".
// On a 390px phone that wrapped to three lines inside the input, and the hint it wraps for is
// meaningless there anyway: a touch keyboard has no Shift+Enter.
//
// Subscribes rather than reading once, so rotating the device (or a desktop window resize across the
// breakpoint) updates instead of leaving the first answer stuck.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(query).matches
    : false))

  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange() // the query may differ from the initial render's value
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** The phone breakpoint the stylesheet already uses for chat surfaces (see index.css ≤640px). */
export const PHONE_QUERY = '(max-width: 640px)'
