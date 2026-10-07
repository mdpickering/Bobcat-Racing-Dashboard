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
      },
      boxShadow: {
        glow: '0 0 20px -3px rgba(255, 199, 44, 0.2)',
        panel: '0 8px 30px -4px rgba(0, 0, 0, 0.55)',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
