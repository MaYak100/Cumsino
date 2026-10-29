import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0c1513',
        panel: { DEFAULT: '#13201c', 2: '#1a2a25' },
        line: '#24352f',
        fg: '#ede8de',
        muted: '#93a39c',
        paper: '#f3ede2',
        ink: '#121a17',
        brass: '#f2b630',
        hot: '#ff3d6e',
        sky: '#49c6e5',
        mint: '#3ee08f',
      },
      fontFamily: {
        display: ['"Dela Gothic One"', 'Rubik', 'sans-serif'],
        sans: ['Rubik', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
