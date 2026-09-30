import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

// Laria design tokens: see docs/design-system.md. Colors are roles, not raw values: the core palette is
// fixed, and each role says where a color may be used. The derived tones (action-hover, accent-tint,
// line-strong, ink-3, danger, danger-tint, warning-tint) are functional, not brand colors.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./components_v0/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Header, footer and Admin chrome.
        frame: { DEFAULT: "#050608", 2: "#1A1D24" },
        // The one primary action per view, and the logo. Never text on light surfaces.
        action: { DEFAULT: "#F1EA16", hover: "#E3DC22", ink: "#050608" },
        // Fills, marks, underlines and selection. As text only on frame.
        accent: { DEFAULT: "#6BA6FF", tint: "#E6F0FF" },
        // All text on light surfaces. ink-3 only for placeholders on white.
        ink: { DEFAULT: "#101217", 2: "#4B5563", 3: "#6B7280" },
        // Text on frame, or disabled.
        "muted-dark": "#9DA3AF",
        surface: "#FFFFFF",
        canvas: "#F1F3F5",
        subtle: "#E9EDF3",
        // line-deco is never the only boundary of a control; line-strong is the control border.
        line: { deco: "#C8CDD6", strong: "#7D8694" },
        danger: { DEFAULT: "#B42318", tint: "#FDECEA" },
        warning: { tint: "#FBF8CC" },

        // Legacy palette, removed once every file is on the roles above (UX-1 migration).
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
      borderColor: {
        DEFAULT: "#E9EDF3",
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "Arial", "Helvetica", "sans-serif"],
      },
      fontSize: {
        micro: ["12px", "16px"],
        meta: ["13px", "18px"],
        ui: ["14px", "20px"],
        body: ["16px", "24px"],
      },
      fontWeight: {
        strong: "750",
      },
      borderRadius: {
        tag: "4px",
        control: "6px",
        panel: "8px",
      },
      boxShadow: {
        "level-1": "0 4px 12px rgb(5 6 8 / 0.12), 0 1px 2px rgb(5 6 8 / 0.08)",
        "level-2": "0 16px 40px rgb(5 6 8 / 0.22), 0 2px 6px rgb(5 6 8 / 0.10)",
      },
      maxWidth: {
        page: "1440px",
      },
      transitionDuration: {
        120: "120ms",
      },
    },
  },
  plugins: [
    // Titles, model names and prices use Archivo's semi-condensed width.
    plugin(({ addUtilities }) => {
      addUtilities({
        ".stretch-semicond": { "font-stretch": "87.5%" },
        ".stretch-normal": { "font-stretch": "100%" },
      });
    }),
  ],
};

export default config;
