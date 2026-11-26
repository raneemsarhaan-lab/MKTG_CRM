/**
 * Forgot password (25 Nov 2026). Server-only.
 *
 *   requestReset(email)   makes a one-time link and emails it. Says nothing about whether the
 *                         address has an account: the caller answers every request the same way.
 *   checkToken(token)     whether a link can still be used (the reset page asks before showing the form).
 *   spendToken(token, pw)   sets the new password and spends the link, and every other open link
 *                         of that person.
 *
 * Only a SHA-256 of the token is stored. A link lasts an hour; at most three are sent per person
 * per hour, so the form can't be used to flood someone's inbox.
 */
import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { appUrl, emailReady, sendEmail } from '@/lib/notify/email'

export const RESET_TTL_MIN = 60
export const RESET_PER_HOUR = 3
export const MIN_PASSWORD = 8

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

const COPY = {
  en: {
    subject: 'Reset your Momentum password',
    hello: (n: string) => `Hello ${n},`,
    body: 'Someone asked to reset the password for your Momentum account. If it was you, choose a new password with the button below.',
    button: 'Choose a new password',
    expires: `The link works once, for ${RESET_TTL_MIN} minutes.`,
    ignore: "If you didn't ask, ignore this email: your password stays as it is.",
  },
  ar: {
    subject: 'إعادة تعيين كلمة مرور Momentum',
    hello: (n: string) => `مرحبًا ${n}،`,
    body: 'وصلنا طلب لإعادة تعيين كلمة مرور حسابك على Momentum. إذا كنت أنت من طلبها، اختر كلمة مرور جديدة من الزر أدناه.',
    button: 'اختر كلمة مرور جديدة',
    expires: `يعمل الرابط مرة واحدة فقط، لمدة ${RESET_TTL_MIN} دقيقة.`,
    ignore: 'إذا لم تطلب ذلك، تجاهل هذه الرسالة: كلمة مرورك تبقى كما هي.',
  },
}

function resetEmail(locale: string, name: string, link: string) {
  const ar = locale === 'ar'
  const c = ar ? COPY.ar : COPY.en
  const dir = ar ? 'rtl' : 'ltr'
  const html = `<!doctype html><html lang="${ar ? 'ar' : 'en'}" dir="${dir}"><body style="margin:0;background:#F3F3F7;font-family:Inter,Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;padding:24px;text-align:${ar ? 'right' : 'left'}" dir="${dir}">
    <tr><td style="font:800 20px Montserrat,Arial,sans-serif;color:#14133C;padding-bottom:12px">Momentum</td></tr>
    <tr><td style="font-size:15px;color:#1F2430;padding-bottom:8px">${esc(c.hello(name))}</td></tr>
    <tr><td style="font-size:15px;line-height:1.55;color:#1F2430;padding-bottom:18px">${c.body}</td></tr>
    <tr><td style="padding-bottom:18px"><a href="${esc(link)}" style="display:inline-block;background:#C6F432;color:#14133C;font-weight:700;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px">${c.button}</a></td></tr>
    <tr><td style="font-size:13px;color:#6B7280;padding-bottom:6px">${c.expires}</td></tr>
    <tr><td style="font-size:13px;color:#6B7280">${c.ignore}</td></tr>
    <tr><td style="font-size:12px;color:#9CA3AF;padding-top:16px;word-break:break-all">${esc(link)}</td></tr>
  </table></td></tr></table></body></html>`
  return { subject: c.subject, html }
}

/** The site's address for the link: APP_URL / NEXTAUTH_URL, else the address the request came to. */
/**
 * QA 26 Nov 2026 (F11): the link always points at the app's own address (APP_URL, else NEXTAUTH_URL). The
 * request's address is only trusted outside production: a forged Host header must never decide where a
 * reset link goes. In production with neither set, no link is sent (and the log says why).
 */
function baseUrl(origin: string): string | null {
  const own = appUrl()
  if (own) return own
  return process.env.NODE_ENV === 'production' ? null : origin.replace(/\/$/, '')
}

/**
 * Make and email a reset link if the address has an account. Returns whether email is set up on
 * this app; never whether the account exists.
 */
export async function requestReset(rawEmail: string, origin: string): Promise<{ email: boolean }> {
  const ready = emailReady()
  const email = rawEmail.trim().toLowerCase()
  if (!email || email.length > 200) return { email: ready }
  const member = await prisma.member.findUnique({ where: { email }, select: { id: true, name: true, email: true, locale: true } })
  if (!member) {
    console.log(`[fluxo:reset] request for an address with no account`)
    return { email: ready }
  }
  const recent = await prisma.passwordReset.count({ where: { member_id: member.id, created_at: { gt: new Date(Date.now() - 3600_000) } } })
  if (recent >= RESET_PER_HOUR) {
    console.log(`[fluxo:reset] ${member.name}: ${recent} links in the last hour, no more sent`)
    return { email: ready }
  }
  if (!ready) {
    console.log(`[fluxo:reset] ${member.name} asked for a reset, but email isn't set up on this app`)
    return { email: false }
  }
  const base = baseUrl(origin)
  if (!base) {
    console.log('[fluxo:reset] APP_URL is not set on this server, so no reset link was sent — set APP_URL to the app\'s address')
    return { email: ready }
  }
  const token = randomBytes(32).toString('base64url')
  await prisma.passwordReset.create({ data: { member_id: member.id, token_hash: hash(token), expires_at: new Date(Date.now() + RESET_TTL_MIN * 60_000) } })
  const link = `${base}/reset-password?token=${token}`
  if (process.env.NODE_ENV !== 'production') console.log(`[fluxo:reset] dev link for ${member.email}: ${link}`)
  const { subject, html } = resetEmail(member.locale, member.name, link)
  const sent = await sendEmail(member.email, subject, html)
  console.log(`[fluxo:reset] ${member.name}: link ${sent ? 'emailed' : 'NOT sent (the email provider refused it)'}`)
  return { email: true }
}

type Check = { ok: true; memberId: string; name: string } | { ok: false; reason: 'invalid' | 'expired' | 'used' }

export async function checkToken(token: string | null | undefined): Promise<Check> {
  if (!token || token.length < 20 || token.length > 200) return { ok: false, reason: 'invalid' }
  const row = await prisma.passwordReset.findUnique({ where: { token_hash: hash(token) } })
  if (!row) return { ok: false, reason: 'invalid' }
  if (row.used_at) return { ok: false, reason: 'used' }
  if (row.expires_at.getTime() < Date.now()) return { ok: false, reason: 'expired' }
  const member = await prisma.member.findUnique({ where: { id: row.member_id }, select: { id: true, name: true } })
  if (!member) return { ok: false, reason: 'invalid' }
  return { ok: true, memberId: member.id, name: member.name }
}

export async function spendToken(token: string, password: string): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'short' }> {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 200) return { ok: false, reason: 'short' }
  const check = await checkToken(token)
  if (!check.ok) return check
  const password_hash = await bcrypt.hash(password, 10)
  const now = new Date()
  // Spend the link first, and only if nobody spent it a moment ago: two tabs can't both use it.
  const spent = await prisma.passwordReset.updateMany({ where: { token_hash: hash(token), used_at: null }, data: { used_at: now } })
  if (spent.count !== 1) return { ok: false, reason: 'used' }
  await prisma.$transaction([
    prisma.member.update({ where: { id: check.memberId }, data: { password_hash } }),
    // Every other open link of this person stops working too.
    prisma.passwordReset.updateMany({ where: { member_id: check.memberId, used_at: null }, data: { used_at: now } }),
  ])
  console.log(`[fluxo:reset] ${check.name} set a new password`)
  return { ok: true }
}
