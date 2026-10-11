/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        charcoal: {
          950: 'var(--theme-bg-950, #0c0c0e)',
          900: 'var(--theme-bg-900, #121215)',
          850: 'var(--theme-bg-850, #16161a)',
          800: 'var(--theme-bg-800, #1c1c21)',
          750: 'var(--theme-bg-750, #232329)',
          700: 'var(--theme-bg-700, #2a2a32)',
          600: '#383842',
          500: '#52525e',
        },
        crimson: {
          950: 'var(--theme-accent-dark, #450a0a)',
          900: 'var(--theme-accent-dark, #7f1d1d)',
          800: 'var(--theme-accent, #991b1b)',
          700: 'var(--theme-accent, #b91c1c)',
          600: 'var(--theme-accent, #dc2626)',
          500: 'var(--theme-accent-light, #ef4444)',
          400: 'var(--theme-accent-light, #f87171)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
        sans: ['Segoe UI', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
