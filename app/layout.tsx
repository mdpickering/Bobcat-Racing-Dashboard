import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bobcat Racing — Engineering Operations',
  description: 'Baja SAE team operations platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
