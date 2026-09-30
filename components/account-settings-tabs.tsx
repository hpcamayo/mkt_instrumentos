import Link from "next/link";
import { accountSettingsTabs } from "@/lib/account-navigation";

// Switches between the two pages grouped under "Perfil y seguridad".
export function AccountSettingsTabs({ current }: { current: (typeof accountSettingsTabs)[number]["href"] }) {
  return (
    <nav aria-label="Perfil y seguridad" className="mb-4 flex max-w-2xl gap-1 rounded-panel border border-subtle bg-white p-1">
      {accountSettingsTabs.map((tab) => {
        const active = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={active
              ? "flex min-h-11 flex-1 items-center justify-center rounded-control bg-accent-tint px-3 t-ui font-semibold text-ink shadow-[inset_0_-2px_0_var(--accent)]"
              : "flex min-h-11 flex-1 items-center justify-center rounded-control px-3 t-ui font-semibold text-ink-2 hover:bg-canvas hover:text-ink"}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
