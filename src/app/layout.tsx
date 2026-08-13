import type { Metadata } from 'next'
import { Montserrat, Inter, Caveat } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getLocale } from 'next-intl/server'
import { Providers } from '@/components/shared/Providers'
import { BootCheck } from '@/components/shared/BootCheck'
import './globals.css'

/**
 * Watchdog for a page whose JavaScript never starts.
 *
 * When a chunk fails to load — a build served by one replica while another
 * answers for its assets, a proxy that mangles /_next/static, an extension
 * blocking scripts — React never hydrates. Every button then does nothing at
 * all: no error, no loading state, no message. It is indistinguishable from a
 * wrong password, and it cost this project several days.
 *
 * This is written inline into the HTML precisely so that it survives the
 * failure it reports on. Anything loaded from a file would be silenced by the
 * same problem. It waits eight seconds for BootCheck to raise the flag, and if
 * it never comes, says so on the page along with the URL that failed.
 */
const BOOT_WATCHDOG = `
(function () {
  var failed = [];
  addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SCRIPT' && t.src) failed.push(t.src);
  }, true);

  function show(msg, detail) {
    var d = document.createElement('div');
    d.setAttribute('role', 'alert');
    d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
      'background:#C0453E;color:#fff;font:13px/1.5 system-ui,sans-serif;padding:12px 16px';
    d.innerHTML = '<strong>' + msg + '</strong><br>' +
      '<span style="opacity:.85;word-break:break-all">' + detail + '</span>';
    document.body.appendChild(d);
  }

  setTimeout(function () {
    if (window.__fluxoHydrated) return;
    if (failed.length) {
      show('This page could not load its code, so nothing on it works.',
           'Failed to load: ' + failed.join(', ') + ' — send this line on.');
    } else {
      show('This page loaded its code but it never started, so nothing on it works.',
           'Scripts fetched without error; React did not run. Open the console and send the first red line.');
    }
  }, 8000);
})();
`

// Self-hosted by next/font — the handoff forbids shipping the Google Fonts
// CDN link. Weights are exactly those the spec calls for (§11).
const montserrat = Montserrat({
  subsets:  ['latin'],
  weight:   ['600', '700', '800', '900'],
  variable: '--font-montserrat',
  display:  'swap',
})

const inter = Inter({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display:  'swap',
})

const caveat = Caveat({
  subsets:  ['latin'],
  weight:   ['700'],
  variable: '--font-caveat',
  display:  'swap',
})

export const metadata: Metadata = {
  title: 'Momentum — Creative Operations',
  description: 'Marketing CRM for Forefront Consulting',
  // Next serves app/icon.svg as the favicon automatically; naming it here as
  // well keeps the tab icon working when a browser prefers an explicit link.
  icons: { icon: '/icon.svg' },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale   = await getLocale()
  const messages = await getMessages()
  const dir      = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${montserrat.variable} ${inter.variable} ${caveat.variable}`}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
        <BootCheck />
        <Providers>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </Providers>
      </body>
    </html>
  )
}
