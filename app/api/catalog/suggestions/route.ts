import { NextResponse } from "next/server";
import { classifyLookup } from "@/lib/catalog-intelligence/autofill";
import { catalogQuery } from "@/lib/catalog-intelligence/catalog-resolver";
import { noStore, prototypeAccess, prototypeCatalogSource } from "@/lib/catalog-intelligence/prototype-server";

// Prototype: ranked catalog suggestions for a brand and model (catalog_lookup + catalog_match).
export async function GET(request: Request) {
  const access = await prototypeAccess();
  if (!access.ok) return access.response;
  const params = new URL(request.url).searchParams;
  const { query, manufacturerHint } = catalogQuery(params.get("brand") ?? "", params.get("model") ?? "");
  if ((params.get("model") ?? "").trim().length < 2) return NextResponse.json({ lookup: null }, { headers: noStore });
  const catalog = prototypeCatalogSource();
  if (!catalog) return NextResponse.json({ message: "El catálogo no está disponible." }, { status: 503 });
  try {
    const started = Date.now();
    const [match, rows] = await Promise.all([catalog.match(query, manufacturerHint), catalog.lookup(query, manufacturerHint, 8)]);
    return NextResponse.json({ lookup: classifyLookup(match, rows), query, latencyMs: Date.now() - started }, { headers: noStore });
  } catch (error) {
    console.error("catalog suggestions", error);
    return NextResponse.json({ message: "No se pudo consultar el catálogo." }, { status: 503 });
  }
}
