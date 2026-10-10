import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { AutofillProvenance } from "@/lib/catalog-intelligence/autofill";
import { catalogQuery } from "@/lib/catalog-intelligence/catalog-resolver";
import { DEMO_THRESHOLDS, readJevConfig } from "@/lib/catalog-intelligence/config";
import { createMockDecisionProvider, type MockScenario } from "@/lib/catalog-intelligence/decision-provider";
import { evaluateListing, planTransition, type CurrentListingState } from "@/lib/catalog-intelligence/evaluate-listing";
import { createJevGatewayProvider } from "@/lib/catalog-intelligence/jev-gateway-provider";
import { listingInputHash, type ListingSnapshot, type SellerKind } from "@/lib/catalog-intelligence/listing-evidence";
import { noStore, prototypeAccess, prototypeCatalogSource } from "@/lib/catalog-intelligence/prototype-server";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

const SCENARIOS: MockScenario[] = ["normal", "timeout", "error", "invalid", "ambiguous_scores"];
const SELLERS: SellerKind[] = ["particular", "store", "verified_store", "admin"];

// Prototype, shadow mode only: evaluates a draft listing as if it had just been saved, and returns the audit record,
// the evidence packet Jev saw and what the version-checked transition would do. It writes no listing and never
// publishes anything.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return NextResponse.json({ message: "Solicitud inválida." }, { status: 403 });
  const access = await prototypeAccess();
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });

  const config = readJevConfig();
  if (config.modeNote === "kill_switch") return NextResponse.json({ record: null, killed: true }, { headers: noStore });
  const catalog = prototypeCatalogSource();
  if (!catalog) return NextResponse.json({ message: "El catálogo no está disponible." }, { status: 503 });

  const listing = snapshotFrom(body);
  const scenario = SCENARIOS.includes(body.scenario) ? (body.scenario as MockScenario) : "normal";
  const useGateway = config.provider === "gateway" && scenario === "normal";
  const provider = useGateway ? createJevGatewayProvider(config.modelId) : createMockDecisionProvider(scenario);
  const shadowConfig = { ...config, mode: "shadow" as const, thresholds: body.thresholds === "demo" ? DEMO_THRESHOLDS : null };

  const run = await evaluateListing({ listing, catalog, provider, config: shadowConfig });
  if (!run) return NextResponse.json({ record: null }, { headers: noStore });
  const { record, packet } = run;

  const simulate = String(body.simulate ?? "none");
  const current: CurrentListingState = {
    listing_id: listing.listing_id,
    version: simulate === "edited_after" ? listing.version + 1 : listing.version,
    input_hash: simulate === "edited_after" ? listingInputHash({ ...listing, version: listing.version + 1, description: `${listing.description} (editado)` }) : record.input_hash,
    status: "pending",
    admin_decided: simulate === "admin_decided",
    applied_evaluation_id: null,
  };

  const { query, manufacturerHint } = catalogQuery(listing.brand, listing.model);
  await logSearch(query, manufacturerHint);
  return NextResponse.json({ record, packet, transition: planTransition(record, current) }, { headers: noStore });
}

function snapshotFrom(body: Record<string, unknown>): ListingSnapshot {
  const text = (value: unknown, max = 500) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const price = Number(body.price_pen);
  const photos = Number(body.photo_count);
  return {
    listing_id: `prototipo-${randomUUID()}`,
    version: 1,
    status: "pending",
    seller_kind: SELLERS.includes(body.seller_kind as SellerKind) ? (body.seller_kind as SellerKind) : "particular",
    operation: body.operation === "revision" ? "revision" : "new",
    title: text(body.title),
    brand: text(body.brand, 80),
    model: text(body.model, 120),
    category: text(body.category, 40),
    instrument_type: text(body.instrument_type, 40),
    description: text(body.description, 10000),
    attributes: body.attributes && typeof body.attributes === "object" && !Array.isArray(body.attributes) ? (body.attributes as ListingSnapshot["attributes"]) : {},
    condition: text(body.condition, 40),
    price_pen: Number.isInteger(price) && price > 0 ? price : null,
    photo_count: Number.isInteger(photos) ? photos : 0,
    city: text(body.city, 80),
    region: text(body.region, 80),
    identifiers: [],
    autofill: body.autofill && typeof body.autofill === "object" ? (body.autofill as AutofillProvenance) : null,
  };
}

// Gap queue (catalog_search_log, source 'eval'): only with CATALOG_SEARCH_LOG=1 and a service-role key. Off by
// default, so the prototype writes nothing anywhere unless someone turns it on deliberately.
async function logSearch(query: string, manufacturerHint: string | null) {
  if (process.env.CATALOG_SEARCH_LOG !== "1") return;
  const admin = getSupabaseAdminClient() as unknown as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }> } | null;
  if (!admin) return;
  const { error } = await admin.rpc("catalog_search_logged", { query, manufacturer_hint: manufacturerHint, source: "eval" });
  if (error) console.error("catalog_search_logged", error);
}
