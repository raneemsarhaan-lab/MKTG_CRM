import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getLocale } from 'next-intl/server'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fluxo — Creative Operations',
  description: 'Marketing CRM for Forefront Consulting',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale   = await getLocale()
  const messages = await getMessages()
  const dir      = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <html lang={locale} dir={dir}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
