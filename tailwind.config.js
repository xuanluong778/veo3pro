/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  prefix: 'tw-',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        va: {
          bg: '#0b1220',
          panel: '#0f172a',
          line: '#1e293b',
          muted: '#94a3b8',
          accent: '#38bdf8',
          accentDim: 'rgba(56, 189, 248, 0.12)',
        },
      },
    },
  },
  plugins: [],
};
