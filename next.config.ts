import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/**
 * A stamp that changes on every build.
 *
 * Nothing in a browser can tell you whether a deployment has picked up the
 * latest code, so "it still doesn't work" and "the fix isn't live yet" look
 * identical. Settings → Diagnostics shows this value; if it has not moved
 * since the last deploy, nothing new is running.
 */
const buildStamp = `${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`

/**
 * Server actions are POSTs that Next refuses to run when the browser's Origin
 * does not match the host it was given. Behind a reverse proxy the two can
 * disagree, and the refusal happens before any application code — so every
 * save fails with nothing shown. The deployment's own domain belongs here;
 * further hosts can be added through SERVER_ACTION_ORIGINS (comma separated)
 * without a code change.
 */
const allowedOrigins = [
  'localhost:3000',
  'mktg-crm-ef1r6x.cranl.net',
  ...(process.env.SERVER_ACTION_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? []),
]

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_STAMP: buildStamp,
  },

  /**
   * Authentication responses must never be cached.
   *
   * /api/auth/csrf issues a token that has to match a cookie set by the same
   * response. If a proxy or the browser serves a stale copy, the two no longer
   * agree and NextAuth rejects the sign-in *before* checking the password —
   * silently, with no error and nothing in the server log. Behind a reverse
   * proxy that is a very easy mistake for the infrastructure to make on our
   * behalf, so say it explicitly.
   */
  async headers() {
    return [{
      source: '/api/auth/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
        { key: 'Pragma',        value: 'no-cache' },
      ],
    }]
  },
  experimental: {
    serverActions: {
      allowedOrigins,
      /**
       * A server action's body defaults to 1 MB, which is fine for a form and
       * far too small for a file. Uploads go to the bucket now and never touch
       * an action — but a deployment with no bucket configured still falls back
       * to sending the bytes this way, and on that path the default meant a
       * photo would not send, with the refusal thrown inside the action where
       * nobody saw it.
       *
       * Generous rather than precise: this is a ceiling on one file, and the
       * real limit on that path is MAX_ATTACHMENT_CHARS, which is smaller.
       */
      bodySizeLimit: '8mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

export default withNextIntl(nextConfig)
