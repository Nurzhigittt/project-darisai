import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        "surface-raised": "rgb(var(--surface-raised-rgb) / <alpha-value>)",
        foreground: "rgb(var(--foreground-rgb) / <alpha-value>)",
        primary: "rgb(var(--primary-rgb) / <alpha-value>)",
        "primary-foreground": "rgb(var(--primary-foreground-rgb) / <alpha-value>)",
        secondary: "rgb(var(--secondary-rgb) / <alpha-value>)",
        "primary-strong": "rgb(var(--primary-strong-rgb) / <alpha-value>)",
        "primary-soft": "rgb(var(--primary-soft-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        positive: "rgb(var(--positive-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        border: "rgb(var(--border-rgb) / <alpha-value>)",
        "ripple-low": "rgb(var(--ripple-low-rgb) / <alpha-value>)",
        "ripple-attention": "rgb(var(--ripple-attention-rgb) / <alpha-value>)",
        "ripple-warm": "rgb(var(--ripple-warm-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Geologica", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Geologica", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 24px 70px -32px rgb(var(--shadow-color) / 0.28)",
        lift: "0 12px 32px -18px rgb(var(--shadow-color) / 0.35)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.92" },
          "50%": { transform: "scale(1.018)", opacity: "1" },
        },
        ripple: {
          "0%": { transform: "scale(0.72)", opacity: "0.55" },
          "100%": { transform: "scale(1.5)", opacity: "0" },
        },
        "fade-up": {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        breathe: "breathe 4.5s ease-in-out infinite",
        ripple: "ripple 2.4s ease-out infinite",
        "fade-up": "fade-up 450ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
