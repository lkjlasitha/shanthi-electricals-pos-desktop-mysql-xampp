/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // "Copper & Circuit" palette: deep graphite panels, copper-wire accent,
        // warning-tape amber for alerts — grounded in the electrical trade.
        graphite: {
          950: '#14181D',
          900: '#1B2027',
          800: '#232A33',
          700: '#2E3742',
          600: '#3E4A57',
        },
        copper: {
          500: '#C9713D',
          600: '#B35F2E',
          700: '#954C22',
        },
        amber: {
          400: '#F0A93C',
          500: '#E0941F',
        },
        slate: {
          50: '#F5F6F7',
          100: '#EBEDEF',
          200: '#DCE0E4',
        },
      },
      fontFamily: {
        display: ['ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
