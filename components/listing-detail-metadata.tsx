"use client";

import { useEffect, useState } from "react";

const VIEW_COUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

type ListingDetailMetadataProps = {
  listingId: string;
  publishedAt: string | null;
  createdAt: string;
  initialViewCount: number | null;
};

export function ListingDetailMetadata({
  listingId,
  publishedAt,
  createdAt,
  initialViewCount,
}: ListingDetailMetadataProps) {
  const [viewCount, setViewCount] = useState(initialViewCount ?? 0);

  useEffect(() => {
    const storageKey = `listing-viewed:${listingId}`;
    const viewedAt = Number(window.localStorage.getItem(storageKey));

    if (
      Number.isFinite(viewedAt) &&
      Date.now() - viewedAt < VIEW_COUNT_WINDOW_MS
    ) {
      return;
    }

    let isActive = true;

    async function registerView() {
      const response = await fetch(`/api/listings/${listingId}/view`, {
        method: "POST",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        view_count?: number;
      };

      window.localStorage.setItem(storageKey, String(Date.now()));

      if (isActive && typeof payload.view_count === "number") {
        setViewCount(payload.view_count);
      }
    }

    registerView().catch(() => {
      // Best-effort metadata; viewing the listing should never fail because of it.
    });

    return () => {
      isActive = false;
    };
  }, [listingId]);

  return (
    <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold text-laria-text-soft">
      <span className="inline-flex items-center rounded-full border border-laria-fog bg-laria-cloud px-3 py-1">
        {formatPublishedAgo(publishedAt ?? createdAt)}
      </span>
      <span className="inline-flex items-center rounded-full border border-blue-100 bg-[#eef5ff] px-3 py-1 text-laria-blue">
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
  const days = Math.max(0, Math.floor(diffMs / VIEW_COUNT_WINDOW_MS));

  return `Publicado hace ${days} ${days === 1 ? "día" : "días"}`;
}

function formatViewCount(value: number) {
  return `Visto ${value} ${value === 1 ? "vez" : "veces"}`;
}
