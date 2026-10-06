import type { Config } from "tailwindcss";

// Farby idú z CSS premenných (globals.css), aby svetlý/tmavý režim prepínal
// jeden súbor. Staré triedy (brand-*, slate-*, white, amber-*, red-*, sky-*)
// sú premapované na tokeny – ešte neprepísané komponenty tak dostanú nový
// vzhľad bez zásahu a nič nesvieti na bielo v tmavom režime.
const v = (name: string) => `var(--${name})`;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: v("paper"),
        "paper-2": v("paper-2"),
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        pig: v("pig"),
        "pig-deep": v("pig-deep"),
        "pig-blush": v("pig-blush"),
        good: v("good"),
        "good-soft": v("good-soft"),
        warn: v("warn"),
        "warn-text": v("warn-text"),
        "warn-soft": v("warn-soft"),
        bad: v("bad"),
        "bad-soft": v("bad-soft"),
        water: v("water"),
        "water-soft": v("water-soft"),

        // Premapovanie starých tried (len dočasne, kým sa obrazovky neprepíšu).
        white: v("paper-2"),
        brand: {
          50: v("paper-2"),
          100: v("line"),
          200: v("line"),
          300: v("pig-blush"),
          400: v("pig"),
          500: v("pig-deep"),
          600: v("ink"),
          700: v("ink"),
          800: v("ink"),
          900: v("ink"),
        },
        slate: {
          50: v("paper"),
          100: v("paper-2"),
          200: v("line"),
          300: v("line"),
          400: v("muted"),
          500: v("muted"),
          600: v("ink"),
          700: v("ink"),
          800: v("ink"),
          900: v("ink"),
        },
        amber: { 50: v("warn-soft"), 100: v("warn-soft"), 200: v("warn"), 300: v("warn"), 400: v("warn"), 500: v("warn-text"), 600: v("warn-text"), 700: v("warn-text"), 800: v("warn-text") },
        red: { 50: v("bad-soft"), 100: v("bad-soft"), 400: v("bad"), 500: v("bad"), 600: v("bad"), 700: v("bad") },
        sky: { 50: v("water-soft"), 100: v("water-soft"), 200: v("water-soft"), 400: v("water"), 500: v("water"), 600: v("water"), 700: v("water") },
        indigo: { 50: v("paper-2"), 100: v("line"), 400: v("muted"), 500: v("ink"), 600: v("ink"), 700: v("ink") },
        green: { 50: v("good-soft"), 100: v("good-soft"), 500: v("good"), 600: v("good"), 700: v("good") },
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "sans-serif"],
      },
      // Tlačová, hranatejšia geometria – zaoblenie minimálne.
      borderRadius: {
        sm: "2px",
        DEFAULT: "2px",
        md: "3px",
        lg: "3px",
        xl: "4px",
        "2xl": "6px",
        "3xl": "10px",
      },
      boxShadow: {
        sm: "3px 3px 0 var(--shadow)",
        DEFAULT: "4px 4px 0 var(--shadow)",
        md: "4px 4px 0 var(--shadow)",
        lg: "5px 5px 0 var(--shadow)",
        xl: "6px 6px 0 var(--shadow)",
        pig: "4px 4px 0 var(--pig-deep)",
      },
    },
  },
  plugins: [],
};

export default config;
