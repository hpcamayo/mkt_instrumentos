import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./components_v0/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#f8fafc",
        foreground: "#1f2933",
        card: "#ffffff",
        "card-foreground": "#1f2933",
        primary: "#b7791f",
        "primary-foreground": "#ffffff",
        secondary: "#f1f5f9",
        "secondary-foreground": "#1f2933",
        muted: "#f1f5f9",
        "muted-foreground": "#64748b",
        accent: "#fff7ed",
        "accent-foreground": "#7c2d12",
        border: "#e2e8f0",
        input: "#e2e8f0",
        ring: "#b7791f",
        destructive: "#dc2626",
        ink: "#1f2933",
        brass: "#b7791f",
        cedar: "#7c2d12",
        mist: "#f8fafc",
      },
    },
  },
  plugins: [],
};

export default config;
