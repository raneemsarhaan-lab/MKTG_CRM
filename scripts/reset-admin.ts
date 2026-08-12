import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

/**
 * Break-glass admin reset, driven by environment variables.
 *
 * Locking yourself out of the only admin account is a dead end: every way to
 * set a password lives behind a sign-in. The database is reachable only from
 * inside the deployment's own network, so there is no console to fall back on
 * either — the account can only be repaired by something running in there.
 *
 * Set ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD, redeploy, sign in, then
 * delete both variables. Leaving them set is not a security hole — anyone who
 * can read them can already read DATABASE_URL and change the row directly —
 * but it does mean the password silently resets on every restart, which will
 * be baffling in a month. The script says so on its way out.
 *
 * Nothing happens unless both variables are present, so this is inert on an
 * ordinary deploy.
 */

const prisma = new PrismaClient()

async function main() {
  const email    = process.env.ADMIN_RESET_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_RESET_PASSWORD

  if (!email || !password) return          // the normal case: nothing to do

  if (password.length < 8) {
    console.error('✖ ADMIN_RESET_PASSWORD must be at least 8 characters. No change made.')
    process.exitCode = 1
    return
  }

  const password_hash = await bcrypt.hash(password, 10)

  // If this address was removed in the app it carries a tombstone, and the
  // importers will refuse to re-create it. This script is the deliberate
  // override — someone with deployment access has asked for the account back.
  await prisma.tombstone.deleteMany({ where: { kind: 'member', key: email } })

  const existing = await prisma.member.findUnique({ where: { email } })

  if (existing) {
    await prisma.member.update({
      where: { id: existing.id },
      // Access is forced to admin as well: an account that can sign in but
      // cannot reach Settings is only half a way back in.
      data:  { password_hash, access: 'admin' },
    })
    console.log(`🔑 Reset the password for ${existing.name} <${email}> and confirmed admin access.`)
  } else {
    const created = await prisma.member.create({
      data: {
        name: email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        email,
        role: 'Marketing Manager',
        access: 'admin',
        capacity_hrs_wk: 40,
        status: 'Available',
        password_hash,
      },
    })
    console.log(`🔑 Created admin account ${created.name} <${email}>.`)
  }

  console.log('   Sign in, then remove ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD —')
  console.log('   while they are set, this password is reapplied on every restart.')
}

main()
  .catch(e => { console.error('✖ Admin reset failed:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
