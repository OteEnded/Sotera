// Password policy — one gate for EVERY path that sets a password: self-service
// registration, self password change, AND admin-created / admin-reset passwords.
// Admin-set passwords used to bypass the length check entirely, which is how an
// admin account ended up with the password "admin". Now nothing sets a password
// without clearing this.
//
// Rules: at least `minLength` chars (root-configurable via security.passwordMinLength),
// not a well-known weak password, and not equal to the account's own username/email.

const WEAK_PASSWORDS = new Set([
  'password', 'passw0rd', 'pass1234', 'admin', 'admin123', 'administrator', 'root', 'toor',
  '123456', '1234567', '12345678', '123456789', '1234567890', 'qwerty', 'qwerty123',
  'abc123', 'letmein', 'welcome', 'welcome1', 'changeme', 'iloveyou', 'monkey', 'dragon',
  '000000', '111111', '123123', 'secret', 'default', 'guest', 'test', 'test123',
  'ollama', 'otellm', 'otellmservices',
])

// Returns { ok: true } or { error: <message> }. `username`/`email` are optional
// context so we can reject a password that just echoes the account identifier.
export function checkPasswordStrength(password, { minLength = 8, username, email } = {}) {
  const pw = typeof password === 'string' ? password : ''
  if (pw.length < minLength) {
    return { error: `Password must be at least ${minLength} characters.` }
  }
  const low = pw.toLowerCase()
  if (WEAK_PASSWORDS.has(low)) {
    return { error: 'That password is too common — choose a less guessable one.' }
  }
  if (username && low === String(username).trim().toLowerCase()) {
    return { error: 'Password must not be the same as the username.' }
  }
  if (email && low === String(email).trim().toLowerCase()) {
    return { error: 'Password must not be the same as the email.' }
  }
  return { ok: true }
}
