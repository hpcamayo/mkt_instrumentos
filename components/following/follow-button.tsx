"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { buttonClasses } from "@/components/ui/button";

// save-12: "Seguir" on a store page or a brand. Signed out it leads to sign-in and back. The state is the button's
// own text ("Siguiendo"), not only its color; tapping again stops following, no confirmation needed.
export function FollowButton({ storeId, brand, initialFollowing = false, label, showLabel = false }: { storeId?: string; brand?: string; initialFollowing?: boolean; label: string; showLabel?: boolean }) {
  const { authenticated, ready, flash } = useMarketplaceAccount();
  const pathname = usePathname();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  // Public pages are the same for everyone, so the signed-in state is read after load.
  useEffect(() => {
    if (!ready || !authenticated || initialFollowing) return;
    let active = true;
    void fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list" }) })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { follows?: Array<{ store_id: string | null; brand: string | null }> } | null) => {
        if (!active || !result?.follows) return;
        setFollowing(result.follows.some((follow) => (storeId ? follow.store_id === storeId : follow.brand?.toLowerCase() === brand?.trim().toLowerCase())));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ready, authenticated, initialFollowing, storeId, brand]);

  if (ready && !authenticated) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
        <Plus aria-hidden className="h-4 w-4" />
        Seguir{showLabel ? ` ${label}` : ""}
      </Link>
    );
  }

  async function toggle() {
    if (busy) return;
    const next = !following;
    setBusy(true);
    setFollowing(next);
    try {
      const response = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(storeId ? { storeId } : { brand }), follow: next }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? "No pudimos guardar el cambio.");
      flash(next
        ? { message: `Sigues ${label}. Lo nuevo aparecerá en Para ti.`, href: "/mi-cuenta/correos", linkLabel: "Recibir resumen semanal" }
        : { message: `Dejaste de seguir ${label}.` });
    } catch (error) {
      setFollowing(!next);
      flash({ message: error instanceof Error ? error.message : "No pudimos guardar el cambio." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" aria-pressed={following} disabled={!ready} onClick={() => void toggle()} className={buttonClasses({ variant: following ? "secondary" : "primary", size: "sm" })}>
      {following ? <Check aria-hidden className="h-4 w-4" /> : <Plus aria-hidden className="h-4 w-4" />}
      {following ? "Siguiendo" : "Seguir"}
      {showLabel ? ` ${label}` : <span className="sr-only"> {label}</span>}
    </button>
  );
}
