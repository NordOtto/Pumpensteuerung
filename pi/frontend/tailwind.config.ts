import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design-Brief: strikt einhalten
        background: "#ffffff",
        primary: {
          DEFAULT: "#2588eb",
          foreground: "#ffffff",
        },
        ok: "#14c957",
        warn: "#ffa000",
        danger: "#ff0000",
        muted: {
          DEFAULT: "#f4f6f8",
          foreground: "#5b6b7a",
        },
        border: "#e5eaf0",
        ring: "#2588eb",
      },
      borderRadius: {
        lg: "0.875rem",
        md: "0.625rem",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Inter", "Segoe UI", "sans-serif"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 220ms ease-out",
      },
    },
  },
  plugins: [animate],
};
export default config;
