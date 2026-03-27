/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#ff6b2b",
        "accent-dark": "#ff3d00",
        dark: { 900: "#0a0a0b", 800: "#0d1117", 700: "#10141a" },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
