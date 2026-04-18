import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Odi MRP',
    template: '%s | Odi MRP',
  },
  description: 'Internal manufacturing resource planning system for Odi.',
  robots: 'noindex, nofollow', // Internal tool — keep out of search engines
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">
        {children}
      </body>
    </html>
  )
}
