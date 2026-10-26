"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ChecklistGroup } from "@/lib/discovery/buying-guides";

// disc-02: the try-out checklist a buyer ticks during the meetup. The ticks stay on this page only (they are not
// saved or sent anywhere); "Empezar de nuevo" clears them. Every item is a real checkbox with its label as the target.
export function TryoutChecklist({ groups }: { groups: readonly ChecklistGroup[] }) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  function toggle(key: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-canvas px-4 py-3">
        <p role="status" aria-live="polite" className="t-ui font-semibold text-ink">
          {checked.size} de {total} revisados
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={() => setChecked(new Set())} disabled={checked.size === 0}>
          Empezar de nuevo
        </Button>
      </div>
      {groups.map((group, groupIndex) => (
        <fieldset key={group.title} className="min-w-0">
          <legend className="t-section text-ink">{group.title}</legend>
          <ul className="mt-3 grid gap-2">
            {group.items.map((item) => {
              const key = `${groupIndex}:${item.id}`;
              const id = `revisar-${groupIndex}-${item.id}`;
              return (
                <li key={key}>
                  <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-subtle bg-surface px-3 py-2.5 hover:bg-canvas">
                    <input
                      id={id}
                      type="checkbox"
                      checked={checked.has(key)}
                      onChange={() => toggle(key)}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-ink"
                    />
                    <span className="min-w-0">
                      <span className="block t-ui font-semibold text-ink">{item.label}</span>
                      {item.hint ? <span className="mt-0.5 block t-meta">{item.hint}</span> : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
