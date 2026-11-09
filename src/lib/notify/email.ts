/**
 * Notification emails (spec 012 R10, FR-095–FR-098). Server-only.
 *
 * Sent through Resend's HTTP API with fetch, so there's no new dependency;
 * swapping the provider changes this file only. Without RESEND_API_KEY and
 * EMAIL_FROM the email channel is off and settings say so.
 */
import { translatorFor } from './render'

export function emailReady(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM
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

/** Send one email. Returns false on failure; never throws. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!emailReady()) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html }),
    })
    if (!res.ok) console.error('[notify] email refused', res.status, (await res.text()).slice(0, 200))
    return res.ok
  } catch (e) {
    console.error('[notify] email failed', e)
    return false
  }
}
