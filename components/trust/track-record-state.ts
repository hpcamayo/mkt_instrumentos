"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { readTrackRecord, trackRecordLine, type TrackRecord } from "@/lib/deal-trust";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// «Comprador con historial» (safe-07): the signed-in buyer's own track record, read once per page load, and the
// listings where they took it out of the message. The chip (beside the quick questions) and the WhatsApp button live
// in different places of the page, so they share this store, like the quick questions (contact-state.ts).
type State = { status: "idle" | "loading" | "ready"; record: TrackRecord | null };

let state: State = { status: "idle", record: null };
const excluded = new Set<string>();
let excludedVersion = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const IDLE: State = { status: "idle", record: null };

export function loadTrackRecord() {
  if (state.status !== "idle") return;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  state = { status: "loading", record: null };
  void (supabase as unknown as SupabaseClient).rpc("get_my_track_record").then(
    ({ data, error }) => {
      state = { status: "ready", record: error ? null : readTrackRecord(data) };
      emit();
    },
    () => {
      state = { status: "ready", record: null };
      emit();
    },
  );
}

export function setTrackRecord(record: TrackRecord | null) {
  state = { status: "ready", record };
  emit();
}

export function toggleTrackRecordFor(listingId: string) {
  if (excluded.has(listingId)) excluded.delete(listingId);
  else excluded.add(listingId);
  excludedVersion += 1;
  emit();
}

// The line the WhatsApp button adds for this listing: on by default once the buyer turned the card on.
export function trackRecordLineFor(listingId: string) {
  if (excluded.has(listingId) || !state.record) return null;
  return trackRecordLine(state.record);
}

export function useTrackRecord() {
  return useSyncExternalStore(subscribe, () => state, () => IDLE);
}

export function useTrackRecordIncluded(listingId: string) {
  useSyncExternalStore(subscribe, () => excludedVersion, () => 0);
  return !excluded.has(listingId);
}
