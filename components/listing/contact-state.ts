"use client";

import { useSyncExternalStore } from "react";

// The quick questions a visitor picked for one listing (talk-02). The chips and the WhatsApp button live in different
// places of the page (the button is the phone's bottom bar), so they share this small store instead of props.
const selections = new Map<string, string[]>();
const listeners = new Set<() => void>();
const EMPTY: string[] = [];

export function getQuestions(listingId: string) {
  return selections.get(listingId) ?? EMPTY;
}

export function toggleQuestion(listingId: string, question: string) {
  const current = getQuestions(listingId);
  selections.set(listingId, current.includes(question) ? current.filter((item) => item !== question) : [...current, question]);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useQuestions(listingId: string) {
  return useSyncExternalStore(subscribe, () => getQuestions(listingId), () => EMPTY);
}

// The safety sheet (talk-04) is shown once per browser. Storage can be unavailable (private mode); then it shows once
// per page load, never blocks.
const SAFETY_KEY = "laria.safety-sheet-seen";
let seenThisLoad = false;

export function safetySheetSeen() {
  if (seenThisLoad) return true;
  try {
    return window.localStorage.getItem(SAFETY_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSafetySheetSeen() {
  seenThisLoad = true;
  try {
    window.localStorage.setItem(SAFETY_KEY, "1");
  } catch {
    /* Storage unavailable: once per page load. */
  }
}
