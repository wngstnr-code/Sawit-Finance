import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FBFBFC',
        'bg-2': '#F4F4F6',
        card: '#FFFFFF',
        line: '#EAEAEC',
        'line-2': '#E0E0E4',
        ink: '#0B0B0C',
        muted: '#5B5D66',
        faint: '#9A9CA4',
        brand: {
          DEFAULT: '#1E7A4F',
          mid: '#2E9E68',
          bright: '#34A86B',
          tint: '#E7F2EC',
        },
        violet: '#9B5DE5',
        orange: '#FB7A3C',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightish: '-0.02em',
        tighter2: '-0.035em',
      },
      maxWidth: {
        content: '1180px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,11,12,0.04), 0 8px 24px -12px rgba(11,11,12,0.10)',
        'card-lg': '0 2px 4px rgba(11,11,12,0.05), 0 24px 48px -20px rgba(11,11,12,0.16)',
        pill: '0 1px 2px rgba(11,11,12,0.08)',
        nav: '0 6px 24px -10px rgba(11,11,12,0.35)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
