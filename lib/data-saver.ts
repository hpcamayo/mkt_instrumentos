import { useSyncExternalStore } from "react";

// fast-03 (docs/ux-effortless/speed.md): about half of Peru's mobile lines are prepaid, so when the phone asks to save
// data (Save-Data) or the connection is slow, Laria sends smaller images and loads nothing ahead of time. The Network
// Information API exists in Chromium browsers (most phones in Peru run Android); elsewhere this stays false.
type NetworkInformationLike = EventTarget & { saveData?: boolean; effectiveType?: string };

// effectiveType is measured by the browser from recent round trips; "3g" is about 0.7 Mbit/s or less.
const SLOW_CONNECTIONS = new Set(["slow-2g", "2g", "3g"]);

function connection(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

export function prefersReducedData(): boolean {
  const info = connection();
  if (!info) return false;
  return info.saveData === true || SLOW_CONNECTIONS.has(info.effectiveType ?? "");
}

function subscribe(onChange: () => void) {
  const info = connection();
  info?.addEventListener?.("change", onChange);
  return () => info?.removeEventListener?.("change", onChange);
}

// False on the server and while hydrating, so the markup matches; afterwards it follows the connection. Use it to
// skip loading pages or images ahead of time (prefetch, preload) and to ask for smaller images.
export function useReducedData(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedData, () => false);
}

// Data-saving images ask for about 1.5 device pixels per CSS pixel: still sharp on a phone, and a third to a half of
// the bytes on the 2x and 3x screens most phones have.
const DATA_SAVING_DENSITY = 1.5;

export function dataSavingScale(devicePixelRatio: number): number {
  return devicePixelRatio > DATA_SAVING_DENSITY ? DATA_SAVING_DENSITY / devicePixelRatio : 1;
}

// "(max-width: 767px) 50vw, 270px" with each width multiplied by `scale` through calc(); an entry it cannot read
// (a calc of its own) stays as it is. The browser then picks a smaller file from the same srcset.
export function scaleImageSizes(sizes: string, scale: number): string {
  if (scale >= 1) return sizes;
  const factor = Math.round(scale * 1000) / 1000;
  return splitTopLevel(sizes)
    .map((entry) => {
      const match = /^(.*?)(\d+(?:\.\d+)?(?:px|vw|vh|em|rem))$/.exec(entry);
      return match ? `${match[1]}calc(${match[2]} * ${factor})` : entry;
    })
    .join(", ");
}

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
