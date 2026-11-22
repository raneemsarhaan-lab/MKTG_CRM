/**
 * Notification emails (spec 012 R10, FR-095–FR-098). Server-only.
 *
 * The provider comes from the environment, as on the Forefront website:
 *   RESEND_API_KEY                               Resend's HTTP API (wins if both are set)
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS   any SMTP provider (MailerSend, Google Workspace…)
 *   neither                                      nothing is sent, and Notification settings says email isn't set up
 * Sender: EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME (defaults no-reply@forefront.consulting,
 * "Forefront Consulting"); the older EMAIL_FROM still works. The sending domain has to
 * be verified with the provider, or every email fails.
 *
 * Sends are paced to EMAIL_RATE_PER_SEC (default 2, Resend's default limit), and a
 * "too fast" or passing refusal is tried again, so the 08:30 summaries to the whole
 * team aren't refused.
 */
import type { Transporter } from 'nodemailer'
import { translatorFor } from './render'

type Env = Record<string, string | undefined>
export type EmailProvider = 'resend' | 'smtp'

/** Which provider sends: Resend if its key is set, else SMTP if a host is, else none. */
export function emailProvider(env: Env = process.env): EmailProvider | null {
  if (env.RESEND_API_KEY) return 'resend'
  if (env.SMTP_HOST) return 'smtp'
  return null
}

export function emailReady(env: Env = process.env): boolean {
  return emailProvider(env) !== null
}

export const DEFAULT_FROM_ADDRESS = 'no-reply@forefront.consulting'
export const DEFAULT_FROM_NAME = 'Forefront Consulting'

/** The sender: EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME, else the older EMAIL_FROM, else the defaults. */
export function emailFrom(env: Env = process.env): string {
  if (!env.EMAIL_FROM_ADDRESS && !env.EMAIL_FROM_NAME && env.EMAIL_FROM) return env.EMAIL_FROM
  const address = env.EMAIL_FROM_ADDRESS || DEFAULT_FROM_ADDRESS
  const name = (env.EMAIL_FROM_NAME ?? DEFAULT_FROM_NAME).replace(/["\\\r\n]/g, '').trim()
  return name ? `"${name}" <${address}>` : address
}

/** Emails per second (EMAIL_RATE_PER_SEC, default 2). */
export function emailRate(env: Env = process.env): number {
  const n = Number(env.EMAIL_RATE_PER_SEC)
  return Number.isFinite(n) && n > 0 ? n : 2
}

export function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '')
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

/** One email's HTML: the items (sentence + link), in the member's language and direction. */
export function emailHtml(locale: string, items: { html: string; url: string; snippet?: string }[], intro?: string): string {
  const { locale: l, t } = translatorFor(locale)
  const dir = l === 'ar' ? 'rtl' : 'ltr'
  const base = appUrl()
  const rows = items.map(i => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #ECECF1">
      <div style="font-size:15px;line-height:1.5;color:#1F2430">${i.html}</div>
      ${i.snippet ? `<div style="font-size:13px;color:#6B7280;margin-top:4px">“${esc(i.snippet)}”</div>` : ''}
      <a href="${base}${i.url}" style="display:inline-block;margin-top:8px;color:#2563EB;font-weight:600;font-size:13px;text-decoration:none">${t('email.open')}</a>
    </td></tr>`).join('')
  return `<!doctype html><html lang="${l}" dir="${dir}"><body style="margin:0;background:#F3F3F7;font-family:Inter,Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;padding:20px 24px;text-align:${dir === 'rtl' ? 'right' : 'left'}" dir="${dir}">
    <tr><td style="font:800 20px Montserrat,Arial,sans-serif;color:#14133C;padding-bottom:8px">Momentum</td></tr>
    ${intro ? `<tr><td style="font-size:14px;color:#4A5061;padding-bottom:6px">${esc(intro)}</td></tr>` : ''}
    ${rows}
    <tr><td style="font-size:12px;color:#6B7280;padding-top:16px">${t('email.footer')} <a href="${base}/notifications/settings" style="color:#2563EB">${t('email.manage')}</a></td></tr>
  </table></td></tr></table></body></html>`
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** The pace: each send waits for its slot, 1/rate seconds after the one before. */
let nextSlot = 0
async function waitTurn(): Promise<void> {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + 1000 / emailRate()
  if (at > now) await sleep(at - now)
}

/** One try's outcome: sent, refused for good, or worth trying again (after `wait` ms, if the provider said). */
type Attempt = { ok: true } | { ok: false; retry: boolean; wait?: number; reason: string }

async function viaResend(to: string, subject: string, html: string): Promise<Attempt> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: emailFrom(), to: [to], subject, html }),
  })
  if (res.ok) return { ok: true }
  const after = Number(res.headers.get('retry-after'))
  return {
    ok: false, retry: res.status === 429 || res.status >= 500,
    wait: Number.isFinite(after) && after > 0 ? after * 1000 : undefined,
    reason: `${res.status} ${(await res.text()).slice(0, 200)}`,
  }
}

let smtp: { key: string; t: Transporter } | null = null
async function viaSmtp(to: string, subject: string, html: string): Promise<Attempt> {
  const env = process.env
  const port = Number(env.SMTP_PORT) || 587
  const key = [env.SMTP_HOST, port, env.SMTP_USER].join('|')
  if (!smtp || smtp.key !== key) {
    const nodemailer = (await import('nodemailer')).default
    smtp = {
      key,
      t: nodemailer.createTransport({
        host: env.SMTP_HOST, port,
        secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
      }),
    }
  }
  try {
    await smtp.t.sendMail({ from: emailFrom(), to, subject, html })
    return { ok: true }
  } catch (e) {
    const err = e as { responseCode?: number; code?: string; message?: string }
    // 4xx replies and dropped connections pass; 5xx replies (bad sender, bad login) don't.
    const passing = (err.responseCode !== undefined && err.responseCode < 500) || ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET'].includes(err.code ?? '')
    return { ok: false, retry: passing, reason: `${err.responseCode ?? err.code ?? ''} ${err.message ?? e}`.trim().slice(0, 200) }
  }
}

const TRIES = 4

/** Send one email through the configured provider, at the set pace. Returns false on failure; never throws. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const provider = emailProvider()
  if (!provider) return false
  for (let i = 0; i < TRIES; i++) {
    await waitTurn()
    let r: Attempt
    try {
      r = provider === 'resend' ? await viaResend(to, subject, html) : await viaSmtp(to, subject, html)
    } catch (e) {
      r = { ok: false, retry: true, reason: String(e).slice(0, 200) }
    }
    if (r.ok) return true
    if (!r.retry || i === TRIES - 1) {
      console.error(`[notify] email refused (${provider})`, r.reason)
      return false
    }
    await sleep(r.wait ?? 1000 * 2 ** i)
  }
  return false
}
