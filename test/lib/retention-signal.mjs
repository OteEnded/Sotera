// ⭐ RE-EXPORT. The classifier moved to `Backend/app/components/retention-signal.js` when
// `retention-followthrough` began gating real behaviour on it — production code must not import from
// `test/`. ⛔ Kept as a re-export so the unit tests and harnesses keep one import path, and so the
// thing they test is the thing that runs.
export { classifyRetentionSignal, REPLIES } from '../../Backend/app/components/retention-signal.js'
