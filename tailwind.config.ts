import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        chrome: "#F2F2F7",
        surface: "#FFFFFF"
      },
      boxShadow: {
        card: "0 4px 16px rgba(15, 23, 42, 0.08)",
        cardSoft: "0 2px 10px rgba(15, 23, 42, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
