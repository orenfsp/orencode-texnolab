export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#1A1033", soft: "#47415C", muted: "#6B6680" },
        plum: { DEFAULT: "#2B0A5C", soft: "#3D1580" },
        fed: { DEFAULT: "#7B12D9", dark: "#6209B5", tint: "#F2E8FD" },
        field: "#F6F5FA",
        line: "#E2E0E9",
        gold: "#C99A00",
        silver: "#8C96A8",
        bronze: "#B8642B",
        signal: "#B45309",
        danger: "#C2410C",
        ok: "#15803D",
      },
      fontFamily: {
        display: ["Montserrat", "system-ui", "sans-serif"],
        sans: ["Montserrat", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: ["0.8125rem", "1.2rem"],
        sm: ["0.875rem", "1.35rem"],
        base: ["1rem", "1.55rem"],
        lg: ["1.2rem", "1.65rem"],
        xl: ["1.44rem", "1.9rem"],
        "2xl": ["1.728rem", "2.15rem"],
        "3xl": ["2.074rem", "2.5rem"],
      },
      borderRadius: { panel: "4px", control: "4px" },
    },
  },
  plugins: [],
};
