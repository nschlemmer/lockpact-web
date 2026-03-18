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
        'hero': ['clamp(3rem, 6vw + 1rem, 4.5rem)', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '800' }],
        'section-title': ['clamp(2rem, 3vw + 0.5rem, 2.75rem)', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        'card-title': ['1.25rem', { lineHeight: '1.3', fontWeight: '700' }],
        'body-lg': ['1.375rem', { lineHeight: '1.6' }],
        'body': ['1.0625rem', { lineHeight: '1.6' }],
        'sm': ['1rem', { lineHeight: '1.6' }],
        'caption': ['0.875rem', { lineHeight: '1.5', letterSpacing: '0.01em' }],
        'label': ['0.8125rem', { lineHeight: '1.5', letterSpacing: '0.05em', fontWeight: '600' }],
      },
      borderColor: {
        card: 'var(--color-card-border)',
      },
    },
  },
  plugins: [],
};
