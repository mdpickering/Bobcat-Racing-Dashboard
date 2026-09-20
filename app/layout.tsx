import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider, THEME_BLOCKING_SCRIPT } from '@/components/theme/ThemeProvider'
import { SIDEBAR_BLOCKING_SCRIPT } from '@/lib/sidebarPreference'

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
    // suppressHydrationWarning: the blocking scripts below set data-theme / data-sidebar
    // on <html> before React hydrates, which React would otherwise flag as extra attributes.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BLOCKING_SCRIPT }} />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BLOCKING_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
