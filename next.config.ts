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
      /**
       * Nothing under /api may be cached. Not one of these routes is a
       * document: they are sign-ins, uploads, and reports about this
       * deployment, and every one of them is personal to the request.
       *
       * This used to name only /api/auth, and something in front of the app
       * took the silence as permission. An upload POST was answered from
       * cache with the reply to somebody's earlier upload — a 200, with a
       * real attachment in it, for a file the server never saw. The browser
       * was told it had worked, no object reached the bucket, and no row was
       * written. Three days of "the upload does nothing" was that, and from
       * the panel it is indistinguishable from a broken feature.
       */
      source: '/api/:path*',
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
    /**
     * Every request answered by middleware.ts — which is every attachment
     * upload, since the matcher below only excludes the sign-in routes — has
     * its body cloned so middleware could inspect it, and Next silently caps
     * that clone at 10 MB unless told otherwise: anything past the cap is cut
     * off mid-stream, not rejected, so the multipart body loses its closing
     * boundary and /api/attachments/[ref] fails with "That upload could not
     * be read" — which reads as a broken upload rather than a size ceiling,
     * and hits any file over 10 MB. A one-page image clears that easily; an
     * exported deck or brief rarely does. Matched to MAX_UPLOAD_BYTES in
     * src/lib/attachments.ts, the limit that is meant to govern this.
     */
    proxyClientMaxBodySize: '200mb',
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
