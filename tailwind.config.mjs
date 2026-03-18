/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0A0A0F',
          secondary: '#141420',
        },
        card: {
          DEFAULT: '#1C1C2E',
        },
        accent: {
          DEFAULT: '#6366F1',
          soft: 'rgba(99,102,241,0.15)',
          hover: '#818CF8',
          light: '#4F46E5',
        },
        locked: '#EF4444',
        unlocked: '#10B981',
        text: {
          primary: '#F0F0F5',
          secondary: '#8E8EA0',
          tertiary: '#5A5A6E',
        },
        // Light mode overrides (used via CSS custom properties)
        'light-bg': '#FFFFFF',
        'light-bg-secondary': '#F5F5F7',
        'light-card': '#FFFFFF',
        'light-accent': '#4F46E5',
        'light-text-primary': '#1A1A2E',
        'light-text-secondary': '#6B7280',
        'light-text-tertiary': '#9CA3AF',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      borderColor: {
        card: 'rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
};
