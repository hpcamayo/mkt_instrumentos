"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavigationSkeleton } from "@/components/navigation-skeletons";
import {
  NAVIGATION_BAR_DELAY_MS,
  NAVIGATION_GIVE_UP_MS,
  SLOW_NAVIGATION_MS,
  formNavigationTarget,
  linkNavigationTarget,
  skeletonKindFor,
  type SkeletonKind,
} from "@/lib/navigation-feedback";

// fast-01 (docs/ux-effortless/speed.md): feedback for every tap that changes the page. Next keeps the current page on
// screen until the next one is ready, and there is no loading.tsx (with one, some catalog transitions never committed,
// owner decision Q1 A), so this listens to link clicks and GET form submissions on the document:
// - a thin blue bar at the top appears after 100 ms and finishes when the new address commits;
// - after a second, screen readers hear "Cargando la página…", and a listing, store or account page on its way shows
//   its skeleton over the old page, below the header if it is on screen. The old page is covered, never removed or
//   scrolled, so its history entry keeps its place for "Atrás".
// Clicks on a control inside a link (a heart on a card) are not page changes. A change that never commits (a failed
// request becomes a full page load) lets the bar go after 15 s.
type Bar = "idle" | "start" | "wait" | "done";
type Pending = { from: string; kind: SkeletonKind | null; timers: number[] };

export function NavigationFeedback() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = search ? `${pathname}?${search}` : pathname;
  const [bar, setBar] = useState<Bar>("idle");
  const [slow, setSlow] = useState(false);
  const [skeleton, setSkeleton] = useState<{ kind: SkeletonKind; top: number } | null>(null);
  const pending = useRef<Pending | null>(null);
  const resetTimer = useRef<number | null>(null);

  const finish = useCallback(() => {
    const current = pending.current;
    if (!current) return;
    current.timers.forEach((timer) => window.clearTimeout(timer));
    pending.current = null;
    document.getElementById("contenido")?.removeAttribute("aria-busy");
    setSlow(false);
    setSkeleton(null);
    setBar((state) => (state === "idle" ? "idle" : "done"));
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setBar((state) => (state === "done" ? "idle" : state)), 400);
  }, []);

  const start = useCallback((target: URL) => {
    if (pending.current) pending.current.timers.forEach((timer) => window.clearTimeout(timer));
    const from = window.location.pathname;
    const kind = skeletonKindFor(target.pathname, from);
    const timers = [
      window.setTimeout(() => setBar("start"), NAVIGATION_BAR_DELAY_MS),
      window.setTimeout(() => setBar("wait"), NAVIGATION_BAR_DELAY_MS + 200),
      window.setTimeout(() => {
        setSlow(true);
        const main = document.getElementById("contenido");
        main?.setAttribute("aria-busy", "true");
        if (kind) setSkeleton({ kind, top: Math.max(0, Math.round(main?.getBoundingClientRect().top ?? 0)) });
      }, SLOW_NAVIGATION_MS),
      window.setTimeout(() => finish(), NAVIGATION_GIVE_UP_MS),
    ];
    pending.current = { from: window.location.pathname + window.location.search, kind, timers };
  }, [finish]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest("a[href], button, input, select, textarea, label, summary, [role='button']");
      if (!(control instanceof HTMLAnchorElement)) return;
      const target = linkNavigationTarget({ href: control.href, target: control.target, download: control.hasAttribute("download") }, new URL(window.location.href));
      if (target) start(target);
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const query = new URLSearchParams();
      try {
        new FormData(form, event.submitter).forEach((value, key) => {
          if (typeof value === "string") query.append(key, value);
        });
      } catch {
        return;
      }
      const target = formNavigationTarget({ method: form.method, action: form.action, target: form.target }, query, new URL(window.location.href));
      if (target) start(target);
    };
    // A page restored from the back-forward cache starts clean.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) finish();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [start, finish]);

  // The new address commits together with the new page; clear the skeleton before that frame is painted.
  useLayoutEffect(() => {
    if (pending.current && pending.current.from !== here) finish();
  }, [here, finish]);

  useEffect(() => () => {
    pending.current?.timers.forEach((timer) => window.clearTimeout(timer));
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
  }, []);

  return (
    <>
      <div className="navigation-bar" data-state={bar} aria-hidden="true" />
      <p role="status" className="sr-only">{slow ? "Cargando la página…" : ""}</p>
      {skeleton ? (
        <div className="navigation-skeleton" style={{ top: skeleton.top }} aria-hidden="true">
          <NavigationSkeleton kind={skeleton.kind} />
        </div>
      ) : null}
    </>
  );
}
