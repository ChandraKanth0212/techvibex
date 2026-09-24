/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        rail: {
          dark: '#0B0F19',
          card: '#111827',
          border: '#1E293B',
          hover: '#1F293D',
          accent: '#3B82F6',
          amber: '#F59E0B',
          emerald: '#10B981',
          rose: '#F43F5E',
          cyan: '#06B6D4'
        }
      }
    },
  },
  plugins: [],
}
