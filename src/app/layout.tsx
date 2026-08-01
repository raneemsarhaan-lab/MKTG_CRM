import type { Metadata } from 'next'
import { Montserrat, Inter, Caveat } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getLocale } from 'next-intl/server'
import { Providers } from '@/components/shared/Providers'
import './globals.css'

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
  title: 'Fluxo — Creative Operations',
  description: 'Marketing CRM for Forefront Consulting',
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
        <Providers>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </Providers>
      </body>
    </html>
  )
}
