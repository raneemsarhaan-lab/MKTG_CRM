/**
 * Sessions, without the negotiation.
 *
 * The sign-in that preceded this one failed in a way nobody could see: the
 * CSRF token and its cookie were paired by a hash of NEXTAUTH_SECRET, and when
 * that pairing broke — a rotated secret, a cached /api/auth/csrf — the
 * credentials handler redirected away *before checking the password*, reported
 * success, and set no session. Four separate things had to agree for a login
 * to work: the cookie name (which depended on whether NEXTAUTH_URL began with
 * https), the token/cookie pair, the proxy's caching, and the library's view
 * of the request host.
 *
 * This replaces all of it with one signed cookie and one fixed name. Nothing
 * is derived from an environment variable except the signing key, and there is
 * no second round trip to get a token first.
 *
 * HMAC via Web Crypto rather than node:crypto, because middleware runs on the
 * edge runtime and has to verify the same cookie the server issues.
 */

export const SESSION_COOKIE = 'fluxo_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30   // 30 days

export interface SessionPayload {
  sub: string        // member id
  email: string
  exp: number        // seconds since epoch
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET is not set — sessions cannot be signed')
  return s
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify'],
  )
}

/** A signed `payload.signature` string to put in the cookie. */
export async function signSession(member: { id: string; email: string }): Promise<string> {
  const payload: SessionPayload = {
    sub:   member.id,
    email: member.email,
    exp:   Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  }
  const body = b64url(enc.encode(JSON.stringify(payload)))
  const sig  = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(body)))
  return `${body}.${b64url(sig)}`
}

/**
 * The payload, or null for anything at all suspect — a bad signature, an
 * expired session, a malformed cookie, a missing secret. Callers get one
 * answer and cannot accidentally trust a half-verified token.
 */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  try {
    const ok = await crypto.subtle.verify('HMAC', await key(), unb64url(sig), enc.encode(body))
    if (!ok) return null

    const payload = JSON.parse(dec.decode(unb64url(body))) as SessionPayload
    if (!payload?.sub || typeof payload.exp !== 'number') return null
    if (payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Cookie attributes.
 *
 * `secure` follows the actual connection rather than an environment variable.
 * NEXTAUTH_URL disagreeing with the browser about https is what made the old
 * cookie name unpredictable; taking it from the request that is being answered
 * cannot disagree with itself.
 */
export function cookieOptions(isHttps: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: isHttps,
    maxAge: SESSION_MAX_AGE,
  }
}
