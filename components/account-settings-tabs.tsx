import Link from "next/link";
import { accountSettingsTabs } from "@/lib/account-navigation";

// Switches between the two pages grouped under "Perfil y seguridad".
export function AccountSettingsTabs({ current }: { current: (typeof accountSettingsTabs)[number]["href"] }) {
  return (
    <nav aria-label="Perfil y seguridad" className="mb-4 flex max-w-2xl gap-1 rounded-lg border border-laria-fog bg-white p-1 shadow-sm">
      {accountSettingsTabs.map((tab) => {
        const active = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={active
              ? "flex min-h-11 flex-1 items-center justify-center rounded-md bg-laria-blue/10 px-3 text-sm font-black text-laria-blue"
              : "flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-bold text-laria-text-soft hover:bg-laria-cloud hover:text-laria-blue"}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
