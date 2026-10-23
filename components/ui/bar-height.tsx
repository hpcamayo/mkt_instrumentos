"use client";

import { useEffect, useRef } from "react";

// fast-04: keeps a CSS variable on <html> at the height of the bar this sits in (the listing's .contact-bar, or any
// [data-bottom-bar]), so the page keeps focused elements clear of it however its contents wrap (app/globals.css).
export function BarHeight({ variable }: { variable: "--contact-bar-height" | "--bottom-bar-height" }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const bar = marker.current?.closest<HTMLElement>(".contact-bar, [data-bottom-bar]");
    if (!bar || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty(variable, `${Math.ceil(bar.offsetHeight)}px`));
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty(variable);
    };
  }, [variable]);
  return <span ref={marker} hidden />;
}
