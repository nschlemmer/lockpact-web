/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--color-bg)',
          secondary: 'var(--color-bg-secondary)',
        },
        card: {
          DEFAULT: 'var(--color-card)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          soft: 'var(--color-accent-soft)',
          hover: 'var(--color-accent-hover)',
        },
        locked: 'var(--color-locked)',
        unlocked: 'var(--color-unlocked)',
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      fontSize: {
        'hero': ['clamp(2.5rem, 5vw + 1rem, 3.75rem)', { lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '800' }],
        'section-title': ['clamp(1.75rem, 2vw + 1rem, 2.25rem)', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '700' }],
        'card-title': ['1.125rem', { lineHeight: '1.35', fontWeight: '700' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        'body': ['1rem', { lineHeight: '1.6' }],
        'sm': ['0.875rem', { lineHeight: '1.5' }],
        'caption': ['0.8125rem', { lineHeight: '1.5', letterSpacing: '0.01em' }],
        'label': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.06em', fontWeight: '600' }],
      },
      borderColor: {
        card: 'var(--color-card-border)',
      },
    },
  },
  plugins: [],
};
