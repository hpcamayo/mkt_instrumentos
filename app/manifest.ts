import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/lib/site";

// big-12 (docs/ux-effortless/speed.md): Laria as an installable app. On a phone it gets an icon and opens without the
// browser's bar; the share target puts Laria in the phone's share sheet for photos, which open a new listing
// (public/sw.js receives them, /compartir hands them to the form). Colors are the frame black of the header.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Laria: instrumentos musicales en Perú",
    short_name: "Laria",
    description: SITE_DESCRIPTION,
    lang: "es-PE",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050608",
    theme_color: "#050608",
    categories: ["shopping", "music"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Vender un instrumento", short_name: "Vender", url: "/vender", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Mis favoritos", short_name: "Favoritos", url: "/mi-cuenta/favoritos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
    share_target: {
      action: "/compartir/recibir",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "titulo", text: "texto", url: "enlace", files: [{ name: "fotos", accept: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] }] },
    },
    prefer_related_applications: false,
  };
}
