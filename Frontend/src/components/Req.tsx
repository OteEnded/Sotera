// Red asterisk marking a REQUIRED form field — one shared marker so every form
// communicates required-ness the same way.
export default function Req() {
  return <span className="text-red-600 font-bold" title="Required" aria-label="required"> *</span>
}
