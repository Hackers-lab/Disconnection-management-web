import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Disconnection Management',
  description: 'Created with lova by Pramod Verma',
  generator: 'v0.2',
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
