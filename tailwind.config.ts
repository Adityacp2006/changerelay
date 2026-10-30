import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FBFAF7', card: '#FFFFFF', ink: '#14202B', mute: '#5B6672', line: '#E6E2DA',
        teal: { 50: '#EAF6F4', 100: '#CFEAE5', 600: '#0E7C72', 700: '#0B645C', 800: '#084E48' },
        indigo: { 50: '#EEF0FD', 100: '#DDE1FA', 600: '#4A4FD6', 700: '#3A3EB0' },
        ok: '#1B7F4B', warn: '#B45309', bad: '#B42318',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'system-ui', 'sans-serif'],
        sans: ['"Public Sans Variable"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        settle: { '0%': { transform: 'scale(.96)', opacity: '.4' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        pulseRing: { '0%,100%': { boxShadow: '0 0 0 0 rgba(74,79,214,.35)' }, '50%': { boxShadow: '0 0 0 6px rgba(74,79,214,0)' } },
      },
      animation: { settle: 'settle .35s ease-out', pulseRing: 'pulseRing 1.6s ease-in-out infinite' },
    },
  },
  plugins: [],
} satisfies Config;
