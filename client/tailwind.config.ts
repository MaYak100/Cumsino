import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          900: '#0d1f0d',
          800: '#1a3a1a',
          700: '#2a4a2a',
          600: '#3a6a3a',
        },
        gold: {
          DEFAULT: '#ffd700',
          dark: '#cc9900',
        },
      },
      fontFamily: {
        casino: ['Georgia', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
