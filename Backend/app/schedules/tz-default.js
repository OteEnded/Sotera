// Timezone rail for model-created clock triggers (pure — unit-tested directly).
//
// A cron trigger that arrives WITHOUT a tz almost always means the model wrote the
// user's wall-clock time and forgot the zone — silently meaning UTC shipped a "10:03"
// reminder at 17:03 Bangkok (Ote-reported). validateJobSpec keeps its documented
// UTC default for explicit API callers; this rail runs only on the MODEL-facing
// schedules service, where the safer default is the human who's asking.

export const isValidTz = (tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Fill a missing cron tz: an edit inherits the schedule's existing zone first (the user
 * said "move it to 10:03", not "change its timezone"), otherwise the asking user's own
 * timezone. An explicit tz always wins; non-cron triggers pass through untouched.
 */
export function defaultTriggerTz(trigger, userTz, existingTrigger = null) {
  if (!trigger || typeof trigger !== 'object' || trigger.type !== 'cron' || trigger.tz) return trigger
  const inherited = existingTrigger?.type === 'cron' && existingTrigger.tz ? existingTrigger.tz : null
  const tz = inherited || (typeof userTz === 'string' && isValidTz(userTz) ? userTz : null)
  return tz ? { ...trigger, tz } : trigger
}
