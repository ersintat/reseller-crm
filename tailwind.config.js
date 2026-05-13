/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigoBrand: '#012354',
        psnsBlue: '#012354',
        psnsMist: '#e5ebf0',
        psnsOrange: '#ec8237',
        psnsCoral: '#f46033',
      },
    },
  },
  plugins: [],
};
