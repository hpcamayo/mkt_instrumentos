"use client";

import { useEffect, useState } from "react";
import { sendBrowsingEvent } from "@/lib/marketplace-events-client";

const DAY_MS = 24 * 60 * 60 * 1000;

type ListingDetailMetadataProps = {
  listingId: string;
  publishedAt: string | null;
  createdAt: string;
  initialViewCount: number | null;
  trackView?: boolean;
};

export function ListingDetailMetadata({
  listingId,
  publishedAt,
  createdAt,
  initialViewCount,
  trackView = true,
}: ListingDetailMetadataProps) {
  const [viewCount, setViewCount] = useState(initialViewCount ?? 0);

  useEffect(() => {
    if (!trackView) return;

    let isActive = true;
    function registerView() {
      if (document.visibilityState !== "visible") return;
      void sendBrowsingEvent({ type: "listing_view", listingId, source: "detail" }, listingId).then((payload) => {
        if (isActive && typeof payload?.view_count === "number") setViewCount(payload.view_count);
      });
    }
    registerView();
    document.addEventListener("visibilitychange", registerView);

    return () => {
      isActive = false;
      document.removeEventListener("visibilitychange", registerView);
    };
  }, [listingId, trackView]);

  return (
    <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold text-laria-text-soft">
      <span className="inline-flex items-center rounded-full border border-laria-fog bg-laria-cloud px-3 py-1">
        {formatPublishedAgo(publishedAt ?? createdAt)}
      </span>
      <span className="inline-flex items-center rounded-full border border-laria-blue/25 bg-laria-blue/10 px-3 py-1 text-laria-blue">
        {formatViewCount(viewCount)}
      </span>
    </div>
  );
}

function formatPublishedAgo(value: string) {
  const publishedDate = new Date(value);

  if (Number.isNaN(publishedDate.getTime())) {
    return "Publicado recientemente";
  }

  const diffMs = Date.now() - publishedDate.getTime();
  const days = Math.max(0, Math.floor(diffMs / DAY_MS));

  return `Publicado hace ${days} ${days === 1 ? "día" : "días"}`;
}

function formatViewCount(value: number) {
  return `Visto ${value} ${value === 1 ? "vez" : "veces"}`;
}
