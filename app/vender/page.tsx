import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata: Metadata = {
  title: "Vender instrumento",
  description:
    "Publica tu instrumento usado para revisión y conecta con compradores por WhatsApp.",
  openGraph: {
    title: "Vende tu instrumento usado",
    description:
      "Envía tu publicación para revisión y aparece en Instrumentos Perú cuando sea aprobada.",
    url: "/vender",
  },
};

export default async function SellPage() {
  const user = await requireUser("/vender");
  const supabase = await getSupabaseServerClient();
  const { data: profile } = supabase
    ? await supabase
        .from("profiles")
        .select("full_name,phone,city,region,account_type")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  if (profile?.account_type === "store_owner") {
    redirect("/mi-cuenta/tienda/publicar");
  }
  redirect("/mi-cuenta/publicar");
}
