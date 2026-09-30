import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge must know the custom tokens in tailwind.config.ts so that later classes win conflicts.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      borderRadius: ["tag", "control", "panel"],
    },
    classGroups: {
      shadow: [{ shadow: ["level-1", "level-2"] }],
      "font-weight": [{ font: ["strong"] }],
      "max-w": [{ "max-w": ["page"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
