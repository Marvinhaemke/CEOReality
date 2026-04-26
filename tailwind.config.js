/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html'],
  theme: {
    extend: {
      fontFamily: {
        oswald: ['Oswald', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      colors: {
        'brand-dark': '#0a0a0a',
        'brand-orange': '#e60000',
        'brand-red': '#990000',
        'brand-ink': '#111827'
      }
    }
  },
  plugins: []
};
