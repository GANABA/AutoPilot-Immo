/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        noir:       '#0A0A0F',
        ardoise:    '#141420',
        charbon:    '#1F1F2E',
        'charbon-light': '#2A2A3C',
        or:         '#C9A96E',
        'or-light': '#DFC08A',
        'or-dark':  '#A8823A',
        'or-pale':  '#F5EDD8',
        creme:      '#F8F6F1',
        lin:        '#E8E2D5',
        sable:      '#9B9488',
        'sable-dark': '#6B6459',
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans:  ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card':    '0 1px 3px 0 rgba(10,10,15,0.06), 0 1px 2px -1px rgba(10,10,15,0.06)',
        'card-md': '0 4px 12px 0 rgba(10,10,15,0.08), 0 2px 4px -2px rgba(10,10,15,0.04)',
        'card-lg': '0 8px 30px 0 rgba(10,10,15,0.12), 0 4px 8px -4px rgba(10,10,15,0.06)',
        'or':      '0 4px 16px 0 rgba(201,169,110,0.35)',
      },
    },
  },
  plugins: [],
}
