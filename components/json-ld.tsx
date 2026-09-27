import { serializeJsonLd } from "@/lib/site";

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Serialized with <, >, & and line separators escaped so user content cannot break out.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
