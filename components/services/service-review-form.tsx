"use client";

import { Star } from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { hasContactDetails } from "@/lib/listing-questions";
import { SERVICE_REVIEW_COMMENT_MAX, foldParagraphs, serviceErrorMessage } from "@/lib/services";
import { servicesDb } from "@/lib/services-db";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

const STAR_WORDS = ["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"];

// bet-02: the confirmed client's review. Five radio buttons (no default: the client picks), each a 44 px star with its
// number and word as its name, and an optional comment. Published at once; it cannot be edited afterwards.
export function ServiceReviewForm({ bookingId, providerName, onDone }: { bookingId: string; providerName: string; onDone: () => void }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const id = useId();
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !supabase) return;
    const text = foldParagraphs(comment);
    if (!rating) return setError("Elige de 1 a 5 estrellas.");
    if (text && hasContactDetails(text)) return setError("No escribas números de teléfono, enlaces ni correos en la reseña.");
    setBusy(true);
    setError(null);
    const { error: rpcError } = await servicesDb(supabase).rpc("submit_service_review", { p_booking_id: bookingId, p_rating: rating, p_comment: text || null });
    setBusy(false);
    if (rpcError) return setError(serviceErrorMessage(rpcError.message, "No pudimos publicar tu reseña. Intenta nuevamente."));
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <fieldset className="grid gap-2">
        <legend className="t-ui font-semibold text-ink">¿Cómo calificas a {providerName}?</legend>
        <div className="flex flex-wrap gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className={cn("inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-control border px-2 t-ui font-semibold transition-colors duration-120 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink", rating !== null && value <= rating ? "border-ink bg-accent" : "border-line-strong bg-surface hover:bg-canvas")}>
              <input type="radio" name={`${id}-rating`} value={value} checked={rating === value} onChange={() => setRating(value)} className="sr-only" />
              <Star aria-hidden="true" className={cn("h-5 w-5", rating !== null && value <= rating ? "fill-ink" : "")} />
              <span>{value}</span>
              <span className="sr-only">{value === 1 ? "estrella" : "estrellas"}: {STAR_WORDS[value]}</span>
            </label>
          ))}
        </div>
        <p className="t-meta" aria-live="polite">{rating ? `${rating} de 5: ${STAR_WORDS[rating]}` : "Elige de 1 a 5."}</p>
      </fieldset>
      <Field id={`${id}-comment`} label="Comentario" optional hint="Cuenta cómo fue: puntualidad, trato, resultado. Se publica con tu nombre y la inicial de tu apellido.">
        <Textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={SERVICE_REVIEW_COMMENT_MAX} rows={4} />
      </Field>
      {error ? <p id={`${id}-error`} role="alert" className="t-ui font-semibold text-danger">{error}</p> : null}
      <div>
        <Button type="submit" variant="secondary" loading={busy} loadingLabel="Publicando…">Publicar reseña</Button>
      </div>
    </form>
  );
}
