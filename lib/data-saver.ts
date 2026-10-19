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
