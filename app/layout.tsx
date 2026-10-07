import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider, THEME_BLOCKING_SCRIPT } from '@/components/theme/ThemeProvider'
import { SIDEBAR_BLOCKING_SCRIPT } from '@/lib/sidebarPreference'

// Inter: the neutral, highly legible sans recommended for dashboards/admin tools; self-hosted by Next at build
// time (no runtime request to Google, no layout shift). Exposed as --font-inter and picked up by Tailwind's font-sans.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })
// JetBrains Mono for figures, part numbers and IDs (the telemetry look); exposed as --font-mono for Tailwind's font-mono.
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Bobcat Racing',
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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
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
