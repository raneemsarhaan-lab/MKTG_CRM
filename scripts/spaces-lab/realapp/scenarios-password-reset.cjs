// Forgot password (25 Nov 2026): the sign-in link, the same answer for an unknown address, a reset link
// that works once, and the refusals for used, made-up and expired links. Runs signed out, in its own context.
// The link is made in SQL (as the email would carry it), so this runs with or without an email provider.
module.exports = (EMAIL, psql, ok) => [
  {
    id: 'password-reset-forgot-and-reset', as: 'admin',
    async run({ page, BASE }) {
      const email = EMAIL.content
      const saved = psql(`select coalesce(password_hash,'') from members where email='${email}'`)
      const ctx = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 } })
      const p = await ctx.newPage()
      const token = 'labtoken' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
      const sha = t => `encode(sha256('${t}'::bytea),'hex')`
      try {
        psql(`delete from password_resets where member_id=(select id from members where email='${email}')`)
        await p.goto(BASE + '/login')
        await p.click('[data-forgot-link]')
        await p.waitForURL('**/forgot-password')
        // An unknown address: the same answer as a known one, and no link made.
        const before = psql('select count(*) from password_resets')
        await p.fill('input[type=email]', `nobody-${Date.now()}@example.com`)
        await p.click('button[type=submit]')
        await p.waitForSelector('[data-forgot-done]')
        ok(psql('select count(*) from password_resets') === before, 'an unknown address made a reset link')
        // A link as the email carries it.
        psql(`insert into password_resets (id, member_id, token_hash, expires_at) select gen_random_uuid(), id, ${sha(token)}, now() + interval '1 hour' from members where email='${email}'`)
        await p.goto(BASE + '/reset-password?token=' + token)
        await p.fill('[data-reset-pw]', 'LabReset#2026'); await p.fill('[data-reset-again]', 'LabReset#20')
        await p.click('button[type=submit]')
        ok(/match/.test(await p.textContent('[role=alert]')), 'mismatched passwords were not refused')
        await p.fill('[data-reset-again]', 'LabReset#2026')
        await p.click('button[type=submit]')
        await p.waitForSelector('[data-reset-done]')
        const r = await p.request.post(BASE + '/api/login', { data: { email, password: 'LabReset#2026' } })
        ok(r.ok(), 'could not sign in with the new password')
        await p.goto(BASE + '/reset-password?token=' + token)
        ok(await p.getAttribute('[data-reset-bad]', 'data-reset-bad') === 'used', 'a used link still worked')
        const again = await p.request.post(BASE + '/api/password/reset', { data: { token, password: 'Another#2026' } })
        ok(again.status() === 410, 'a used link was accepted by the API')
        await p.goto(BASE + '/reset-password?token=' + 'z'.repeat(43))
        ok(await p.getAttribute('[data-reset-bad]', 'data-reset-bad') === 'invalid', 'a made-up link was not refused')
        const old = token + 'old'
        psql(`insert into password_resets (id, member_id, token_hash, expires_at) select gen_random_uuid(), id, ${sha(old)}, now() - interval '1 minute' from members where email='${email}'`)
        await p.goto(BASE + '/reset-password?token=' + old)
        ok(await p.getAttribute('[data-reset-bad]', 'data-reset-bad') === 'expired', 'an expired link was not refused')
      } finally {
        psql(`update members set password_hash=${saved ? `'${saved}'` : 'null'} where email='${email}'`)
        psql(`delete from password_resets where member_id=(select id from members where email='${email}')`)
        await ctx.close()
      }
    },
  },
]
