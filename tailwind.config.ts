import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // 13px is the minimum body size (was 12px); title/section sizes come from the standard scale
      // 2xs (12px) is the smallest text the app uses: captions, meta lines, table headers
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }],
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],
      },
      colors: {
        qu: {
          obsidian: '#040811',
          surface: '#0A1526',
          navy: '#0C2340',
          gold: '#FFC72C',
          goldHover: '#FBBF24',
          steel: '#5B7285',
          blue: '#3E7CB1',
        },
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        'text-primary': 'rgb(var(--text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--text-secondary) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        // status meaning is defined once, in globals.css, for both themes
        'status-success': 'rgb(var(--status-success) / <alpha-value>)',
        'status-warning': 'rgb(var(--status-warning) / <alpha-value>)',
        'status-danger': 'rgb(var(--status-danger) / <alpha-value>)',
        'status-info': 'rgb(var(--status-info) / <alpha-value>)',
        // set per workspace on the shell root (data-workspace)
        ws: 'rgb(var(--ws-accent) / <alpha-value>)',
        'accent-blue': 'rgb(var(--accent-blue) / <alpha-value>)',
        // shadcn/ui vocabulary (components in components/shadcn) mapped onto the tokens above, so a component
        // added with `npx shadcn@latest add` follows the app's theme instead of bringing its own palette.
        // NOTE: shadcn's `accent` (a hover background) is deliberately NOT mapped -- here `accent` is the gold
        // text colour. After adding a component, replace any bg-accent / text-accent-foreground in it with
        // bg-surface-raised / text-text-primary.
        background: 'rgb(var(--bg) / <alpha-value>)',
        foreground: 'rgb(var(--text-primary) / <alpha-value>)',
        card: { DEFAULT: 'rgb(var(--surface) / <alpha-value>)', foreground: 'rgb(var(--text-primary) / <alpha-value>)' },
        popover: { DEFAULT: 'rgb(var(--surface-raised) / <alpha-value>)', foreground: 'rgb(var(--text-primary) / <alpha-value>)' },
        primary: { DEFAULT: '#FFC72C', foreground: '#0C2340' },
        secondary: { DEFAULT: 'rgb(var(--surface-raised) / <alpha-value>)', foreground: 'rgb(var(--text-primary) / <alpha-value>)' },
        muted: { DEFAULT: 'rgb(var(--surface) / <alpha-value>)', foreground: 'rgb(var(--text-muted) / <alpha-value>)' },
        destructive: { DEFAULT: 'rgb(var(--status-danger) / <alpha-value>)', foreground: 'rgb(var(--bg) / <alpha-value>)' },
        input: 'rgb(var(--border) / <alpha-value>)',
        ring: 'rgb(var(--accent-blue) / <alpha-value>)',
      },
      boxShadow: {
        glow: '0 0 20px -3px rgba(255, 199, 44, 0.2)',
        panel: '0 8px 30px -4px rgba(0, 0, 0, 0.55)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
