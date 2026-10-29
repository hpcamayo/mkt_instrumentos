import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database as GeneratedDatabase } from "@/lib/supabase/database.types";

// lib/supabase/database.types.ts is generated from production's schema (`pnpm db:types`, docs/database.md) and is
// never edited by hand. PostgreSQL doesn't record which function arguments accept null, so the generated types make
// every argument non-null. These are the arguments the app passes null to; each function accepts it. Every client is
// typed with this Database.
type NullableArguments = {
  claim_public_page_changes: "p_deployment";
  complete_public_page_changes: "p_deployment" | "p_nonce";
  confirm_store_import_mapping: "p_stale_stock" | "p_update_scope";
  finish_push_deliveries: "p_failure_code";
  get_public_card_page: "p_after";
  place_store_import_photo: "p_row_number";
  record_app_error: "p_digest";
  request_store_admin_help: "p_message" | "p_requested_allowance";
  set_owned_listings_pause: "p_until";
  set_store_import_rows_decision: "p_row_numbers";
  submit_complaints_book_entry: "p_claimed_amount" | "p_guardian_name" | "p_listing_slug";
};

// Inventario's actions (lib/inventory-actions.ts) pass a request's values on as they came, null where one is missing or
// malformed, and each of these functions answers a missing value with its own message. Any of their arguments can be
// null.
export type InventoryActionFunction =
  | "apply_bulk_stock_operations"
  | "apply_inventory_bulk_action"
  | "apply_inventory_price_campaign"
  | "archive_inventory_item"
  | "change_inventory_sku"
  | "create_inventory_item"
  | "delete_inventory_view"
  | "get_counter_index"
  | "get_inventory_item_ids"
  | "hide_inventory_listings_bulk"
  | "link_inventory_listing"
  | "mark_store_purchase_request"
  | "preview_inventory_price_bulk"
  | "preview_inventory_price_campaign"
  | "record_purchase_request_sale"
  | "record_stock_movement"
  | "revert_inventory_price_campaign"
  | "save_inventory_view"
  | "set_inventory_item_category"
  | "set_inventory_preferences"
  | "set_inventory_price_bulk"
  | "set_inventory_threshold_bulk"
  | "unarchive_inventory_item"
  | "undo_inventory_batch"
  | "undo_stock_movements"
  | "unlink_inventory_listing"
  | "update_inventory_item";

type GeneratedFunctions = GeneratedDatabase["public"]["Functions"];

// A function without arguments has the arguments never, and keeps them.
type WithNullableArguments<Fn, Names> = Fn extends { Args: infer Args }
  ? [Args] extends [never]
    ? Fn
    : Omit<Fn, "Args"> & { Args: { [Name in keyof Args]: Name extends Names ? Args[Name] | null : Args[Name] } }
  : Fn;

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: {
      [Name in keyof GeneratedFunctions]: Name extends InventoryActionFunction
        ? WithNullableArguments<GeneratedFunctions[Name], string>
        : Name extends keyof NullableArguments
          ? WithNullableArguments<GeneratedFunctions[Name], NullableArguments[Name]>
          : GeneratedFunctions[Name];
    };
  };
};

export type DatabaseClient = SupabaseClient<Database>;

type Functions = Database["public"]["Functions"];

// One database function with its arguments, for a helper that calls several of them the same way.
export type FunctionCall = { [Name in keyof Functions]: [fn: Name, args: Functions[Name]["Args"]] }[keyof Functions];
