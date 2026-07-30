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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const member = await prisma.member.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        })

        if (!member || !member.password_hash) return null

        const valid = await bcrypt.compare(credentials.password, member.password_hash)
        if (!valid) return null

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
