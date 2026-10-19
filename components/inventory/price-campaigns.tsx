"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BulkPriceSheet, type BulkTarget } from "@/components/inventory/bulk-actions";
import { UndoNotice, type InventoryNotice } from "@/components/inventory/undo-notice";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { inventoryAction } from "@/lib/inventory-client";
import { categoryOptions } from "@/lib/listings";
import { formatDateTime, numbers, type PriceCampaign } from "@/lib/store-inventory";

// Effortless Laria, inventory batch, stock-15: price campaigns ("−15% en Guitarras") and "Volver a precios anteriores".
// A campaign is the bulk price change with a name; reverting restores only the SKU whose price nobody changed since.

function ruleLabel(campaign: Pick<PriceCampaign, "mode" | "value" | "rounding">) {
  const sign = campaign.value > 0 ? "+" : "−";
  const amount = numbers.format(Math.abs(campaign.value));
  const rule = campaign.mode === "percent" ? `${sign}${amount}%` : campaign.mode === "add" ? `${sign}S/ ${amount}` : `Precio S/ ${amount}`;
  return campaign.rounding === "nine" ? `${rule}, terminados en 9` : rule;
}

export function NewCampaign() {
  const router = useRouter();
  const [target, setTarget] = useState<BulkTarget | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<InventoryNotice | null>(null);

  async function choose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const category = String(new FormData(event.currentTarget).get("category") ?? "");
    setError("");
    setBusy(true);
    const filters: Record<string, string> = { stock: "all", sort: "name" };
    if (category) filters.category = category;
    const result = await inventoryAction<{ ids: string[]; total: number; limit: number }>({ action: "view_ids", filters });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    if (!result.data.ids.length) return setError(category ? "No tienes SKU activos en esa categoría." : "No tienes SKU activos.");
    if (result.data.total > result.data.ids.length) return setError(`Son ${numbers.format(result.data.total)} SKU; un cambio de precio llega hasta ${numbers.format(result.data.limit)}. Elige una categoría.`);
    setTarget({ ids: result.data.ids, items: [] });
  }

  return (
    <div className="grid gap-3">
      {notice ? <UndoNotice notice={notice} onChange={setNotice} /> : null}
      <form className="flex flex-wrap items-end gap-3" onSubmit={choose} noValidate>
        <Field id="campana-categoria" label="SKU a cambiar" error={error} className="min-w-0 flex-1 basis-64">
          <Select name="category" defaultValue="">
            <option value="">Todo el inventario activo</option>
            {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </Field>
        <Button type="submit" loading={busy} loadingLabel="Buscando SKU…" aria-haspopup="dialog">Elegir el cambio</Button>
      </form>
      <p className="t-meta">Para otra selección (una marca, un proveedor), filtra la tabla de Inventario y usa “Seleccionar todos” y “Cambiar precios”.</p>
      {target ? (
        <BulkPriceSheet
          target={target}
          onClose={() => setTarget(null)}
          onDone={(message, undo) => { setTarget(null); setNotice({ kind: "success", message, undo }); router.refresh(); }}
        />
      ) : null}
    </div>
  );
}

export function CampaignList({ campaigns, canWrite }: { campaigns: PriceCampaign[]; canWrite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<InventoryNotice | null>(null);

  async function revert(campaign: PriceCampaign) {
    setBusy(campaign.id);
    setNotice(null);
    const result = await inventoryAction<{ restored: unknown[]; kept: { merchant_sku: string }[] }>({ action: "campaign_revert", campaign_id: campaign.id });
    setBusy(null);
    if (!result.ok) return setNotice({ kind: "error", message: result.message });
    const kept = result.data.kept ?? [];
    setNotice({
      kind: "success",
      message: `Volvieron los precios anteriores en ${numbers.format(result.data.restored?.length ?? 0)} SKU.${kept.length ? ` ${numbers.format(kept.length)} conservan el precio que les pusiste después: ${kept.slice(0, 5).map((item) => item.merchant_sku).join(", ")}${kept.length > 5 ? "…" : ""}.` : ""}`,
    });
    router.refresh();
  }

  if (!campaigns.length) return <p className="t-body text-ink-2">Aún no hay cambios de precio. Los que hagas aparecerán aquí para que puedas volver atrás.</p>;

  return (
    <div className="grid gap-3">
      {notice ? <UndoNotice notice={notice} onChange={setNotice} /> : null}
      <ul className="divide-y divide-subtle rounded-panel border border-subtle bg-white">
        {campaigns.map((campaign) => (
          <li key={campaign.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4">
            <div className="min-w-0">
              <p className="t-ui font-semibold text-ink">{campaign.name}</p>
              <p className="t-meta">{ruleLabel(campaign)} · {numbers.format(campaign.item_count)} SKU · {formatDateTime(campaign.created_at)}</p>
              {campaign.reverted_at ? (
                <p className="t-meta">Precios anteriores restaurados el {formatDateTime(campaign.reverted_at)}{campaign.revert_result?.kept?.length ? ` (${numbers.format(campaign.revert_result.kept.length)} SKU conservaron su precio nuevo)` : ""}.</p>
              ) : null}
            </div>
            {canWrite && !campaign.reverted_at ? (
              <Button size="sm" variant="secondary" loading={busy === campaign.id} loadingLabel="Restaurando…" onClick={() => revert(campaign)}>Volver a precios anteriores</Button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="t-meta">Al volver atrás, los SKU cuyo precio cambiaste después de la campaña conservan ese precio.</p>
    </div>
  );
}
