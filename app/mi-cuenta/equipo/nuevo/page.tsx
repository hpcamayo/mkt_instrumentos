import { redirect } from "next/navigation";
import { GearItemForm } from "@/components/gear/gear-item-form";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";

export const metadata = { title: "Agregar equipo" };

export default async function NewGearPage() {
  const { profile } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta");
  return (
    <section className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow="Mi equipo"
        title="Agregar equipo"
        meta={<p className="max-w-[68ch]">Con la categoría y la marca basta. El número de serie y la garantía quedan a mano si algún día los necesitas.</p>}
      />
      <GearItemForm />
    </section>
  );
}
