import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        mute: 'var(--mute)',
        brand: 'var(--brand)',
        'brand-ink': 'var(--brand-ink)',
        soft: 'var(--soft)',
        bad: 'var(--bad)',
        good: 'var(--good)',
      },
    },
  },
  plugins: [],
};
export default config;
