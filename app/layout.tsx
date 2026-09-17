import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider, THEME_BLOCKING_SCRIPT } from '@/components/theme/ThemeProvider'

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
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BLOCKING_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
