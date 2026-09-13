import Image from "next/image";
import Link from "next/link";
import logoClear from "@/app/logo-clear.svg";
import { PageContainer } from "@/components/page-container";
import { SiteHeaderAccountNav } from "@/components/site-header-account-nav";
import { getHeaderNavigation } from "@/lib/account-navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const supabase = await getSupabaseServerClient();
  const { data: profile } = user && supabase
    ? await supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle()
    : { data: null };
  const storeOwner = profile?.account_type === "store_owner";
  const { data: store } = user && storeOwner && supabase
    ? await supabase.from("stores").select("id").eq("owner_user_id", user.id).maybeSingle()
    : { data: null };
  const navigation = getHeaderNavigation({ authenticated: Boolean(user), storeOwner, hasStore: Boolean(store) });
  return (
    <header className="border-b border-white/10 bg-laria-black text-white">
      <PageContainer className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <Link
          href="/"
          className="inline-flex w-fit items-center"
          aria-label="Laria inicio"
        >
          <Image
            src={logoClear}
            alt="Laria"
            width={112}
            height={78}
            priority
            className="h-10 w-auto object-contain"
          />
        </Link>
        <nav aria-label="Navegación principal">
          <ul className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white/72">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    item.primary
                      ? "laria-button-primary min-h-10 px-4 py-2 text-xs uppercase tracking-wide"
                      : "inline-flex min-h-10 items-center rounded-md px-3 py-2 transition hover:bg-white/10 hover:text-white"
                  }
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <SiteHeaderAccountNav authenticated={Boolean(user)} storeOwner={storeOwner} />
          </ul>
        </nav>
      </PageContainer>
    </header>
  );
}
