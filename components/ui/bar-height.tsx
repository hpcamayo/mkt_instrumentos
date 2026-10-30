"use client";

import { useEffect, useRef } from "react";

// Measure visible peers so one bar cannot erase another's clearance.
// Scroll padding does not affect automatic Tab scrolling: reveal a covered focus stop as well.
export function BarHeight({ variable }: { variable: "--contact-bar-height" | "--bottom-bar-height" }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const bar = marker.current?.closest<HTMLElement>(".contact-bar, [data-bottom-bar]");
    if (!bar) return;
    const root = document.documentElement;
    const selector = variable === "--contact-bar-height" ? ".contact-bar" : "[data-bottom-bar]";
    function measure(exclude?: HTMLElement) {
      const peers = [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((element) => element !== exclude)
        .map((element) => ({ element, box: element.getBoundingClientRect(), style: getComputedStyle(element) }))
        .filter(({ box, style }) => ["fixed", "sticky"].includes(style.position)
          && style.visibility !== "hidden" && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight);
      root.style.setProperty(variable, Math.ceil(Math.max(0, ...peers.map(({ element }) => element.offsetHeight))) + "px");
      if (variable === "--bottom-bar-height") {
        const clearance = Math.ceil(Math.max(0, ...peers.map(({ box }) => window.innerHeight - box.top + 16)));
        root.style.setProperty("--bottom-bar-clearance", clearance + "px");
      }
    }
    const resize = () => measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(bar);
    window.addEventListener("resize", resize);
    measure();

    let frame = 0;
    const revealFocus = (event: FocusEvent) => {
      const focused = event.target;
      if (!(focused instanceof HTMLElement) || bar.contains(focused)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (document.activeElement !== focused) return;
        const box = focused.getBoundingClientRect();
        const area = bar.getBoundingClientRect();
        const left = Math.max(box.left, area.left), right = Math.min(box.right, area.right);
        const top = Math.max(box.top, area.top), bottom = Math.min(box.bottom, area.bottom);
        if (left >= right || top >= bottom) return;
        // A modal above the bar is not covered by it.
        const covering = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        if (covering && bar.contains(covering)) {
          window.scrollBy({ top: box.bottom - area.top + 16, behavior: "instant" });
        }
      });
    };
    document.addEventListener("focusin", revealFocus);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("focusin", revealFocus);
      cancelAnimationFrame(frame);
      measure(bar);
    };
  }, [variable]);
  return <span ref={marker} hidden />;
}
