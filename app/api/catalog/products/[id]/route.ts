import { NextResponse } from "next/server";
import { buildAutofillSuggestion } from "@/lib/catalog-intelligence/autofill";
import { noStore, prototypeAccess, prototypeCatalogSource } from "@/lib/catalog-intelligence/prototype-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Prototype: the editable suggestions for one catalog product (and, optionally, one of its variants).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await prototypeAccess();
  if (!access.ok) return access.response;
  const { id } = await params;
  const variant = new URL(request.url).searchParams.get("variant");
  if (!UUID.test(id) || (variant && !UUID.test(variant))) return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  const catalog = prototypeCatalogSource();
  if (!catalog) return NextResponse.json({ message: "El catálogo no está disponible." }, { status: 503 });
  try {
    const detail = await catalog.productDetail(id);
    if (!detail) return NextResponse.json({ message: "No encontrado." }, { status: 404 });
    return NextResponse.json(
      {
        suggestion: buildAutofillSuggestion(detail, variant),
        variants: detail.variants.map((item) => ({ id: item.id, name: item.variant_name, configuration: item.configuration, color: item.color })),
        variantAttributes: detail.variant_attributes,
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("catalog product detail", error);
    return NextResponse.json({ message: "No se pudo consultar el catálogo." }, { status: 503 });
  }
}
