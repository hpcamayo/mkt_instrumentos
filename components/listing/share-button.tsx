"use client";

import { Copy, Download, Image as ImageIcon, Share2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type Ref } from "react";
import { useDisclosure } from "@/components/use-disclosure";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ShareListingProps = {
  // The listing's absolute URL (absoluteUrl(`/instrumentos/${slug}`)).
  url: string;
  title: string;
  // The formatted price (formatPrice), or null when the listing has none ("Precio a consultar" is left out).
  priceLabel: string | null;
  // The 1080x1920 PNG for WhatsApp Status (`/instrumentos/<slug>/historia`).
  storyImageUrl: string;
  variant?: "module" | "icon";
  className?: string;
};

// What the share sheet and WhatsApp carry before the link: "<title> a S/ 1,200 en Laria".
export function shareText(title: string, priceLabel: string | null) {
  return priceLabel ? `${title} a ${priceLabel} en Laria` : `${title} en Laria`;
}

export function whatsAppShareUrl(text: string, url: string) {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

export function storyFileName(url: string) {
  const slug = url.split("/").filter(Boolean).at(-2) ?? "laria";
  return `laria-${slug}.png`;
}

type Support = { share: boolean; files: boolean };

// "Compartir" (Effortless list-08). Where the browser has a share sheet (phones, Safari, Edge), one tap opens it with
// the title, "<title> a <precio> en Laria" and the link. Elsewhere it opens a small menu: "Copiar enlace" (with a
// polite "Enlace copiado"), "WhatsApp" and "Descargar imagen para estados". Phones that can share files also get
// "Compartir imagen", which shares the story PNG itself (variant "module" only; the icon stays one tap).
export function ShareListing({ url, title, priceLabel, storyImageUrl, variant = "module", className }: ShareListingProps) {
  const [support, setSupport] = useState<Support>({ share: false, files: false });
  const [status, setStatus] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const story = useRef<Promise<File | null> | null>(null);
  const storyReady = useRef<File | null>(null);
  const menuId = useId();
  const { open, toggle, close, buttonRef: trigger, panelRef } = useDisclosure(`share-${menuId}`);
  const text = shareText(title, priceLabel);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    let files = false;
    try {
      const probe = new File([new Uint8Array([137, 80, 78, 71])], "laria.png", { type: "image/png" });
      files = typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
    } catch {
      files = false;
    }
    // Reading the browser's abilities only after hydration keeps the server and first client render identical.
    setSupport({ share: true, files: files && window.matchMedia("(pointer: coarse)").matches });
  }, []);

  async function onShare() {
    setStatus("");
    if (support.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        // The person closed the sheet: nothing to do. Any other failure falls back to the menu.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    toggle();
  }

  async function copyLink() {
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      const field = document.createElement("textarea");
      field.value = url;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      field.remove();
    }
    setStatus(copied ? "Enlace copiado" : "No se pudo copiar el enlace. Cópialo desde la barra de direcciones.");
    close(true);
  }

  // The story PNG starts loading on touch so the share sheet can still open within the tap.
  function loadStory() {
    story.current ??= fetch(storyImageUrl)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        const file = blob ? new File([blob], storyFileName(storyImageUrl), { type: "image/png" }) : null;
        storyReady.current = file;
        return file;
      })
      .catch(() => null);
    return story.current;
  }

  async function shareImage() {
    setStatus("");
    setImageBusy(true);
    const file = storyReady.current ?? (await loadStory());
    setImageBusy(false);
    if (!file) {
      story.current = null;
      setStatus("No se pudo preparar la imagen. Inténtalo otra vez.");
      return;
    }
    try {
      await navigator.share({ files: [file], title, text: `${text} ${url}` });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Some browsers only open the sheet straight from the tap; the image is ready now, so a second tap works.
      setStatus("La imagen está lista. Toca otra vez Compartir imagen.");
    }
  }

  const label = "Compartir";
  const menu = open ? (
    <ShareOptions
      ref={panelRef}
      id={menuId}
      url={url}
      text={text}
      storyImageUrl={storyImageUrl}
      align={variant === "icon" ? "end" : "start"}
      onCopy={copyLink}
      onChoose={() => close()}
    />
  ) : null;

  return (
    <div className={cn("relative", variant === "module" && "grid gap-2", className)}>
      {variant === "icon" ? (
        <button
          ref={trigger}
          type="button"
          aria-label={label}
          title={label}
          aria-expanded={support.share ? undefined : open}
          aria-controls={support.share ? undefined : menuId}
          onClick={onShare}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface text-ink transition-colors duration-120 hover:bg-canvas [&_svg]:h-5 [&_svg]:w-5"
        >
          <Share2 aria-hidden="true" />
        </button>
      ) : (
        <button
          ref={trigger}
          type="button"
          aria-expanded={support.share ? undefined : open}
          aria-controls={support.share ? undefined : menuId}
          onClick={onShare}
          className={buttonClasses({ variant: "secondary", block: true })}
        >
          <Share2 aria-hidden="true" />
          {label}
        </button>
      )}
      {variant === "module" && support.files ? (
        <button
          type="button"
          onPointerDown={loadStory}
          onClick={shareImage}
          aria-busy={imageBusy || undefined}
          className={buttonClasses({ variant: "quiet", className: "justify-self-start gap-1.5 [&_svg]:h-4 [&_svg]:w-4" })}
        >
          <ImageIcon aria-hidden="true" />
          Compartir imagen
        </button>
      ) : null}
      {menu}
      <p role="status" aria-live="polite" className={cn(status ? "t-ui text-ink-2" : "sr-only", variant === "icon" && status && "absolute right-0 top-full z-30 mt-2 w-max max-w-64 rounded-control bg-frame px-3 py-2 text-white")}>
        {status}
      </p>
    </div>
  );
}

// The fallback menu (no share sheet): copy, WhatsApp and the story image. Exported for the tests.
export function ShareOptions({
  ref,
  id,
  url,
  text,
  storyImageUrl,
  align = "start",
  onCopy,
  onChoose,
}: {
  ref?: Ref<HTMLDivElement>;
  id?: string;
  url: string;
  text: string;
  storyImageUrl: string;
  align?: "start" | "end";
  onCopy: () => void;
  onChoose: () => void;
}) {
  return (
    <div
      ref={ref}
      id={id}
      role="group"
      aria-label="Opciones para compartir"
      className={cn(
        "surface-light menu-fade absolute top-full z-30 mt-2 grid w-64 gap-1 rounded-panel border border-line-deco bg-surface p-2 text-ink shadow-level-1",
        align === "end" ? "right-0" : "left-0",
      )}
    >
      <button type="button" onClick={onCopy} className={itemClass}>
        <Copy aria-hidden="true" />
        Copiar enlace
      </button>
      <a href={whatsAppShareUrl(text, url)} target="_blank" rel="noopener noreferrer" onClick={onChoose} className={itemClass}>
        <WhatsAppGlyph />
        WhatsApp
      </a>
      <a href={storyImageUrl} download={storyFileName(storyImageUrl)} onClick={onChoose} className={itemClass}>
        <Download aria-hidden="true" />
        Descargar imagen para estados
      </a>
    </div>
  );
}

const itemClass =
  "flex min-h-11 items-center gap-3 rounded-control px-3 text-left t-ui font-semibold text-ink hover:bg-canvas [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0";
