import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { SiteFooter } from './site-footer'

export const metadata: Metadata = {
  metadataBase: new URL('https://rota.ugur.dev'),
  title: {
    default: 'Rota',
    template: '%s | Rota',
  },
  description: 'Conversational flight search that shows its work',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Rota',
    description: 'Conversational flight search that shows its work',
    type: 'website',
    url: '/',
    siteName: 'Rota',
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-[#0b0b0f]">
        {children}
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  )
}
