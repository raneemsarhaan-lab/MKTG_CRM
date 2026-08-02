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
  experimental: {
    serverActions: {
      allowedOrigins,
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
