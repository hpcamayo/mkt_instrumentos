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
        background: "#ffffff",
        foreground: "#101217",
        card: "#ffffff",
        "card-foreground": "#101217",
        primary: "#f1ea16",
        "primary-foreground": "#050608",
        secondary: "#f1f3f5",
        "secondary-foreground": "#101217",
        muted: "#f1f3f5",
        "muted-foreground": "#9da3af",
        accent: "#f0f6ff",
        "accent-foreground": "#6ba6ff",
        border: "#e9edf3",
        input: "#c8cdd6",
        ring: "#6ba6ff",
        destructive: "#dc2626",
        ink: "#101217",
        brass: "#f1ea16",
        cedar: "#1a1d24",
        mist: "#f1f3f5",
        laria: {
          black: "#050608",
          ink: "#101217",
          graphite: "#1a1d24",
          white: "#ffffff",
          cloud: "#f1f3f5",
          fog: "#e9edf3",
          steel: "#c8cdd6",
          muted: "#9da3af",
          text: "#101217",
          "text-soft": "#4b5563",
          yellow: "#f1ea16",
          blue: "#6ba6ff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
