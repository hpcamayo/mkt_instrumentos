import type { SupabaseClient } from "@supabase/supabase-js";
import { Volume2 } from "lucide-react";
import { getRequestReads } from "@/lib/supabase/public-read-client";

// POST 16: the seller's optional sound clip on the listing page. Loaded and played only when the buyer taps it
// (preload="none"; it never starts on its own). The row is readable exactly when the listing is.
export async function ListingSoundClip({ listingId }: { listingId: string }) {
  const { supabase } = getRequestReads();
  if (!supabase) return null;
  // listing_sound_clips is newer than the generated database types.
  const { data } = await (supabase as unknown as SupabaseClient).from("listing_sound_clips").select("clip_url,duration_seconds").eq("listing_id", listingId).maybeSingle();
  const clip = data as { clip_url: string; duration_seconds: number } | null;
  if (!clip?.clip_url) return null;
  return (
    <section aria-labelledby="sonido" className="order-8 min-w-0">
      <h2 id="sonido" className="flex items-center gap-2 t-section text-ink"><Volume2 className="h-5 w-5" aria-hidden />Cómo suena</h2>
      <p className="mt-1 t-meta">Grabado por quien vende, {Number(clip.duration_seconds).toLocaleString("es-PE", { maximumFractionDigits: 0 })} s. Se reproduce solo si lo tocas.</p>
      {/* A short instrument sample has no speech to caption. */}
      <audio controls preload="none" src={clip.clip_url} className="mt-3 w-full max-w-md" aria-label="Escuchar cómo suena el instrumento" />
    </section>
  );
}
