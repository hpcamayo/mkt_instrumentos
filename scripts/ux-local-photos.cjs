#!/usr/bin/env node
// Local photo fixture for the UX-3b home (docs/ux-redesign/ux-3-discovery.md § Evidence plan, "3b fixtures"). The
// vitrina shows the newest approved listing of each category with 3 photos or more, and every local seed listing has
// one photo, so without this the vitrina is empty. LOCAL Supabase only.
//
//   node scripts/ux-local-photos.cjs            # add the fixture photos (running it again changes nothing)
//   node scripts/ux-local-photos.cjs --remove   # delete them again
//
// Reads NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY from .env.local (or the
// environment) and refuses any non-local URL. It only inserts or deletes rows in listing_photos, with fixed ids, for
// the seed listings named below; listings, stores and their statuses are untouched. Then it prints, as an anonymous
// visitor sees it, each category's newest approved listing with 3 photos or more.
const fs = require("node:fs");
const path = require("node:path");

function readEnv() {
  const file = path.join(process.cwd(), ".env.local");
  const values = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return { ...values, ...process.env };
}

const env = readEnv();
const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required (.env.local).");
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error(`Refusing to change photos on ${url}: local Supabase only.`);
}

async function api(method, route, { body, key = serviceKey, prefer = "return=representation" } = {}) {
  const response = await fetch(`${url}${route}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// Seed listings (supabase/seed.sql) and the total number of photos each gets. Chosen so the home's rules are visible:
// seven categories qualify and only the five most recent winners show; the newest guitar keeps one photo, so an older
// guitar is that category's winner; cymbals stop at two photos (below the threshold); a listing of a store that is not
// active gets three photos and must still never appear.
const PLAN = [
  ["guitarra-acustica-yamaha-f310-casa-musical-grau", 4, "guitarra acústica Yamaha F310"],
  ["guitarra-electrica-cort-x100-ritmo-sur-music", 3, "guitarra eléctrica Cort X100"],
  ["bajo-ibanez-gsr200-andes-sonido", 3, "bajo Ibanez GSR200"],
  ["bateria-pearl-export-usada-arequipa", 5, "batería Pearl Export"],
  ["set-platillos-meinl-hcs-usado-ayacucho", 2, "platillos Meinl HCS"],
  ["set-microfonos-bateria-cad-andes-sonido", 3, "micrófonos CAD para batería"],
  ["pedal-nux-morning-star-casa-musical-grau", 3, "pedal NUX Morning Star"],
  ["amplificador-fender-frontman-25r-usado-lima", 4, "amplificador Fender Frontman 25R"],
  ["amplificador-orange-crush-20-casa-musical-grau", 3, "amplificador Orange Crush 20"],
  ["interfaz-behringer-umc202hd-andes-sonido", 3, "interfaz Behringer UMC202HD"],
];

// Fixed ids (version 4 shape) so a second run upserts the same rows and --remove finds them.
const photoId = (listingIndex, sortOrder) => `4fb30000-0000-4000-8000-${String(listingIndex * 10 + sortOrder).padStart(12, "0")}`;
const allIds = PLAN.flatMap(([, total], index) => Array.from({ length: total - 1 }, (_, i) => photoId(index, i + 1)));

async function winners() {
  const categories = ["guitars", "basses", "drums", "cymbals", "microphones", "pedals", "amplifiers", "audio interfaces"];
  const rows = [];
  for (const category of categories) {
    const params = new URLSearchParams({
      select: "slug,published_at,photo_count:listing_photo_count",
      status: "eq.approved",
      category: `eq.${category}`,
      listing_photo_count: "gte.3",
      order: "published_at.desc.nullslast,created_at.desc,id.asc",
      limit: "1",
    });
    const [row] = await api("GET", `/rest/v1/listings?${params}`, { key: anonKey, prefer: "count=none" });
    rows.push({ category, winner: row ? `${row.slug} (${row.photo_count} fotos, ${row.published_at})` : null });
  }
  return rows;
}

(async () => {
  if (process.argv.includes("--remove")) {
    await api("DELETE", `/rest/v1/listing_photos?id=in.(${allIds.join(",")})`, { prefer: "return=minimal" });
    console.log(`removed up to ${allIds.length} fixture photos`);
  } else {
    const slugs = PLAN.map(([slug]) => slug);
    const listings = await api("GET", `/rest/v1/listings?select=id,slug&slug=in.(${slugs.join(",")})`);
    const bySlug = new Map(listings.map((listing) => [listing.slug, listing.id]));
    const rows = [];
    PLAN.forEach(([slug, total, name], index) => {
      const listingId = bySlug.get(slug);
      if (!listingId) {
        console.warn(`skipped ${slug}: not in this database`);
        return;
      }
      // The seed photo has sort_order 0; the fixture adds 1 … total - 1.
      for (let sortOrder = 1; sortOrder < total; sortOrder += 1) {
        rows.push({
          id: photoId(index, sortOrder),
          listing_id: listingId,
          image_url: `https://placehold.co/900x900?text=${encodeURIComponent(`${name} ${sortOrder + 1}`).replace(/%20/g, "+")}`,
          alt_text: `Foto ${sortOrder + 1} de ${name}`,
          sort_order: sortOrder,
        });
      }
    });
    await api("POST", "/rest/v1/listing_photos?on_conflict=id", { body: rows, prefer: "resolution=merge-duplicates,return=minimal" });
    console.log(`upserted ${rows.length} fixture photos on ${bySlug.size} listings`);
  }
  console.log("newest approved listing with 3 photos or more, per category (anonymous):");
  for (const { category, winner } of await winners()) console.log(`  ${category}: ${winner ?? "none"}`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
