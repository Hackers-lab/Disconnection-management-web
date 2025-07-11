import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Consumer Disconnection Management',
  description: 'Created with Love by Pramod Verma',
  generator: 'v2.01',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
