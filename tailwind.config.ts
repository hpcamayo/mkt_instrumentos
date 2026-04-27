import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
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
