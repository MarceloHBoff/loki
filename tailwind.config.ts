import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        loki: {
          bg: '#1c1f24',
          'bg-dark': '#181b20',
          surface: '#20242b',
          'surface-hover': '#232730',
          'surface-active': '#262a31',
          input: '#161a1f',
          border: '#2a2e36',
          'border-subtle': '#20232a',
          'border-alt': '#2e333c',
          'border-hover': '#3a414c',
          text: '#e6e8eb',
          'text-strong': '#f0f2f5',
          'text-muted': '#c5c8ce',
          'text-dim': '#98a0ad',
          'text-faint': '#7d8593',
          'text-fainter': '#6f7783',
          accent: '#4d7be2',
          'accent-hover': '#5b8df0',
          'accent-light': '#82a8ff',
          danger: '#f08585',
          'danger-hover': '#ff9999',
          'danger-bg': '#2c1818',
          'danger-border': '#6a3030',
          success: '#6f8e6f',
          // kind palette
          'kind-image-bg': '#294a3a',
          'kind-image-fg': '#9be3b4',
          'kind-link-bg': '#2a3a5a',
          'kind-link-fg': '#9bb5ff',
          'kind-code-bg': '#4a3a2a',
          'kind-code-fg': '#f1c08e',
          'kind-html-bg': '#4a2a4a',
          'kind-html-fg': '#e89be3',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Inter',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
