import Image from "next/image";

// A photo Admin compares side by side; it opens full size in a new tab. Private listing photos and signed Storage URLs
// are not optimized (they need the Admin's cookies, or expire).
export function AdminPhoto({ src, label }: { src: string | null; label: string }) {
  if (!src) return <div className="grid aspect-[4/3] place-items-center rounded border border-subtle bg-canvas t-meta">{label}: sin foto</div>;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="grid gap-1 t-meta font-semibold text-ink">
      <Image src={src} alt={label} width={320} height={240} unoptimized={!src.includes("/storage/v1/object/public/")} loading="lazy" sizes="(max-width: 639px) 50vw, 240px" className="aspect-[4/3] w-full rounded border border-subtle bg-canvas object-cover" />
      <span className="link w-fit">{label}</span>
    </a>
  );
}
