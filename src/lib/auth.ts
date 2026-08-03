import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      /**
       * Every outcome is logged, because the caller is told the same thing for
       * all of them — a specific answer would let anyone type addresses to
       * find out who works here. That secrecy is right for the browser and
       * useless for whoever has to fix it, so the detail goes to the server
       * log, which only the deployment's owner can read.
       *
       * The password is never logged; its length is, which is what catches a
       * trailing space or a field the browser filled without the app noticing.
       */
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim()

        if (!email || !credentials?.password) {
          console.log('[fluxo:auth] refused — missing email or password')
          return null
        }

        console.log(`[fluxo:auth] attempt for ${email} · password ${credentials.password.length} chars`)

        let member
        try {
          member = await prisma.member.findUnique({ where: { email } })
        } catch (e: unknown) {
          console.log('[fluxo:auth] DATABASE ERROR — this is not a wrong password:', e)
          return null
        }

        if (!member) {
          console.log(`[fluxo:auth] no account with the address ${email}`)
          return null
        }
        if (!member.password_hash) {
          console.log(`[fluxo:auth] ${member.name} has no password set — an admin must set one`)
          return null
        }

        const valid = await bcrypt.compare(credentials.password, member.password_hash)
        if (!valid) {
          console.log(`[fluxo:auth] wrong password for ${member.name}`)
          return null
        }

        console.log(`[fluxo:auth] ✅ ${member.name} signed in`)
        return { id: member.id, email: member.email, name: member.name }
      },
    }),
  ],
  session:   { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string
      return session
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
}
