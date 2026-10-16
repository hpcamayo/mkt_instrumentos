import { ChipLink } from "@/components/ui/chip";
import { categoryOptions } from "@/lib/listings";
import { INVENTORY_NO_CATEGORY, inventoryHref, type InventoryFilters } from "@/lib/store-inventory";

// Category chips above the inventory table (review fix B4): the same category filter as "Filtrar", one press away.
// A SKU's category is its publication's, else the one its import gave it; "Sin categoría" holds the rest. Each chip is
// a link, so the filtered view keeps working as a URL. Hidden when the store has a single group.
export function InventoryCategoryChips({ filters, counts }: { filters: InventoryFilters; counts: Record<string, number> | null }) {
  if (!counts) return null;
  const chips = [
    ...categoryOptions.filter((option) => (counts[option.value] ?? 0) > 0)
      .map((option) => ({ value: option.value as string, label: option.label as string, count: counts[option.value] })),
    ...((counts[INVENTORY_NO_CATEGORY] ?? 0) > 0 ? [{ value: INVENTORY_NO_CATEGORY, label: "Sin categoría", count: counts[INVENTORY_NO_CATEGORY] }] : []),
  ];
  if (chips.length < 2 && !filters.category) return null;
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return (
    <nav aria-label="Categorías del inventario" className="border-b border-subtle px-4 py-3 md:px-5">
      <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
        <li>
          <ChipLink href={inventoryHref({ ...filters, category: "" })} selected={!filters.category} current="page">
            Todas ({total})
          </ChipLink>
        </li>
        {chips.map((chip) => (
          <li key={chip.value}>
            <ChipLink href={inventoryHref({ ...filters, category: chip.value })} selected={filters.category === chip.value} current="page">
              {chip.label} ({chip.count})
            </ChipLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
