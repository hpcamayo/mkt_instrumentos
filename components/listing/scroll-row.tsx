"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";

// A sideways row of cards (list-07): swipe on phones, two 44 px buttons from 768 px so it never needs a gesture. It
// holds a fixed number of cards: no endless loading.
export function ScrollRow({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (direction: 1 | -1) => {
    const row = ref.current;
    if (!row) return;
    row.scrollBy({ left: direction * row.clientWidth * 0.9, behavior: "smooth" });
  };
  return (
    <div className="relative">
      <div ref={ref} role="list" aria-label={label} className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:gap-5 md:px-0">
        {children}
      </div>
      <div className="mt-3 hidden justify-end gap-2 md:flex">
        <IconButton label="Ver anteriores" icon={<ChevronLeft aria-hidden="true" />} variant="secondary" onClick={() => move(-1)} />
        <IconButton label="Ver siguientes" icon={<ChevronRight aria-hidden="true" />} variant="secondary" onClick={() => move(1)} />
      </div>
    </div>
  );
}
