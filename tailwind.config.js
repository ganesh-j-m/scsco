/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Poppins", "system-ui", "sans-serif", "Noto Sans Devanagari"] },
      colors: {
        brand: { 50: "#eef4fb", 100: "#d9e6f5", 500: "#1f5fa8", 600: "#194f8c", 700: "#143f70", 900: "#0c2848" },
        accent: { 500: "#c8932b", 600: "#a77a22" },
      },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08)" },
    },
  },
  plugins: [],
};
