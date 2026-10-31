"use client";

import { useEffect, useState } from "react";
import { sellingDb, type ListingSellingTools } from "@/lib/selling-tools";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// The selling tools of the listings on screen (Mis publicaciones, Inventario), read after the table renders so the
// page itself stays as fast as before. A failed read shows no tags; nothing else depends on it.
export function useListingSellingTools(listingIds: string[]) {
  const [tools, setTools] = useState<Record<string, ListingSellingTools>>({});
  const key = listingIds.join(",");
  useEffect(() => {
    const ids = key ? key.split(",") : [];
    const client = getSupabaseBrowserClient();
    if (!ids.length || !client) return;
    let active = true;
    void sellingDb(client).rpc("get_listing_selling_tools", { p_listing_ids: ids }).then(({ data }) => {
      if (active && data) setTools(data as Record<string, ListingSellingTools>);
    }, () => undefined);
    return () => { active = false; };
  }, [key]);
  return tools;
}
