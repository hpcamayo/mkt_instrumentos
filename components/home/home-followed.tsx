"use client";

import { useEffect, useState } from "react";
import { FollowedArrivals } from "@/components/following/followed-arrivals";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { parseFollowedArrivals, type FollowedArrival } from "@/lib/follows";

// save-12 (UXD-integration-10): on the home, above "Para ti", what the stores and brands a signed-in person follows
// published in the last two weeks, each card saying why. Nothing for visitors or for people who follow nothing, and
// the home itself stays the same page for everyone.
export function HomeFollowedArrivals() {
  const { authenticated, settled } = useMarketplaceAccount();
  const [arrivals, setArrivals] = useState<FollowedArrival[]>([]);
  useEffect(() => {
    if (!settled || !authenticated) {
      setArrivals([]);
      return;
    }
    const controller = new AbortController();
    fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "arrivals" }), signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setArrivals(parseFollowedArrivals(data?.arrivals)))
      .catch(() => {});
    return () => controller.abort();
  }, [authenticated, settled]);
  return <FollowedArrivals arrivals={arrivals} />;
}
