import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        qu: {
          obsidian: '#040811',
          surface: '#0A1526',
          navy: '#0C2340',
          gold: '#FFC72C',
        },
      },
      boxShadow: {
        glow: '0 0 20px -3px rgba(255, 199, 44, 0.25)',
        panel: '0 8px 30px -4px rgba(0, 0, 0, 0.7)',
      },
    },
  },
  plugins: [],
}

export default config
