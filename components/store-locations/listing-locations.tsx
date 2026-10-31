"use client";

import { MapPin } from "lucide-react";
import { useId, useState } from "react";
import { toggleQuestion } from "@/components/listing/contact-state";
import { Field, Select } from "@/components/ui/field";
import { availabilityLine, locationPlace, pickupSentence, type PublicLocation } from "@/lib/store-locations";
import { cn } from "@/lib/utils";

// run-02 on the listing: "Disponible en Miraflores y Centro" (only the locations with units, never how many) and,
// when the buyer can collect at more than one, "¿Dónde lo recoges?". The choice is added to the WhatsApp message the
// same way the quick questions are (the listing's contact store), so the one contact button carries it. No choice is
// made for the buyer.
export function ListingLocations({ listingId, locations, className }: { listingId: string; locations: PublicLocation[]; className?: string }) {
  const id = useId();
  const [chosen, setChosen] = useState("");
  const pickup = locations.filter((location) => location.pickup_enabled);
  const line = availabilityLine(locations.map((location) => location.name));
  if (!line) return null;

  function choose(value: string) {
    const previous = pickup.find((location) => location.id === chosen);
    const next = pickup.find((location) => location.id === value);
    if (previous) toggleQuestion(listingId, pickupSentence(previous.name));
    if (next) toggleQuestion(listingId, pickupSentence(next.name));
    setChosen(value);
  }

  return (
    <div className={cn("grid gap-3 rounded-panel bg-canvas p-4", className)}>
      <p className="flex items-start gap-2 t-ui font-semibold text-ink">
        <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        {line}
      </p>
      <details className="group">
        <summary className="link w-fit cursor-pointer t-meta font-semibold">Ver sedes</summary>
        <ul className="mt-2 grid gap-2">
          {locations.map((location) => (
            <li key={location.id} className="t-meta">
              <span className="font-semibold text-ink">{location.name}</span>
              {locationPlace(location) ? ` · ${locationPlace(location)}` : ""}
              {location.public_address ? ` · ${location.public_address}` : ""}
              {location.opening_hours ? <span className="block">{location.opening_hours}</span> : null}
              {location.pickup_enabled ? null : <span className="block">No se recoge en esta sede.</span>}
            </li>
          ))}
        </ul>
      </details>
      {pickup.length >= 2 ? (
        <Field id={`${id}-recojo`} label="¿Dónde lo recoges?" optional hint="Lo agregamos a tu mensaje de WhatsApp. La tienda confirma la disponibilidad.">
          <Select value={chosen} onChange={(event) => choose(event.target.value)}>
            <option value="">Lo decido con la tienda</option>
            {pickup.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </Select>
        </Field>
      ) : null}
    </div>
  );
}
