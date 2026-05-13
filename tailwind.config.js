/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigoBrand: 'var(--psns-navy)',
        psnsBlue: 'var(--psns-navy)',
        psnsMist: 'var(--psns-surface)',
        psnsOrange: 'var(--psns-orange)',
        psnsCoral: 'var(--psns-coral)',
        psnsWhite: 'var(--psns-white)',
      },
    },
  },
  plugins: [],
};
