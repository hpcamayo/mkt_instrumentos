import Link from "next/link";
import { categoryOptions } from "@/lib/listings";
import { getInstrumentTypeOptions } from "@/lib/listing-submission";
import { PageContainer } from "@/components/page-container";

export function GlobalCategories() {
  return <nav aria-label="Categorías del marketplace" className="border-b border-laria-fog bg-white">
    <PageContainer className="py-2"><details className="lg:hidden"><summary className="min-h-11 cursor-pointer rounded-md p-3 font-black text-laria-ink focus-visible:ring-2 focus-visible:ring-laria-blue">Explorar categorías</summary><CategoryLinks mobile /></details>
    <div className="hidden lg:block"><CategoryLinks /></div></PageContainer>
  </nav>;
}

function CategoryLinks({ mobile = false }: { mobile?: boolean }) {
  return <ul className={mobile ? "grid gap-1" : "flex flex-wrap items-center gap-1"}>
    {categoryOptions.map((category) => <li key={category.value} className="relative min-w-0"><details>
      <summary className="min-h-11 cursor-pointer rounded-md px-3 py-3 text-sm font-bold text-laria-ink hover:bg-laria-cloud focus-visible:ring-2 focus-visible:ring-laria-blue">{category.label}</summary>
      <ul className={mobile ? "grid gap-1 border-l-2 border-laria-fog pl-3" : "absolute left-0 z-30 grid w-52 gap-1 rounded-md border border-laria-fog bg-white p-2 shadow-lg"}>
        <li><Link href={`/listados?${new URLSearchParams({ category: category.value })}`} className="block min-h-11 rounded px-3 py-3 text-sm font-bold hover:bg-laria-cloud">Ver {category.label.toLowerCase()}</Link></li>
        {getInstrumentTypeOptions(category.value).map((type) => <li key={type.value}><Link href={`/listados?${new URLSearchParams({ category: category.value, instrument_type: type.value })}`} className="block min-h-11 rounded px-3 py-3 text-sm hover:bg-laria-cloud">{type.label}</Link></li>)}
      </ul></details></li>)}
  </ul>;
}
