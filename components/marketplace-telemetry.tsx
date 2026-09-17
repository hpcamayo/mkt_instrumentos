"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { sendBrowsingEvent, sendMarketplaceEvent } from "@/lib/marketplace-events-client";
import type { EventSource } from "@/lib/marketplace-event-payload";

export function useListingImpression<Element extends HTMLElement = HTMLElement>(listingId: string, source: EventSource) {
  const ref = useRef<Element>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) return;
    let visible = false;
    const record = () => {
      if (visible && document.visibilityState === "visible") {
        void sendBrowsingEvent({ type: "listing_impression", listingId, source }, listingId);
      }
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && entry.intersectionRatio >= 0.5; record(); }, { threshold: 0.5 });
    observer.observe(element);
    document.addEventListener("visibilitychange", record);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", record); };
  }, [listingId, source]);
  return ref;
}

export function ListingImpressionBoundary({ listingId, children }: { listingId: string; children: ReactNode }) {
  const ref = useListingImpression<HTMLDivElement>(listingId, "home");
  return <div ref={ref}>{children}</div>;
}

export function StoreVisitTelemetry({ storeId }: { storeId: string }) {
  useEffect(() => {
    const record = () => {
      if (document.visibilityState === "visible") void sendBrowsingEvent({ type: "store_view", storeId, source: "store" }, storeId);
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [storeId]);
  return null;
}

let lastSearch: string | null = null;
export function SearchTelemetry({ searchReceipt, signature, filtered }: { searchReceipt: string; signature: string; filtered: boolean }) {
  useEffect(() => {
    const record = () => {
      if (document.visibilityState !== "visible" || lastSearch === signature) return;
      lastSearch = signature;
      void sendMarketplaceEvent({ type: "search", searchReceipt, source: "catalog" });
      if (filtered) void sendMarketplaceEvent({ type: "filter_applied", searchReceipt, source: "catalog" });
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [searchReceipt, signature, filtered]);
  return null;
}
