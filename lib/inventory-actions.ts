import { UUID } from "@/lib/store-inventory";

// Maps an inventory action posted by the Inventario screens to its database function and arguments
// (app/api/store/inventory/route.ts). It only shapes arguments; every rule is enforced by the function itself.

export type InventoryActionBody = Record<string, unknown>;
export type InventoryCall = { fn: string; args: Record<string, unknown> };

const KEY = /^[A-Za-z0-9:_-]{8,160}$/;

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
  return Array.isArray(value) && value.length <= 200 && value.every((entry) => typeof entry === "string" && UUID.test(entry))
    ? (value as string[])
    : null;
}

function key(value: unknown) {
  return typeof value === "string" && KEY.test(value) ? value : null;
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

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
      return Array.isArray(body.operations) && body.operations.length <= 200 && key(body.key)
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
        ? { fn: "set_inventory_threshold_bulk", args: { p_item_ids: uuids(body.item_ids), p_threshold: body.threshold, p_batch_key: key(body.key) } }
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
    default:
      return null;
  }
}

