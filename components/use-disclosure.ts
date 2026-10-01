"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const OPEN_EVENT = "laria:disclosure-open";

// Shell menus are disclosure buttons (aria-expanded), not ARIA menus. Enter and Space open them natively; Esc
// closes and returns focus to the button; an outside press or a route change closes them; opening one closes
// any other, so only one menu is open at a time.
export function useDisclosure(id: string) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    if (!open) window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    setOpen(!open);
  }, [id, open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    function onOtherOpen(event: Event) {
      if ((event as CustomEvent<string>).detail !== id) setOpen(false);
    }
    window.addEventListener(OPEN_EVENT, onOtherOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOtherOpen);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close(true);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return { open, toggle, close, buttonRef, panelRef };
}
