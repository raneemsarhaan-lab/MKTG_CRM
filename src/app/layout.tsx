import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Fluxo — Creative Operations',
  description: 'Marketing CRM for Forefront Consulting',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
