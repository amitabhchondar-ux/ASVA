/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#171a24",
        "paper-deep": "#10131b",
        "paper-pale": "#f1eadf",
        ink: "#f4eee6",
        "ink-soft": "#b9b4ae",
        walnut: "#3a2118",
        "walnut-deep": "#1c0e0a",
        accent: "#c87046",
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', 'Baskerville', '"Times New Roman"', 'serif'],
        mono: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

