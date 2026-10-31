import { UUID } from "@/lib/store-inventory";
import type { Database, InventoryActionFunction } from "@/lib/supabase/database";
import type { Json } from "@/lib/supabase/database.types";

// Maps an inventory action posted by the Inventario screens to its database function and arguments
// (app/api/store/inventory/route.ts). It only shapes arguments; every rule is enforced by the function itself.

// The request's JSON body.
export type InventoryActionBody = { [key: string]: Json | undefined };

type Functions = Database["public"]["Functions"];
// One of the Inventario functions with its arguments, any of which can be null (lib/supabase/database.ts).
export type InventoryCall = {
  [Name in InventoryActionFunction]: [Functions[Name]["Args"]] extends [never]
    ? { fn: Name; args?: undefined }
    : { fn: Name; args: Functions[Name]["Args"] };
}[InventoryActionFunction];

const KEY = /^[A-Za-z0-9:_-]{8,160}$/;
// The database's bulk limit (laria_private.inventory_bulk_limit, stock-14).
export const INVENTORY_BULK_LIMIT = 2000;
const FILTER_KEYS = new Set(["q", "stock", "publication", "category", "sort", "price", "catalog"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function uuid(value: unknown) {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function uuids(value: unknown) {
  return Array.isArray(value) && value.length <= INVENTORY_BULK_LIMIT && value.every((entry) => typeof entry === "string" && UUID.test(entry))
    ? (value as string[])
    : null;
}

function key(value: unknown) {
  return typeof value === "string" && KEY.test(value) ? value : null;
}

function object(value: Json | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

// Inventario filters as the screens send them: known keys, short strings. The database validates the values.
function filters(value: Json | undefined) {
  const entries = object(value);
  if (!entries) return null;
  const clean: Record<string, string> = {};
  for (const [name, entry] of Object.entries(entries)) {
    if (!FILTER_KEYS.has(name) || typeof entry !== "string") return null;
    if (entry) clean[name] = entry.slice(0, 120);
  }
  return clean;
}

const BULK_ACTIONS = new Set(["category", "archive", "unarchive", "restore"]);

// Maps an action to its function and arguments, or null when the request is malformed.
export function inventoryCall(body: InventoryActionBody): InventoryCall | null {
  switch (body.action) {
    case "create": {
      const fields = object(body.fields);
      return fields && key(body.key)
        ? { fn: "create_inventory_item", args: { p_fields: fields, p_opening_quantity: integer(body.opening_quantity), p_idempotency_key: key(body.key) } }
        : null;
    }
    case "movement":
      return uuid(body.item_id) && key(body.key) && typeof body.type === "string"
        ? {
            fn: "record_stock_movement",
            args: {
              p_item_id: uuid(body.item_id),
              p_type: text(body.type, 40),
              p_quantity: integer(body.quantity),
              p_channel: text(body.channel, 40),
              p_reference: text(body.reference, 200),
              p_reason: text(body.reason, 400),
              p_expected_version: integer(body.expected_version),
              p_idempotency_key: key(body.key),
            },
          }
        : null;
    case "bulk_stock":
      return Array.isArray(body.operations) && body.operations.length <= INVENTORY_BULK_LIMIT && key(body.key)
        ? { fn: "apply_bulk_stock_operations", args: { p_operations: body.operations, p_batch_key: key(body.key) } }
        : null;
    case "price_preview":
      return uuids(body.item_ids) && typeof body.mode === "string"
        ? { fn: "preview_inventory_price_bulk", args: { p_item_ids: uuids(body.item_ids), p_mode: text(body.mode, 20), p_value: integer(body.value) } }
        : null;
    case "price_bulk":
      return uuids(body.item_ids) && typeof body.mode === "string" && key(body.key)
        ? { fn: "set_inventory_price_bulk", args: { p_item_ids: uuids(body.item_ids), p_mode: text(body.mode, 20), p_value: integer(body.value), p_batch_key: key(body.key) } }
        : null;
    case "threshold_bulk":
      return uuids(body.item_ids) && key(body.key) && (body.threshold === null || integer(body.threshold) !== null)
        ? { fn: "set_inventory_threshold_bulk", args: { p_item_ids: uuids(body.item_ids), p_threshold: integer(body.threshold), p_batch_key: key(body.key) } }
        : null;
    case "hide_bulk":
      return uuids(body.item_ids) && key(body.key)
        ? { fn: "hide_inventory_listings_bulk", args: { p_item_ids: uuids(body.item_ids), p_batch_key: key(body.key) } }
        : null;
    case "update": {
      const fields = object(body.fields);
      return uuid(body.item_id) && fields
        ? { fn: "update_inventory_item", args: { p_item_id: uuid(body.item_id), p_fields: fields, p_expected_version: integer(body.expected_version) } }
        : null;
    }
    case "change_sku":
      return uuid(body.item_id) && typeof body.sku === "string"
        ? { fn: "change_inventory_sku", args: { p_item_id: uuid(body.item_id), p_new_sku: text(body.sku, 200), p_reason: text(body.reason, 400), p_expected_version: integer(body.expected_version) } }
        : null;
    case "link":
      return uuid(body.item_id) && uuid(body.listing_id)
        ? { fn: "link_inventory_listing", args: { p_item_id: uuid(body.item_id), p_listing_id: uuid(body.listing_id), p_expected_version: integer(body.expected_version), p_unit_price_pen: integer(body.unit_price_pen) } }
        : null;
    case "unlink":
      return uuid(body.item_id)
        ? { fn: "unlink_inventory_listing", args: { p_item_id: uuid(body.item_id), p_reason: text(body.reason, 400), p_expected_version: integer(body.expected_version) } }
        : null;
    case "archive":
    case "unarchive":
      return uuid(body.item_id)
        ? { fn: `${body.action}_inventory_item`, args: { p_item_id: uuid(body.item_id), p_reason: text(body.reason, 400) } }
        : null;
    // Effortless Laria, inventory batch (docs/ux-effortless/inventory.md).
    case "undo_movements":
      return uuids(body.movement_ids) && key(body.key)
        ? { fn: "undo_stock_movements", args: { p_movement_ids: uuids(body.movement_ids), p_idempotency_key: key(body.key) } }
        : null;
    case "undo_batch":
      return key(body.batch_key) && key(body.key)
        ? { fn: "undo_inventory_batch", args: { p_batch_key: key(body.batch_key), p_undo_key: key(body.key) } }
        : null;
    case "bulk_action":
      return uuids(body.item_ids) && key(body.key) && typeof body.bulk === "string" && BULK_ACTIONS.has(body.bulk)
        ? { fn: "apply_inventory_bulk_action", args: { p_item_ids: uuids(body.item_ids), p_action: body.bulk, p_value: text(body.value, 80), p_reason: text(body.reason, 400), p_batch_key: key(body.key) } }
        : null;
    case "category":
      return uuid(body.item_id)
        ? { fn: "set_inventory_item_category", args: { p_item_id: uuid(body.item_id), p_category: text(body.category, 80), p_expected_version: integer(body.expected_version) } }
        : null;
    case "campaign_preview":
      return uuids(body.item_ids) && typeof body.mode === "string"
        ? { fn: "preview_inventory_price_campaign", args: { p_item_ids: uuids(body.item_ids), p_mode: text(body.mode, 20), p_value: integer(body.value), p_rounding: text(body.rounding, 10) } }
        : null;
    case "campaign_apply":
      return uuids(body.item_ids) && typeof body.mode === "string" && key(body.key)
        ? { fn: "apply_inventory_price_campaign", args: { p_item_ids: uuids(body.item_ids), p_mode: text(body.mode, 20), p_value: integer(body.value), p_rounding: text(body.rounding, 10), p_name: text(body.name, 80), p_batch_key: key(body.key) } }
        : null;
    case "campaign_revert":
      return uuid(body.campaign_id) ? { fn: "revert_inventory_price_campaign", args: { p_campaign_id: uuid(body.campaign_id) } } : null;
    case "preferences": {
      const fields = object(body.fields);
      return fields ? { fn: "set_inventory_preferences", args: { p_fields: fields, p_apply_to_unset: body.apply_to_unset === true } } : null;
    }
    case "view_ids":
      return filters(body.filters) ? { fn: "get_inventory_item_ids", args: { p_filters: filters(body.filters) } } : null;
    case "view_save":
      return filters(body.filters) && typeof body.name === "string"
        ? { fn: "save_inventory_view", args: { p_name: text(body.name, 80), p_filters: filters(body.filters) } }
        : null;
    case "view_delete":
      return uuid(body.view_id) ? { fn: "delete_inventory_view", args: { p_view_id: uuid(body.view_id) } } : null;
    case "counter_index":
      return { fn: "get_counter_index" };
    case "request_mark":
      return uuid(body.event_id) && (body.status === null || body.status === "answered" || body.status === "not_sold")
        ? { fn: "mark_store_purchase_request", args: { p_event_id: uuid(body.event_id), p_status: body.status } }
        : null;
    case "request_sale":
      return uuid(body.event_id) && key(body.key)
        ? { fn: "record_purchase_request_sale", args: { p_event_id: uuid(body.event_id), p_quantity: integer(body.quantity), p_expected_version: integer(body.expected_version), p_idempotency_key: key(body.key) } }
        : null;
    // store-floor, reach-08 "Por llegar": a date (YYYY-MM-DD) or null for up to 200 SKU.
    case "arrival":
      return uuids(body.item_ids) && (body.expected_on === null || (typeof body.expected_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.expected_on)))
        ? { fn: "set_inventory_arrival", args: { p_item_ids: uuids(body.item_ids), p_expected_on: body.expected_on } }
        : null;
    // store-locations, run-02 "Sedes" (docs/feature-ideas/store-locations.md).
    case "location_save": {
      const fields = object(body.fields);
      return fields && (body.location_id === null || body.location_id === undefined || uuid(body.location_id))
        ? { fn: "save_store_location", args: { p_location_id: uuid(body.location_id), p_fields: fields } }
        : null;
    }
    case "location_primary":
      return uuid(body.location_id) ? { fn: "set_primary_store_location", args: { p_location_id: uuid(body.location_id) } } : null;
    case "location_archive":
      return uuid(body.location_id) && key(body.key) && (body.move_to === null || body.move_to === undefined || uuid(body.move_to))
        ? { fn: "archive_store_location", args: { p_location_id: uuid(body.location_id), p_move_to: uuid(body.move_to), p_idempotency_key: key(body.key) } }
        : null;
    case "location_transfer":
      return uuid(body.item_id) && uuid(body.from) && uuid(body.to) && key(body.key)
        ? { fn: "transfer_location_stock", args: { p_item_id: uuid(body.item_id), p_from: uuid(body.from), p_to: uuid(body.to), p_quantity: integer(body.quantity), p_reason: text(body.reason, 400), p_idempotency_key: key(body.key) } }
        : null;
    case "location_movement":
      return uuid(body.location_id) && uuid(body.item_id) && key(body.key) && typeof body.type === "string"
        ? {
            fn: "record_location_stock_movement",
            args: {
              p_location_id: uuid(body.location_id),
              p_item_id: uuid(body.item_id),
              p_type: text(body.type, 40),
              p_quantity: integer(body.quantity),
              p_channel: text(body.channel, 40),
              p_reference: text(body.reference, 200),
              p_reason: text(body.reason, 400),
              p_expected_version: integer(body.expected_version),
              p_idempotency_key: key(body.key),
            },
          }
        : null;
    case "location_bulk_stock":
      return uuid(body.location_id) && Array.isArray(body.operations) && body.operations.length <= 200 && key(body.key)
        ? { fn: "apply_location_bulk_stock_operations", args: { p_location_id: uuid(body.location_id), p_operations: body.operations, p_batch_key: key(body.key) } }
        : null;
    case "location_counts":
      return uuid(body.location_id) && Array.isArray(body.counts) && body.counts.length <= 200 && key(body.key)
        ? { fn: "set_location_stock_counts", args: { p_location_id: uuid(body.location_id), p_counts: body.counts, p_batch_key: key(body.key) } }
        : null;
    // /store-locations
    default:
      return null;
  }
}

