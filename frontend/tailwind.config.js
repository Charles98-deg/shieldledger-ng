/** @type {import('tailwindcss').Config} */
// Visual world: adire (Nigerian indigo resist-dyed cloth), light "undyed cotton" grounds for an
// office-lit AP desk and a compressed screen recording.
// The neutral `zinc` scale is remapped light-on-ink: 950 = page ground, 100 = primary ink. That way
// every screen inherits the theme. State hues are re-toned so their text shades read on light grounds.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"SL Naira"', '"SL Figures"', '"Atkinson Hyperlegible Next"', "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        mono: ['"SL Naira"', '"Atkinson Hyperlegible Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      // Floor for 1080p screen recording: captions 13px, body 15px.
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.15rem" }],
        sm: ["0.9375rem", { lineHeight: "1.4rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
      },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.375rem" },
      colors: {
        zinc: {
          50: "#0d1430",
          100: "#121a38",
          200: "#1c2545",
          300: "#2c3555",
          400: "#454e6e",
          500: "#575f7e",
          600: "#767c97",
          700: "#c3c7d4",
          800: "#dcdfe7",
          900: "#ffffff",
          950: "#f3f3ef",
        },
        adire: {
          950: "#111a3f",
          900: "#17235a",
          800: "#1d2d6b",
          700: "#263a82",
          600: "#30479b",
          400: "#7d8cc4",
          300: "#a3afd9",
          200: "#c8d0ea",
          100: "#e4e8f5",
          50: "#f0f2fa",
        },
        emerald: { 200: "#0f5c37", 300: "#0f5c37", 400: "#167a4a", 500: "#1b8a55", 600: "#146b41" },
        amber: { 200: "#6e4600", 300: "#6e4600", 400: "#b27700", 500: "#b27700" },
        orange: { 200: "#8a3409", 300: "#8a3409", 400: "#c2531a", 500: "#c2531a" },
        red: { 200: "#9b1c1c", 300: "#9b1c1c", 400: "#c42b2b", 500: "#c42b2b" },
        sky: { 200: "#0b4f7c", 300: "#0b4f7c", 400: "#1667a0", 500: "#1667a0" },
        indigo: { 200: "#1d2d6b", 300: "#30479b", 400: "#30479b", 500: "#30479b" },
      },
    },
  },
  plugins: [],
};
