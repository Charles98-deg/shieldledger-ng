/** @type {import('tailwindcss').Config} */
// Visual system: restrained enterprise fintech.
//   navy  (`adire` scale) — brand shell, primary navigation, money ink accents
//   blue  (`action`)      — primary actions, selection, focus
//   cool grey ground, white surfaces, slate neutrals (`zinc`, remapped light-on-ink)
//   muted state hues      — green safe, amber warning, orange hold, red blocked, sky advisory
// The neutral `zinc` scale is remapped: 950 = page ground, 900 = surface, 100 = primary ink, so every
// screen inherits the theme. Each state hue has a 50 tint for badge/banner grounds and a 300 text shade
// that reads at AA on that tint and on white.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"SL Naira"', '"SL Figures"', '"Atkinson Hyperlegible Next"', "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        mono: ['"SL Naira"', '"Atkinson Hyperlegible Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      // Type scale (1080p screen recording floor: captions 14px, body 15–16px).
      fontSize: {
        "2xs": ["0.78125rem", { lineHeight: "1.1rem", letterSpacing: "0.02em" }], // 12.5px: uppercase badge labels only
        xs: ["0.875rem", { lineHeight: "1.3rem" }],
        sm: ["0.9375rem", { lineHeight: "1.45rem" }],
        base: ["1rem", { lineHeight: "1.55rem" }],
        lg: ["1.125rem", { lineHeight: "1.6rem" }],
        xl: ["1.25rem", { lineHeight: "1.7rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.375rem", { lineHeight: "2.6rem" }],
      },
      // Radius system: badges 4px, controls 6px, panels 12px.
      borderRadius: { sm: "0.25rem", DEFAULT: "0.375rem", md: "0.375rem", lg: "0.75rem", xl: "0.75rem" },
      colors: {
        zinc: {
          50: "#0a1228",
          100: "#0f1a33",
          200: "#1f2a44",
          300: "#34405a",
          400: "#4b5670",
          500: "#5f6a82",
          600: "#8a93a7",
          700: "#d3d9e3",
          800: "#e4e8ef",
          900: "#ffffff",
          950: "#f3f5f8",
        },
        adire: {
          950: "#0a1530",
          900: "#0f1f42",
          800: "#172b55",
          700: "#22396b",
          600: "#2d4a85",
          400: "#7b8db5",
          300: "#a6b3cf",
          200: "#cbd4e6",
          100: "#e5eaf3",
          50: "#f1f4f9",
        },
        action: { 800: "#173d88", 700: "#1c479f", 600: "#2459c4", 300: "#93b0e6", 200: "#c2d3f3", 100: "#dfe8f9", 50: "#eef3fc" },
        emerald: { 50: "#e7f3ec", 200: "#17603e", 300: "#17603e", 400: "#1f7a50", 500: "#2a8a5c", 600: "#1f7a50" },
        amber: { 50: "#faf1dc", 200: "#7a5300", 300: "#7a5300", 400: "#b07a10", 500: "#b07a10" },
        orange: { 50: "#fbeadf", 200: "#8f3f0e", 300: "#8f3f0e", 400: "#c0601f", 500: "#c0601f" },
        red: { 50: "#fbe8e8", 200: "#9e2424", 300: "#9e2424", 400: "#b83232", 500: "#b83232" },
        sky: { 50: "#e8f0f9", 200: "#1d4f86", 300: "#1d4f86", 400: "#2b67a8", 500: "#2b67a8" },
        indigo: { 200: "#172b55", 300: "#2d4a85", 400: "#2d4a85", 500: "#2d4a85" },
      },
    },
  },
  plugins: [],
};
