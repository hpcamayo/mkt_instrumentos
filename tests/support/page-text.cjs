// What a visitor reads on a page, for the acceptance checks of launch audit A14 (tests/acceptance-release-gate and
// scripts/acceptance/public-pages): the visible text without scripts, styles or markup, and the wording Laria must
// never use because it would promise what Laria doesn't do (V1 scope: no checkout, escrow, shipping, commission, paid
// plans or internal chat; tests/sprint-9.test.cjs keeps the guarantee list over the source).

function visibleText(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function decodeEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", middot: "·" };
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      return String.fromCodePoint(entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

// The sentence around each match, to tell "Laria no ofrece escrow" from an offer.
function sentencesWith(text, pattern) {
  const global = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
  return [...text.matchAll(global)].map((match) => {
    const start = Math.max(text.lastIndexOf(".", match.index) + 1, match.index - 200);
    const end = text.indexOf(".", match.index);
    return text.slice(start, end < 0 ? undefined : Math.min(end + 1, match.index + 200)).trim();
  });
}

const GUARANTEE = /(garantizamos|te garantiza|laria garantiza|compra (protegida|segura) con laria|pago (protegido|seguro) (en|con) laria|protecci[oó]n al comprador|devoluci[oó]n garantizada|autenticidad garantizada|env[ií]o gratis)/i;
const CHECKOUT = /(agregar al carrito|a[nñ]adir al carrito|carrito de compras|ir a pagar|pagar ahora|pagar con tarjeta|finalizar compra|checkout|comprar ahora)/i;
const PAID_PROMOTION = /(suscr[ií]bete|suscripci[oó]n (mensual|anual|premium)|plan (premium|pro|pagado)|impulsa tu publicaci[oó]n|\bboost\b|pago por destacar|comprar (un )?plan|destacar por s\/)/i;
const SHIPPING_WORKFLOW = /(calcular (el )?env[ií]o|costo de env[ií]o|seguimiento (de|del) env[ií]o|elige (tu|el) courier|gu[ií]a de env[ií]o|programar (el )?env[ií]o)/i;
const CHAT_FEATURE = /(abrir (el )?chat|chatea con|enviar mensaje en laria|bandeja de mensajes|tus conversaciones en laria)/i;
const CHAT_LINK = /href="\/(chat|mensajes)(\/|"|\?)/i;

module.exports = { visibleText, sentencesWith, GUARANTEE, CHECKOUT, PAID_PROMOTION, SHIPPING_WORKFLOW, CHAT_FEATURE, CHAT_LINK };
