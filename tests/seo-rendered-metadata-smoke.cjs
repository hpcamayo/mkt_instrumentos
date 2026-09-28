// Read-only rendered-metadata smoke for a running build or deployment (GET requests only).
// It is one component of the release gate, not a substitute for the owner's manual checks.
// Usage: node tests/seo-rendered-metadata-smoke.cjs <base URL> [--site=https://laria.audio]
//          [--crawlers=googlebot,bingbot] [--sold-listing=/instrumentos/<slug>]
//          [--admin-cookie-file=<path>] [--waive=<surface>:<reason> ...]
//   <base URL>       the build or deployment to request (for example a Vercel candidate URL)
//   --site           the canonical public origin the pages and sitemap must declare
//                    (default https://laria.audio, or LARIA_SMOKE_SITE_URL)
//   --crawlers       crawler user agents to request pages as (default: googlebot,bingbot)
//   --sold-listing   a sold listing's path (or LARIA_SMOKE_SOLD_LISTING)
//   --admin-cookie-file / LARIA_SMOKE_ADMIN_COOKIE  an Admin session Cookie header, used only
//                    for GET /admin/tiendas and /admin/publicaciones (never pass it in argv)
//   --waive          waive a data-dependent surface (empty-category, sold-listing,
//                    admin-records) with a reason that is printed in the coverage summary
// Required coverage: static pages, sampled category/listing/store, robots.txt, signup/login
// noindex, catalog pagination, category-only aliases, filtered catalog, populated and empty
// categories, sold listing, JSON-LD, and Admin records. Exits non-zero when any required
// surface fails or is neither verified nor explicitly waived.

const DEFAULT_SITE = "https://laria.audio";
const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const STATIC_PAGES = ["/", "/listados", "/terminos", "/privacidad", "/articulos-prohibidos", "/consejos-de-seguridad"];
const NOINDEX_PAGES = ["/registro/vendedor", "/registro/tienda", "/login"];
const REQUIRED_SURFACES = ["category", "listing", "store"];
// Legacy public listing slugs predate UUID-suffixed slugs. Only the eight
// reserved landing slugs identify categories; every other detail path is a listing.

class XmlError extends Error {}

class SmokeFailure extends Error {
  constructor(failures) {
    super(`SEO smoke FAILED (${failures.length}):\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
    this.failures = failures;
  }
}

// ---------------------------------------------------------------------------
// XML: a small non-validating XML 1.0 + Namespaces parser (no DTD support).
// Validation and extraction share this single tree, so comments, processing
// instructions and CDATA text can never masquerade as <url>/<loc> elements.
// ---------------------------------------------------------------------------

const hexEscape = (codePoint) => "\\u{" + codePoint.toString(16) + "}";
const charClass = (ranges) => ranges.map(([from, to = from]) => (from === to ? hexEscape(from) : `${hexEscape(from)}-${hexEscape(to)}`)).join("");
const NAME_START = [[0x3a], [0x41, 0x5a], [0x5f], [0x61, 0x7a], [0xc0, 0xd6], [0xd8, 0xf6], [0xf8, 0x2ff], [0x370, 0x37d], [0x37f, 0x1fff], [0x200c, 0x200d], [0x2070, 0x218f], [0x2c00, 0x2fef], [0x3001, 0xd7ff], [0xf900, 0xfdcf], [0xfdf0, 0xfffd], [0x10000, 0xeffff]];
const NAME_REST = [...NAME_START, [0x2d], [0x2e], [0x30, 0x39], [0xb7], [0x300, 0x36f], [0x203f, 0x2040]];
const XML_NAME_SOURCE = `[${charClass(NAME_START)}][${charClass(NAME_REST)}]*`;
// Namespaces in XML: each prefix and local part is an NCName (a Name without ':').
const withoutColon = (ranges) => ranges.filter(([from]) => from !== 0x3a);
const NCNAME = new RegExp(`^[${charClass(withoutColon(NAME_START))}][${charClass(withoutColon(NAME_REST))}]*$`, "u");
const PREDEFINED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function isXmlChar(codePoint) {
  return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd
    || (codePoint >= 0x20 && codePoint <= 0xd7ff)
    || (codePoint >= 0xe000 && codePoint <= 0xfffd)
    || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function parseXml(input) {
  let src = String(input ?? "");
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  for (let index = 0; index < src.length;) {
    const codePoint = src.codePointAt(index);
    if (!isXmlChar(codePoint)) throw new XmlError(`forbidden character U+${codePoint.toString(16).toUpperCase().padStart(4, "0")} at offset ${index}`);
    index += codePoint > 0xffff ? 2 : 1;
  }

  let pos = 0;
  const fail = (message) => { throw new XmlError(`${message} at offset ${pos}`); };
  const at = (text) => src.startsWith(text, pos);
  const isSpace = (char) => char === " " || char === "\t" || char === "\n" || char === "\r";
  const skipSpace = () => { while (pos < src.length && isSpace(src[pos])) pos += 1; };
  const nameToken = new RegExp(XML_NAME_SOURCE, "uy");
  const readName = () => {
    nameToken.lastIndex = pos;
    const match = nameToken.exec(src);
    if (!match) fail("expected an XML name");
    pos = nameToken.lastIndex;
    // Sitemap vocabularies are ASCII; non-ASCII names (valid only under XML 1.0 5th edition
    // rules that common parsers such as expat do not implement) are rejected conservatively.
    if (!/^[A-Za-z_:][A-Za-z0-9._:-]*$/.test(match[0])) fail(`non-ASCII or invalid XML name "${match[0]}"`);
    return match[0];
  };
  const reference = /&(?:#([0-9]+)|#x([0-9a-fA-F]+)|([^\s&;<>"']+));/y;
  const readReference = () => {
    reference.lastIndex = pos;
    const match = reference.exec(src);
    if (!match) fail("invalid or unterminated entity reference");
    pos = reference.lastIndex;
    const [, decimal, hexadecimal, name] = match;
    if (name !== undefined) {
      if (!Object.hasOwn(PREDEFINED_ENTITIES, name)) fail(`undefined entity &${name};`);
      return PREDEFINED_ENTITIES[name];
    }
    const digits = decimal ?? hexadecimal;
    const codePoint = digits.length > 8 ? -1 : parseInt(digits, decimal !== undefined ? 10 : 16);
    if (!isXmlChar(codePoint)) fail(`character reference &#${decimal ?? `x${hexadecimal}`}; is a forbidden character`);
    return String.fromCodePoint(codePoint);
  };
  const parseComment = () => {
    const end = src.indexOf("-->", pos + 4);
    if (end < 0) fail("unterminated comment");
    const body = src.slice(pos + 4, end);
    if (body.includes("--") || body.endsWith("-")) fail("invalid comment ('--' is not allowed inside a comment)");
    pos = end + 3;
  };
  const parseProcessingInstruction = () => {
    pos += 2;
    const target = readName();
    if (target.toLowerCase() === "xml") fail("XML declaration is only allowed at the start of the document");
    if (!NCNAME.test(target)) fail(`invalid processing instruction target "${target}"`);
    const end = src.indexOf("?>", pos);
    if (end < 0) fail("unterminated processing instruction");
    if (end > pos && !isSpace(src[pos])) fail("malformed processing instruction");
    pos = end + 2;
  };
  const skipMisc = () => {
    for (;;) {
      skipSpace();
      if (at("<!--")) parseComment();
      else if (at("<?")) parseProcessingInstruction();
      else return;
    }
  };
  const readAttributeValue = () => {
    const quote = src[pos];
    if (quote !== '"' && quote !== "'") fail("attribute value must be quoted");
    pos += 1;
    let value = "";
    for (;;) {
      if (pos >= src.length) fail("unterminated attribute value");
      const char = src[pos];
      if (char === quote) { pos += 1; return value; }
      if (char === "<") fail("'<' is not allowed in an attribute value");
      if (char === "&") { value += readReference(); continue; }
      value += char === "\t" || char === "\n" || char === "\r" ? " " : char;
      pos += 1;
    }
  };
  const parseElement = (scope, depth) => {
    if (depth > 64) fail("elements nested too deeply");
    pos += 1;
    const qname = readName();
    const rawAttributes = [];
    for (;;) {
      const before = pos;
      skipSpace();
      if (at("/>") || at(">")) break;
      if (pos >= src.length) fail(`truncated document: <${qname}> start tag is never finished`);
      if (pos === before) fail(`expected whitespace before an attribute of <${qname}>`);
      const name = readName();
      skipSpace();
      if (src[pos] !== "=") fail(`expected '=' after attribute "${name}"`);
      pos += 1;
      skipSpace();
      const value = readAttributeValue();
      if (rawAttributes.some((attribute) => attribute.name === name)) fail(`duplicate attribute "${name}" on <${qname}>`);
      rawAttributes.push({ name, value });
    }
    const selfClosing = at("/>");
    pos += selfClosing ? 2 : 1;

    // Every element and attribute name, including namespace declarations, must be a QName.
    const checkQName = (name, kind) => {
      const parts = name.split(":");
      if (parts.length > 2 || !parts.every((part) => NCNAME.test(part))) fail(`invalid qualified ${kind} name "${name}"`);
      return parts;
    };
    if (checkQName(qname, "element")[0] === "xmlns" && qname.includes(":")) fail(`element <${qname}> uses the reserved prefix "xmlns"`);
    for (const { name } of rawAttributes) checkQName(name, "attribute");

    const namespaces = new Map(scope);
    for (const { name, value } of rawAttributes) {
      if ((name === "xmlns" || name.startsWith("xmlns:")) && /[ \t\n\r]/.test(value)) fail(`namespace name for "${name}" contains whitespace`);
      if (name === "xmlns") {
        if (value === XML_NS || value === XMLNS_NS) fail("reserved namespace bound as the default namespace");
        namespaces.set("", value);
      } else if (name.startsWith("xmlns:")) {
        const prefix = name.slice(6);
        if (!value) fail(`namespace prefix "${prefix}" bound to an empty URI`);
        if (prefix === "xmlns" || (prefix === "xml") !== (value === XML_NS) || value === XMLNS_NS) fail(`reserved namespace prefix or URI for "${prefix}"`);
        namespaces.set(prefix, value);
      }
    }
    const resolve = (name, isAttribute) => {
      const parts = name.split(":");
      if (parts.length === 1) return { namespace: isAttribute ? "" : namespaces.get("") ?? "", local: name };
      const namespace = namespaces.get(parts[0]);
      if (namespace === undefined) fail(`unbound namespace prefix "${parts[0]}"`);
      return { namespace, local: parts[1] };
    };
    const element = { ...resolve(qname, false), qname, attributes: new Map(), children: [] };
    for (const { name, value } of rawAttributes) {
      if (name === "xmlns" || name.startsWith("xmlns:")) continue;
      const { namespace, local } = resolve(name, true);
      const key = `{${namespace}}${local}`;
      if (element.attributes.has(key)) fail(`duplicate attribute ${key} on <${qname}>`);
      element.attributes.set(key, value);
    }
    if (selfClosing) return element;

    let text = "";
    const flushText = () => { if (text) element.children.push({ text }); text = ""; };
    for (;;) {
      if (pos >= src.length) fail(`truncated document: <${qname}> is never closed`);
      if (at("</")) {
        pos += 2;
        const closing = readName();
        skipSpace();
        if (src[pos] !== ">") fail(`malformed closing tag </${closing}`);
        pos += 1;
        if (closing !== qname) fail(`mismatched closing tag </${closing}> (expected </${qname}>)`);
        flushText();
        return element;
      }
      if (at("<!--")) { parseComment(); continue; }
      if (at("<![CDATA[")) {
        const end = src.indexOf("]]>", pos + 9);
        if (end < 0) fail("unterminated CDATA section");
        text += src.slice(pos + 9, end);
        pos = end + 3;
        continue;
      }
      if (at("<?")) { parseProcessingInstruction(); continue; }
      if (at("<!")) fail("markup declarations are not allowed inside elements");
      if (src[pos] === "<") { flushText(); element.children.push(parseElement(namespaces, depth + 1)); continue; }
      if (src[pos] === "&") { text += readReference(); continue; }
      if (at("]]>")) fail("']]>' is not allowed in character data");
      text += src[pos];
      pos += 1;
    }
  };

  const declaration = /^<\?xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:"1\.[0-9]+"|'1\.[0-9]+')(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?:"[Uu][Tt][Ff]-8"|'[Uu][Tt][Ff]-8'))?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(?:"(?:yes|no)"|'(?:yes|no)'))?[ \t\r\n]*\?>/;
  if (/^<\?xml(?:[ \t\r\n?]|$)/.test(src)) {
    const match = declaration.exec(src);
    if (!match) fail("invalid XML declaration");
    pos = match[0].length;
  }
  skipMisc();
  if (at("<!DOCTYPE")) fail("DOCTYPE is not allowed in a sitemap");
  if (pos >= src.length) fail("no root element");
  if (src[pos] !== "<" || at("</") || at("<!")) fail("expected the root element");
  const root = parseElement(new Map([["xml", XML_NS]]), 0);
  skipMisc();
  if (pos < src.length) fail(src[pos] === "<" ? "more than one root element" : "content after the root element");
  return root;
}

// ---------------------------------------------------------------------------
// Sitemap protocol: {ns}urlset > {ns}url > exactly one {ns}loc (absolute http(s)
// URL on the canonical site origin). Returns the full URL objects in order.
// ---------------------------------------------------------------------------

const isSitemapElement = (node, local) => node.namespace === SITEMAP_NS && node.local === local;
const expanded = (node) => `{${node.namespace}}${node.local}`;

// W3C Datetime (the sitemap lastmod format), validated field by field: Date.parse()
// would silently normalize impossible dates such as 2026-02-31.
function isW3cDatetime(value) {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2})))?)?)?$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = match.map((part) => (part === undefined ? undefined : Number(part)));
  if (month !== undefined && (month < 1 || month > 12)) return false;
  if (day !== undefined) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (day < 1 || day > days) return false;
  }
  if (hour !== undefined && (hour > 23 || minute > 59 || (second !== undefined && second > 59))) return false;
  if (offsetHour !== undefined && (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0))) return false;
  return true;
}

// sitemaps.org optional <url> fields and their allowed values.
const OPTIONAL_URL_FIELDS = {
  lastmod: (value) => isW3cDatetime(value),
  changefreq: (value) => ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"].includes(value),
  priority: (value) => /^(0(\.\d+)?|1(\.0+)?)$/.test(value),
};

function readSitemap(xml, site = DEFAULT_SITE) {
  const siteOrigin = new URL(site).origin;
  const root = parseXml(xml);
  if (!isSitemapElement(root, "urlset")) throw new XmlError(`root element is ${expanded(root)}, expected {${SITEMAP_NS}}urlset`);
  const urls = [];
  root.children.forEach((child, index) => {
    if ("text" in child) {
      if (child.text.trim()) throw new XmlError(`text content directly inside <urlset>: "${child.text.trim().slice(0, 40)}"`);
      return;
    }
    if (!isSitemapElement(child, "url")) throw new XmlError(`unexpected element ${expanded(child)} inside <urlset> (child ${index})`);
    const locs = [];
    const seenFields = new Set();
    for (const item of child.children) {
      if ("text" in item) {
        if (item.text.trim()) throw new XmlError(`text content directly inside <url>: "${item.text.trim().slice(0, 40)}"`);
        continue;
      }
      if (item.namespace !== SITEMAP_NS) continue; // protocol extensions (for example image sitemaps)
      if (item.local === "loc") { locs.push(item); continue; }
      if (!Object.hasOwn(OPTIONAL_URL_FIELDS, item.local)) throw new XmlError(`unexpected element ${expanded(item)} inside <url>`);
      if (seenFields.has(item.local)) throw new XmlError(`<${item.local}> appears more than once in a <url>`);
      seenFields.add(item.local);
      if (item.children.some((node) => !("text" in node))) throw new XmlError(`<${item.local}> must contain only text`);
      const value = item.children.map((node) => node.text).join("").trim();
      if (!OPTIONAL_URL_FIELDS[item.local](value)) throw new XmlError(`invalid <${item.local}> value "${value}"`);
    }
    if (locs.length !== 1) throw new XmlError(`<url> must contain exactly one {${SITEMAP_NS}}loc (found ${locs.length})`);
    if (locs[0].children.some((node) => !("text" in node))) throw new XmlError("<loc> must contain only text");
    const raw = locs[0].children.map((node) => node.text).join("").trim();
    let url;
    try { url = new URL(raw); } catch { throw new XmlError(`<loc> is not an absolute URL: ${raw || "(empty)"}`); }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new XmlError(`<loc> must be an http(s) URL: ${raw}`);
    if (canonicalHttpUrl(raw) !== url.href) throw new XmlError(`<loc> is not written in canonical URL form (expected ${url.href}): ${raw}`);
    if (url.origin !== siteOrigin) throw new XmlError(`<loc> origin ${url.origin} is not the canonical site origin ${siteOrigin}: ${raw}`);
    if (url.hash) throw new XmlError(`<loc> must not contain a fragment: ${raw}`);
    if (raw.length > 2048) throw new XmlError("<loc> is longer than 2048 characters");
    if (urls.some((existing) => existing.href === url.href)) throw new XmlError(`duplicate <loc> ${url.href}`);
    urls.push(url);
  });
  return urls;
}

// Returns null when the document is a valid sitemap for `site`, otherwise the reason.
function validateSitemapXml(xml, site = DEFAULT_SITE) {
  try { readSitemap(xml, site); return null; } catch (error) {
    if (error instanceof XmlError) return error.message;
    throw error;
  }
}

// Classifies a sitemap URL path using the reserved category slugs, not an ID shape.
function classifyPath(path) {
  if (/^\/tiendas\/[^/]+$/.test(path)) return "store";
  if (/^\/instrumentos\/[^/]+$/.test(path)) {
    return CATEGORY_LANDINGS.some((landing) => path === `/instrumentos/${landing.slug}`) ? "category" : "listing";
  }
  return null;
}

function sampleSitemap(urls) {
  const samples = {};
  for (const url of urls) {
    const surface = classifyPath(url.pathname);
    if (surface && !samples[surface]) samples[surface] = url;
  }
  return samples;
}

// ---------------------------------------------------------------------------
// HTML: a tokenizer that follows the WHATWG rules that matter for <head>
// metadata. Comments (including `<!-->`/`<!--->` and `--!>`), bogus comments,
// raw text (script with its escape states, style, title, textarea, noscript, ...)
// and inert <template> content (nested too) never produce elements. The head
// insertion mode is tracked so each element knows whether it is really in <head>.
// ---------------------------------------------------------------------------

const HEAD_ELEMENTS = new Set(["base", "basefont", "bgsound", "link", "meta", "noframes", "script", "style", "template", "title", "noscript"]);
const RAWTEXT_ELEMENTS = new Set(["style", "xmp", "iframe", "noembed", "noframes", "noscript"]);
const RCDATA_ELEMENTS = new Set(["title", "textarea"]);
// The full WHATWG named character reference table (2,231 entries: 2,125 names with ";"
// plus 106 legacy names that also decode without it).
const NAMED_REFERENCES = require("./seo-html-named-references.json");
const LEGACY_REFERENCES = new Set(NAMED_REFERENCES.legacy);
const LONGEST_LEGACY = Math.max(...NAMED_REFERENCES.legacy.map((name) => name.length));
// Numeric references to C1 controls map to windows-1252 characters.
const WINDOWS_1252 = [0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178];
const REPLACEMENT = String.fromCharCode(0xfffd);
const isHtmlSpace = (char) => char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f";
const isAsciiAlpha = (char) => char !== undefined && /[A-Za-z]/.test(char);
const isTagDelimiter = (char) => char !== undefined && (isHtmlSpace(char) || char === "/" || char === ">");

// WHATWG character reference decoding (named, decimal and hexadecimal) for text and attribute values.
function decodeHtml(value, inAttribute) {
  let output = "";
  let index = 0;
  while (index < value.length) {
    const amp = value.indexOf("&", index);
    if (amp < 0) { output += value.slice(index); break; }
    output += value.slice(index, amp);
    index = amp + 1;
    if (value[index] === "#") {
      const hex = value[index + 1] === "x" || value[index + 1] === "X";
      const digitsStart = index + (hex ? 2 : 1);
      let end = digitsStart;
      while (end < value.length && (hex ? /[0-9A-Fa-f]/ : /[0-9]/).test(value[end])) end += 1;
      if (end === digitsStart) { output += "&"; continue; } // "&#" without digits stays literal
      const digits = value.slice(digitsStart, end).replace(/^0+(?=.)/, "");
      const codePoint = digits.length > 8 ? Infinity : parseInt(digits, hex ? 16 : 10);
      index = value[end] === ";" ? end + 1 : end;
      if (codePoint >= 0x80 && codePoint <= 0x9f) output += String.fromCodePoint(WINDOWS_1252[codePoint - 0x80]);
      else if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) output += REPLACEMENT;
      else output += String.fromCodePoint(codePoint);
      continue;
    }
    let runEnd = index;
    while (runEnd < value.length && /[A-Za-z0-9]/.test(value[runEnd])) runEnd += 1;
    const run = value.slice(index, runEnd);
    if (value[runEnd] === ";" && Object.hasOwn(NAMED_REFERENCES.references, run)) {
      output += NAMED_REFERENCES.references[run];
      index = runEnd + 1;
      continue;
    }
    // Without a terminating ";" only legacy names decode, using the longest matching prefix.
    let matched = null;
    for (let length = Math.min(run.length, LONGEST_LEGACY); length >= 2 && !matched; length -= 1) {
      if (LEGACY_REFERENCES.has(run.slice(0, length))) matched = run.slice(0, length);
    }
    const next = matched ? value[index + matched.length] : undefined;
    if (!matched || (inAttribute && next !== undefined && /[=A-Za-z0-9]/.test(next))) { output += "&"; continue; }
    output += NAMED_REFERENCES.references[matched];
    index += matched.length;
  }
  return output;
}

// Index where a script element's content ends (the start of its closing tag), per the script data states.
function findScriptEnd(src, from) {
  const word = (index, text) => src.slice(index, index + text.length).toLowerCase() === text && isTagDelimiter(src[index + text.length]);
  let state = "data";
  let index = from;
  while (index < src.length) {
    const char = src[index];
    if (state === "data") {
      if (src.startsWith("<!--", index)) { state = "escapedDashDash"; index += 4; continue; }
      if (word(index, "</script")) return index;
      index += 1;
      continue;
    }
    if (state.startsWith("escaped")) {
      if (char === "-") { state = state === "escaped" ? "escapedDash" : "escapedDashDash"; index += 1; continue; }
      if (char === ">" && state === "escapedDashDash") { state = "data"; index += 1; continue; }
      if (char === "<") {
        if (word(index, "</script")) return index;
        if (word(index, "<script")) { state = "double"; index += 7; continue; }
      }
      state = "escaped";
      index += 1;
      continue;
    }
    if (char === "-") { state = state === "double" ? "doubleDash" : "doubleDashDash"; index += 1; continue; }
    if (char === ">" && state === "doubleDashDash") { state = "data"; index += 1; continue; }
    if (char === "<" && word(index, "</script")) { state = "escaped"; index += 8; continue; }
    state = "double";
    index += 1;
  }
  return src.length;
}

function findRawTextEnd(src, from, name) {
  const pattern = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, "ig");
  pattern.lastIndex = from;
  const match = pattern.exec(src);
  return match ? match.index : src.length;
}

function parseHtmlElements(html) {
  const src = String(html ?? "");
  const elements = [];
  let phase = "before-head"; // before-head | in-head | after-head | body
  let templateDepth = 0;
  let pos = 0;
  const onText = (text) => {
    if (!text || templateDepth || phase === "body") return;
    if (/[^ \t\n\r\f]/.test(decodeHtml(text, false))) phase = "body";
  };
  const skipPast = (terminator, from) => {
    const end = src.indexOf(terminator, from);
    pos = end < 0 ? src.length : end + terminator.length;
  };
  const readTag = () => { // pos is just after "<" or "</"
    let name = "";
    while (pos < src.length && !isTagDelimiter(src[pos])) name += src[pos++];
    const attributes = new Map();
    while (pos < src.length) {
      while (pos < src.length && (isHtmlSpace(src[pos]) || src[pos] === "/")) pos += 1;
      if (src[pos] === ">") { pos += 1; return { name: name.toLowerCase().replaceAll(String.fromCharCode(0), REPLACEMENT), attributes }; }
      if (pos >= src.length) break;
      let attributeName = src[pos++];
      while (pos < src.length && !isTagDelimiter(src[pos]) && src[pos] !== "=") attributeName += src[pos++];
      while (pos < src.length && isHtmlSpace(src[pos])) pos += 1;
      let value = "";
      if (src[pos] === "=") {
        pos += 1;
        while (pos < src.length && isHtmlSpace(src[pos])) pos += 1;
        const quote = src[pos];
        if (quote === '"' || quote === "'") {
          const end = src.indexOf(quote, pos + 1);
          if (end < 0) { pos = src.length; break; }
          value = src.slice(pos + 1, end);
          pos = end + 1;
        } else {
          while (pos < src.length && !isHtmlSpace(src[pos]) && src[pos] !== ">") value += src[pos++];
        }
      }
      // The tokenizer replaces U+0000 in names and values with U+FFFD.
      const key = attributeName.toLowerCase().replaceAll(String.fromCharCode(0), REPLACEMENT);
      if (!attributes.has(key)) attributes.set(key, decodeHtml(value, true).replaceAll(String.fromCharCode(0), REPLACEMENT)); // the first duplicate wins
    }
    return null; // EOF inside a tag: the tag is dropped
  };

  while (pos < src.length) {
    const open = src.indexOf("<", pos);
    onText(src.slice(pos, open < 0 ? src.length : open));
    if (open < 0) break;
    pos = open;
    const next = src[pos + 1];
    if (src.startsWith("<!--", pos)) {
      if (src.startsWith("<!-->", pos)) { pos += 5; continue; }
      if (src.startsWith("<!--->", pos)) { pos += 6; continue; }
      const close = src.indexOf("-->", pos + 4);
      const bang = src.indexOf("--!>", pos + 4);
      if (close < 0 && bang < 0) { pos = src.length; continue; }
      pos = bang >= 0 && (close < 0 || bang < close) ? bang + 4 : close + 3;
      continue;
    }
    if (next === "!" || next === "?") { skipPast(">", pos + 2); continue; }
    if (next === "/") {
      if (src[pos + 2] === ">") { pos += 3; continue; }
      if (!isAsciiAlpha(src[pos + 2])) { skipPast(">", pos + 2); continue; }
      pos += 2;
      const tag = readTag();
      if (!tag) break;
      if (tag.name === "template") { if (templateDepth) templateDepth -= 1; continue; }
      if (templateDepth) continue;
      if (tag.name === "head" && phase !== "body") phase = "after-head";
      else if (["body", "html", "br"].includes(tag.name)) phase = "body";
      continue;
    }
    if (!isAsciiAlpha(next)) { onText("<"); pos += 1; continue; }
    pos += 1;
    const tag = readTag();
    if (!tag) break;
    const { name } = tag;
    let element = null;
    if (!templateDepth) {
      if (name === "head") { if (phase === "before-head") phase = "in-head"; }
      else if (name === "body" || name === "frameset") phase = "body";
      else if (name !== "html") {
        // "after head" re-enters <head> only for these; <noscript> there starts the body.
        if (HEAD_ELEMENTS.has(name) && !(phase === "after-head" && name === "noscript")) { if (phase === "before-head") phase = "in-head"; }
        else phase = "body";
        element = { name, attributes: tag.attributes, inHead: phase !== "body" };
        elements.push(element);
      }
    }
    if (name === "template") templateDepth += 1;
    else if (name === "script") {
      const end = findScriptEnd(src, pos);
      if (element) element.text = src.slice(pos, end); // raw script text, used for JSON-LD
      pos = end;
    }
    else if (name === "plaintext") pos = src.length;
    else if (RAWTEXT_ELEMENTS.has(name) || RCDATA_ELEMENTS.has(name)) pos = findRawTextEnd(src, pos, name);
  }
  return elements;
}

function readPageMetadata(html) {
  const elements = parseHtmlElements(html);
  const attribute = (element, name) => element.attributes.get(name) ?? "";
  const meta = (key, match) => elements.filter((element) => element.name === "meta" && match(attribute(element, key)));
  const head = (list) => list.filter((element) => element.inHead);
  const canonicalLinks = elements.filter((element) => element.name === "link" && attribute(element, "rel").toLowerCase().split(/[ \t\n\r\f]+/).includes("canonical"));
  // Open Graph property names are case-sensitive; meta names are ASCII case-insensitive.
  const ogUrl = meta("property", (value) => value.trim() === "og:url");
  const ogTitle = meta("property", (value) => value.trim() === "og:title");
  const robots = meta("name", (value) => value.trim().toLowerCase() === "robots");
  const crawlerRobots = meta("name", (value) => ["robots", "googlebot", "googlebot-news", "bingbot"].includes(value.trim().toLowerCase()));
  const content = (list) => list.map((element) => attribute(element, "content"));
  return {
    // Elements that exist only outside <head> (for example streamed metadata) explain a missing count.
    outsideHead: {
      canonical: canonicalLinks.filter((element) => !element.inHead).length,
      ogUrl: ogUrl.filter((element) => !element.inHead).length,
      ogTitle: ogTitle.filter((element) => !element.inHead).length,
    },
    canonical: head(canonicalLinks).map((element) => attribute(element, "href")),
    ogUrl: content(head(ogUrl)),
    ogTitle: content(head(ogTitle)),
    robots: content(head(robots)),
    // Every real robots-style meta element, in or out of <head>, for "must stay indexable" checks.
    anyCrawlerRobots: content(crawlerRobots),
  };
}

// ---------------------------------------------------------------------------
// Robots directives (meta content and X-Robots-Tag). Directives without a value
// must be whole tokens; `name: value` is only valid for value directives. In a
// header, an unknown `agent:` prefix scopes the following directives to that agent.
// ---------------------------------------------------------------------------

const FLAG_DIRECTIVES = new Set(["all", "none", "index", "noindex", "follow", "nofollow", "noarchive", "nocache", "nosnippet", "indexifembedded", "notranslate", "noimageindex", "noodp", "noydir"]);
const VALUE_DIRECTIVES = new Set(["max-snippet", "max-image-preview", "max-video-preview", "unavailable_after"]);
const VALUE_DIRECTIVES_VALID = {
  "max-snippet": (value) => /^(-1|\d+)$/.test(value),
  "max-video-preview": (value) => /^(-1|\d+)$/.test(value),
  "max-image-preview": (value) => ["none", "standard", "large"].includes(value),
  unavailable_after: (value) => !Number.isNaN(Date.parse(value)),
};

function parseRobots(values, { allowAgents }) {
  const generic = [];
  const scoped = [];
  const malformed = [];
  for (const value of values) {
    let agent = null;
    for (const part of String(value).split(",")) {
      let token = part.trim().toLowerCase();
      if (!token) continue;
      for (;;) {
        const colon = token.indexOf(":");
        const head = (colon < 0 ? token : token.slice(0, colon)).trim();
        const rest = colon < 0 ? null : token.slice(colon + 1).trim();
        if (FLAG_DIRECTIVES.has(head) && rest === null) { (agent ? scoped : generic).push(agent ? `${agent}:${head}` : head); break; }
        if (VALUE_DIRECTIVES.has(head) && rest && VALUE_DIRECTIVES_VALID[head](rest)) { (agent ? scoped : generic).push(agent ? `${agent}:${head}` : head); break; }
        if (allowAgents && rest && !FLAG_DIRECTIVES.has(head) && !VALUE_DIRECTIVES.has(head) && /^[a-z0-9_-]+$/.test(head)) { agent = head; token = rest; continue; }
        malformed.push(part.trim());
        break;
      }
    }
  }
  return { generic, scoped, malformed };
}

function robotsDirectives(values) {
  return parseRobots(values, { allowAgents: true }).generic;
}

function requireNoindex(parsed, source) {
  if (parsed.malformed.length) return `${source} has malformed directive(s): ${parsed.malformed.join(" | ")}`;
  const set = new Set(parsed.generic);
  const noindex = set.has("noindex") || set.has("none");
  const nofollow = set.has("nofollow") || set.has("none");
  const conflicting = ["all", "index", "follow"].filter((token) => set.has(token));
  if (!noindex || !nofollow) return `${source} lacks the ${[!noindex && "noindex", !nofollow && "nofollow"].filter(Boolean).join(" and ")} directive (found: ${parsed.generic.join(", ") || "none"})`;
  if (conflicting.length) return `${source} has conflicting directive(s): ${conflicting.join(", ")}`;
  return null;
}

function forbidNoindex(parsed, source) {
  if (parsed.malformed.length) return `${source} has malformed directive(s): ${parsed.malformed.join(" | ")}`;
  const blocking = [...parsed.generic, ...parsed.scoped].filter((token) => /(^|:)(noindex|none)$/.test(token));
  return blocking.length ? `${source} blocks indexing of a public page (${blocking.join(", ")})` : null;
}

// ---------------------------------------------------------------------------
// URLs, headers and robots.txt
// ---------------------------------------------------------------------------

// Accepts only an absolute http(s) URL already written in canonical form (the
// root may omit its trailing slash, as Next.js renders it). Returns its href.
function canonicalHttpUrl(raw) {
  if (typeof raw !== "string" || !/^https?:\/\/[^\s\\]+$/.test(raw)) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (raw === url.href || (url.pathname === "/" && !url.search && !url.hash && `${raw}/` === url.href)) return url.href;
  return null;
}

function mediaType(response) {
  const header = response.headers.get("content-type") ?? "";
  const charset = /;\s*charset\s*=\s*"?([^";\s]+)/i.exec(header)?.[1]?.toLowerCase();
  // The smoke decodes bodies as UTF-8, so any other declared charset is treated as a wrong type.
  if (charset && charset !== "utf-8" && charset !== "utf8") return `${header.split(";")[0].trim().toLowerCase()}; charset=${charset}`;
  return header.split(";")[0].trim().toLowerCase();
}

// Strict RFC 8288 / RFC 9110 Link header parser:
//   link-value = "<" URI-Reference ">" *( OWS ";" OWS link-param )
//   link-param = token BWS [ "=" BWS ( token / quoted-string ) ]
// Any grammar violation is reported as malformed rather than guessed around.
const TCHAR = /[!#$%&'*+\-.^_`|~0-9A-Za-z]/;
// Characters that may appear unescaped in a URI-reference (RFC 3986), including "%".
const URI_CHAR = /[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/;

function parseLinkHeader(header) {
  const src = String(header ?? "");
  const links = [];
  const malformed = [];
  let pos = 0;
  const isOws = (char) => char === " " || char === "\t";
  const skipOws = () => { while (pos < src.length && isOws(src[pos])) pos += 1; };
  const fail = (reason) => { const error = new Error(reason); error.linkGrammar = true; throw error; };
  const readToken = (what) => {
    const start = pos;
    while (pos < src.length && TCHAR.test(src[pos])) pos += 1;
    if (pos === start) fail(`expected ${what} at offset ${start}`);
    return src.slice(start, pos);
  };
  const readQuoted = () => {
    const start = pos;
    pos += 1;
    let value = "";
    for (;;) {
      if (pos >= src.length) fail(`unterminated quoted-string starting at offset ${start}`);
      const char = src[pos];
      const code = char.charCodeAt(0);
      if (char === '"') { pos += 1; return value; }
      if (char === "\\") {
        const next = src[pos + 1];
        if (next === undefined || !(next === "\t" || (next.charCodeAt(0) >= 0x20 && next.charCodeAt(0) !== 0x7f))) fail(`invalid quoted-pair at offset ${pos}`);
        value += next;
        pos += 2;
        continue;
      }
      if (!(char === "\t" || (code >= 0x20 && code !== 0x7f))) fail(`invalid character in quoted-string at offset ${pos}`);
      value += char;
      pos += 1;
    }
  };
  const parseLinkValue = () => {
    if (src[pos] !== "<") fail(`expected "<" at offset ${pos}`);
    const close = src.indexOf(">", pos + 1);
    if (close < 0) fail(`unterminated URI reference at offset ${pos}`);
    const target = src.slice(pos + 1, close);
    for (const char of target) if (!URI_CHAR.test(char)) fail(`invalid character ${JSON.stringify(char)} in URI reference <${target}>`);
    pos = close + 1;
    const params = new Map();
    for (;;) {
      skipOws();
      if (pos >= src.length || src[pos] === ",") break;
      if (src[pos] !== ";") fail(`expected ";" or "," at offset ${pos}`);
      pos += 1;
      skipOws();
      const name = readToken("a parameter name").toLowerCase();
      skipOws();
      let value = null;
      if (src[pos] === "=") {
        pos += 1;
        skipOws();
        value = src[pos] === '"' ? readQuoted() : readToken(`a value for parameter "${name}"`);
      }
      if (!params.has(name)) params.set(name, value ?? "");
    }
    return { target, params };
  };

  while (pos < src.length) {
    skipOws();
    if (src[pos] === ",") { pos += 1; continue; } // empty list elements are allowed
    if (pos >= src.length) break;
    const start = pos;
    try {
      links.push(parseLinkValue());
    } catch (error) {
      if (!error.linkGrammar) throw error;
      // Resynchronize at the next top-level comma so later links are still inspected.
      let inQuote = false;
      while (pos < src.length && (inQuote || src[pos] !== ",")) {
        if (src[pos] === '"') inQuote = !inQuote;
        else if (src[pos] === "\\" && inQuote) pos += 1;
        pos += 1;
      }
      malformed.push(`${error.message}: ${src.slice(start, pos).trim()}`);
    }
  }
  return { links, malformed };
}

function linkHeaderCanonicals(header) {
  return parseLinkHeader(header).links
    .filter((link) => (link.params.get("rel") ?? "").toLowerCase().split(/[ \t]+/).includes("canonical"))
    .map((link) => link.target);
}

function parseRobotsTxt(text) {
  const groups = [];
  const sitemaps = [];
  const invalid = [];
  let current = null;
  let lastWasAgent = false;
  let source = String(text);
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  for (const rawLine of source.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    const key = colon < 0 ? "" : line.slice(0, colon).trim().toLowerCase();
    const value = colon < 0 ? "" : line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (!current) invalid.push(`${rawLine.trim()} (rule before any User-agent)`);
      else if (value && !/^[/*]/.test(value)) invalid.push(`${rawLine.trim()} (path must start with / or *)`);
      else if (value) current.rules.push({ allow: key === "allow", pattern: value });
    } else if (key === "sitemap") {
      sitemaps.push(value);
    } else {
      // Crawlers are lenient with misspelled fields (for example "dissallow"), so an
      // unrecognized line could hide a real rule: treat it as an error, never ignore it.
      invalid.push(rawLine.trim());
    }
  }
  return { groups, sitemaps, invalid };
}

// RFC 9309: the most specific matching group applies, falling back to "*"; the longest
// matching rule wins and allow wins ties. Paths include the query string.
// RFC 9309 / Google: non-ASCII characters are compared as UTF-8 percent-encoding,
// percent-encoded unreserved characters are compared decoded, and hex digits are case-insensitive.
function normalizeRobotsPath(value) {
  let encoded = "";
  for (const char of String(value)) {
    const code = char.codePointAt(0);
    encoded += code > 0x7e || code <= 0x20 || '"<>`{}'.includes(char) ? encodeURIComponent(char) : char;
  }
  return encoded.replace(/%([0-9a-fA-F]{2})/g, (match, hex) => {
    const char = String.fromCharCode(parseInt(hex, 16));
    return /[A-Za-z0-9\-._~]/.test(char) ? char : `%${hex.toUpperCase()}`;
  });
}

// Wildcard runs collapse and trailing wildcards are ignored: "/fish*" is the same rule as
// "/fish" and must not gain specificity from extra asterisks.
function normalizeRobotsPattern(pattern) {
  const anchored = pattern.endsWith("$");
  let body = normalizeRobotsPath(anchored ? pattern.slice(0, -1) : pattern).replace(/\*+/g, "*");
  if (!anchored) body = body.replace(/\*+$/, "");
  return { body, anchored, specificity: body.length + (anchored ? 1 : 0) };
}

function robotsAllows(robots, agent, path) {
  const token = agent.toLowerCase();
  let rules = robots.groups.filter((group) => group.agents.includes(token)).flatMap((group) => group.rules);
  if (!robots.groups.some((group) => group.agents.includes(token))) rules = robots.groups.filter((group) => group.agents.includes("*")).flatMap((group) => group.rules);
  const target = normalizeRobotsPath(path);
  let best = null;
  for (const rule of rules) {
    const { body, anchored, specificity } = normalizeRobotsPattern(rule.pattern);
    const regex = new RegExp(`^${body.split("*").map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`);
    if (!regex.test(target)) continue;
    if (!best || specificity > best.specificity || (specificity === best.specificity && rule.allow)) best = { allow: rule.allow, specificity };
  }
  return !best || best.allow;
}

// ---------------------------------------------------------------------------
// Page checks
// ---------------------------------------------------------------------------

// Checks one set of canonical/og:url/og:title elements (from the raw <head> or the rendered <head>).
function headMetadataProblems(label, expected, metadata, where, outsideHead = {}) {
  const exactlyOne = (list, what, key) => {
    if (list.length === 1) return null;
    const outside = outsideHead[key];
    const hint = outside ? ` (${outside} found outside <head>, e.g. metadata streamed into <body>)` : "";
    return `${label}: expected exactly one ${what} in ${where}, found ${list.length}${hint}`;
  };
  const countProblem = exactlyOne(metadata.canonical, '<link rel="canonical">', "canonical")
    ?? exactlyOne(metadata.ogUrl, '<meta property="og:url">', "ogUrl")
    ?? exactlyOne(metadata.ogTitle, '<meta property="og:title">', "ogTitle");
  if (countProblem) return [countProblem];
  const problems = [];
  if (!metadata.ogTitle[0].trim()) problems.push(`${label}: og:title is empty`);
  for (const [what, raw] of [["canonical", metadata.canonical[0]], ["og:url", metadata.ogUrl[0]]]) {
    const url = canonicalHttpUrl(raw);
    if (!url) problems.push(`${label}: ${what} is not an absolute http(s) URL in canonical form (${raw || "empty"})`);
    else if (url !== expected) problems.push(`${label}: ${what} ${url} is not the expected ${expected}`);
  }
  return problems;
}

// HTML-limited crawlers (for example Bingbot) only read the initial HTML <head>.
// Googlebot renders JavaScript, and Next.js deliberately streams metadata into <body>
// for it; such pages are accepted only when the rendered DOM's <head> is correct.
const RENDERING_CRAWLERS = new Set(["googlebot"]);

class RenderUnavailable extends Error {}

async function indexablePageProblems(label, expectedUrl, response, html, { crawler, render }) {
  const problems = [];
  const expected = new URL(expectedUrl).href;
  if (mediaType(response) !== "text/html") problems.push(`${label}: Content-Type is "${response.headers.get("content-type") ?? "missing"}", expected text/html`);
  const metadata = readPageMetadata(html);
  const rawProblems = headMetadataProblems(label, expected, metadata, "the initial HTML <head>", metadata.outsideHead);
  // "Streamed" means every element exists exactly once in the initial HTML, just outside <head>.
  const keys = ["canonical", "ogUrl", "ogTitle"];
  const streamed = keys.some((key) => metadata.outsideHead[key] > 0) && keys.every((key) => metadata[key].length + metadata.outsideHead[key] === 1);
  if (rawProblems.length && streamed && RENDERING_CRAWLERS.has(crawler)) {
    try {
      const rendered = await render();
      problems.push(...headMetadataProblems(`${label} (rendered DOM)`, expected, rendered, "the rendered <head>"));
      const renderedRobots = forbidNoindex(parseRobots(rendered.robots, { allowAgents: false }), `${label} (rendered DOM): robots meta`);
      if (renderedRobots) problems.push(renderedRobots);
    } catch (error) {
      if (!(error instanceof RenderUnavailable)) throw error;
      problems.push(`${label}: metadata is streamed outside the initial <head>; the rendered DOM must be verified but no browser is available (${error.message}). Install playwright-core with Chromium, set LARIA_SMOKE_CHROMIUM, or run with --crawlers=bingbot`);
    }
  } else {
    problems.push(...rawProblems);
  }
  const link = response.headers.get("link");
  if (link) {
    const parsed = parseLinkHeader(link);
    if (parsed.malformed.length) problems.push(`${label}: Link header has unparseable entries: ${parsed.malformed.join(" | ")}`);
    for (const raw of linkHeaderCanonicals(link)) {
      if (canonicalHttpUrl(raw) !== expected) problems.push(`${label}: Link header canonical ${raw} is not the expected ${expected}`);
    }
  }
  const header = response.headers.get("x-robots-tag");
  if (header) {
    const problem = forbidNoindex(parseRobots([header], { allowAgents: true }), `${label}: X-Robots-Tag "${header}"`);
    if (problem) problems.push(problem);
  }
  const metaProblem = forbidNoindex(parseRobots(metadata.anyCrawlerRobots, { allowAgents: false }), `${label}: robots meta`);
  if (metaProblem) problems.push(metaProblem);
  return problems;
}

// Default renderer: headless Chromium through an optional playwright-core install.
function createBrowserRenderer() {
  let browserPromise = null;
  const loadPlaywright = () => {
    for (const name of [process.env.LARIA_SMOKE_PLAYWRIGHT, "playwright-core", "playwright"].filter(Boolean)) {
      try { return require(name); } catch { /* try the next candidate */ }
    }
    return null;
  };
  return {
    async render(url, userAgent) {
      if (!browserPromise) {
        const playwright = loadPlaywright();
        if (!playwright) throw new RenderUnavailable("playwright-core is not installed");
        browserPromise = playwright.chromium.launch({ executablePath: process.env.LARIA_SMOKE_CHROMIUM || undefined });
      }
      let browser;
      try { browser = await browserPromise; } catch (error) { throw new RenderUnavailable(`Chromium could not be launched: ${error.message.split("\n")[0]}`); }
      const context = await browser.newContext({ userAgent });
      try {
        const page = await context.newPage();
        const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
        if (!response || response.status() !== 200) throw new Error(`rendered navigation to ${url} returned HTTP ${response ? response.status() : "none"}`);
        return await page.evaluate(() => {
          const tokens = (value) => (value || "").toLowerCase().split(/[\t\n\f\r ]+/);
          const inHead = (selector) => [...document.head.querySelectorAll(selector)];
          const metas = (attribute, match) => inHead("meta").filter((meta) => match((meta.getAttribute(attribute) || "").trim())).map((meta) => meta.getAttribute("content") || "");
          return {
            canonical: inHead("link").filter((link) => tokens(link.getAttribute("rel")).includes("canonical")).map((link) => link.getAttribute("href") || ""),
            ogUrl: metas("property", (value) => value === "og:url"),
            ogTitle: metas("property", (value) => value === "og:title"),
            robots: metas("name", (value) => ["robots", "googlebot"].includes(value.toLowerCase())),
          };
        });
      } finally {
        await context.close();
      }
    },
    async close() {
      if (!browserPromise) return;
      try { await (await browserPromise).close(); } catch { /* launch failed; nothing to close */ }
    },
  };
}

function noindexPageProblems(path, response, html) {
  const problems = [];
  if (mediaType(response) !== "text/html") problems.push(`${path}: Content-Type is "${response.headers.get("content-type") ?? "missing"}", expected text/html`);
  const header = response.headers.get("x-robots-tag");
  if (!header) problems.push(`${path}: X-Robots-Tag header missing`);
  else {
    const problem = requireNoindex(parseRobots([header], { allowAgents: true }), `${path}: X-Robots-Tag "${header}"`);
    if (problem) problems.push(problem);
  }
  const robots = readPageMetadata(html).robots;
  if (!robots.length) problems.push(`${path}: <meta name="robots"> element missing from <head>`);
  else {
    const problem = requireNoindex(parseRobots(robots, { allowAgents: false }), `${path}: <meta name="robots">`);
    if (problem) problems.push(problem);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function httpOrigin(value, label) {
  let url = null;
  try { url = /^https?:\/\//i.test(String(value)) ? new URL(value) : null; } catch { url = null; }
  if (!url) throw new SmokeFailure([`${label} must be an absolute http(s) URL (got ${value || "nothing"})`]);
  return url.origin;
}

// ---------------------------------------------------------------------------
// Structured data (JSON-LD) from real <script type="application/ld+json"> elements.
// ---------------------------------------------------------------------------

function readJsonLd(html) {
  const items = [];
  const errors = [];
  for (const element of parseHtmlElements(html)) {
    if (element.name !== "script" || (element.attributes.get("type") ?? "").trim().toLowerCase() !== "application/ld+json") continue;
    try {
      const value = JSON.parse(element.text ?? "");
      for (const item of Array.isArray(value) ? value : [value]) items.push(item);
    } catch (error) {
      errors.push(`invalid JSON-LD (${error.message})`);
    }
  }
  return { items, errors };
}

const ofType = (items, type) => items.filter((item) => item && typeof item === "object" && item["@type"] === type);

// Returns problems for the JSON-LD a surface must carry. `context.sitemap` is the set of sitemap hrefs.
function structuredDataProblems(label, surface, expectedUrl, html, context = {}) {
  const { items, errors } = readJsonLd(html);
  const problems = errors.map((error) => `${label}: ${error}`);
  for (const item of items) {
    if (item?.["@context"] !== "https://schema.org") problems.push(`${label}: JSON-LD @context must be "https://schema.org" (got ${JSON.stringify(item?.["@context"])})`);
  }
  const expected = new URL(expectedUrl).href;
  const one = (type) => {
    const found = ofType(items, type);
    if (found.length !== 1) { problems.push(`${label}: expected exactly one ${type} JSON-LD item, found ${found.length}`); return null; }
    return found[0];
  };
  const sameUrl = (value, what) => {
    const url = canonicalHttpUrl(value);
    if (url !== expected) problems.push(`${label}: ${what} is ${JSON.stringify(value)}, expected ${expected}`);
  };
  if (surface === "home") {
    const organization = one("Organization");
    if (organization) sameUrl(organization.url, "Organization.url");
  }
  if (surface === "category" || surface === "empty-category") {
    const breadcrumb = one("BreadcrumbList");
    const last = breadcrumb?.itemListElement?.at?.(-1);
    if (breadcrumb) sameUrl(last?.item, "the last BreadcrumbList item");
    const lists = ofType(items, "ItemList");
    if (surface === "empty-category" && lists.length) problems.push(`${label}: an empty category must not publish an ItemList`);
    if (surface === "category") {
      const list = one("ItemList");
      const entries = Array.isArray(list?.itemListElement) ? list.itemListElement : [];
      if (list && (!entries.length || list.numberOfItems !== entries.length)) problems.push(`${label}: ItemList numberOfItems (${list.numberOfItems}) must equal its ${entries.length} entries and be at least 1`);
      for (const entry of entries) {
        const url = canonicalHttpUrl(entry?.url);
        if (!url || new URL(url).origin !== new URL(expected).origin) problems.push(`${label}: ItemList entry URL ${JSON.stringify(entry?.url)} is not a canonical URL on the site origin`);
        else if (context.sitemap && !context.sitemap.has(url)) problems.push(`${label}: ItemList lists ${url}, which is not in sitemap.xml (non-public or sold inventory)`);
      }
    }
  }
  if (surface === "listing" || surface === "sold-listing") {
    const product = one("Product");
    if (product) {
      sameUrl(product.url, "Product.url");
      if (typeof product.name !== "string" || !product.name.trim()) problems.push(`${label}: Product.name is empty`);
      const offers = product.offers;
      if (surface === "sold-listing" && offers?.availability !== "https://schema.org/SoldOut") problems.push(`${label}: a sold listing must publish offers.availability SoldOut (got ${JSON.stringify(offers?.availability)})`);
      if (offers !== undefined) {
        if (offers.priceCurrency !== "PEN") problems.push(`${label}: offers.priceCurrency must be PEN`);
        if (typeof offers.price !== "number" || !(offers.price >= 0)) problems.push(`${label}: offers.price must be a non-negative number`);
        sameUrl(offers.url, "offers.url");
        if (surface === "listing" && offers.availability !== "https://schema.org/InStock") problems.push(`${label}: a public listing must publish offers.availability InStock (got ${JSON.stringify(offers.availability)})`);
        if (offers.seller !== undefined && offers.seller?.["@type"] !== "Organization") problems.push(`${label}: only stores may be named as the offer seller`);
      }
    }
  }
  if (surface === "store") {
    const store = one("Store");
    if (store) {
      sameUrl(store.url, "Store.url");
      if (typeof store.name !== "string" || !store.name.trim()) problems.push(`${label}: Store.name is empty`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Required coverage
// ---------------------------------------------------------------------------

// Category landings, kept in step with lib/category-pages.ts by tests/sprint-9-gate.test.cjs.
const CATEGORY_LANDINGS = [
  { category: "guitars", slug: "guitarras" },
  { category: "basses", slug: "bajos" },
  { category: "drums", slug: "baterias" },
  { category: "cymbals", slug: "platillos" },
  { category: "microphones", slug: "microfonos" },
  { category: "pedals", slug: "pedales" },
  { category: "amplifiers", slug: "amplificadores" },
  { category: "audio interfaces", slug: "interfaces-de-audio" },
];

// Every release gate must verify these, or waive a data-dependent one explicitly.
const REQUIRED_COVERAGE = {
  "catalog-pagination": { waivable: false },
  "category-aliases": { waivable: false },
  "filtered-catalog": { waivable: false },
  "populated-category": { waivable: false },
  "empty-category": { waivable: true, how: "no category is empty in this dataset" },
  "sold-listing": { waivable: true, how: "pass --sold-listing=/instrumentos/<slug of a sold listing>" },
  "structured-data": { waivable: false },
  "admin-records": { waivable: true, how: "set LARIA_SMOKE_ADMIN_COOKIE to an Admin session Cookie header" },
};

// "noindex, follow" pages: the robots meta must say noindex, and neither the X-Robots-Tag header
// (generic or agent-scoped) nor any robots-style meta may add nofollow or none, because search
// engines apply the most restrictive of conflicting rules.
function noindexFollowProblems(label, response, metadata) {
  const problems = [];
  const meta = parseRobots(metadata.robots, { allowAgents: false });
  const set = new Set(meta.generic);
  if (meta.malformed.length) problems.push(`${label}: robots meta has malformed directive(s): ${meta.malformed.join(" | ")}`);
  if (!set.has("noindex") || set.has("nofollow") || set.has("none")) problems.push(`${label}: expected a noindex, follow robots meta (found: ${meta.generic.join(", ") || "none"})`);
  const restrictive = (parsed) => [...parsed.generic, ...parsed.scoped].filter((token) => /(^|:)(nofollow|none)$/.test(token));
  // Crawler-specific metas (googlebot, bingbot) and robots metas outside <head> count too.
  const anyMeta = parseRobots(metadata.anyCrawlerRobots, { allowAgents: false });
  const extra = restrictive(anyMeta);
  if (anyMeta.malformed.length && !meta.malformed.length) problems.push(`${label}: robots-style meta has malformed directive(s): ${anyMeta.malformed.join(" | ")}`);
  if (extra.length && !set.has("nofollow") && !set.has("none")) problems.push(`${label}: a robots-style meta adds ${extra.join(", ")}, but the page must stay follow`);
  const header = response.headers.get("x-robots-tag");
  if (header) {
    const parsed = parseRobots([header], { allowAgents: true });
    if (parsed.malformed.length) problems.push(`${label}: X-Robots-Tag "${header}" has malformed directive(s): ${parsed.malformed.join(" | ")}`);
    const blocking = restrictive(parsed);
    if (blocking.length) problems.push(`${label}: X-Robots-Tag "${header}" adds ${blocking.join(", ")}, but the page must stay follow`);
  }
  return problems;
}

function filteredPageProblems(label, expectedOgUrl, response, html) {
  const problems = [];
  if (mediaType(response) !== "text/html") problems.push(`${label}: Content-Type is "${response.headers.get("content-type") ?? "missing"}", expected text/html`);
  const metadata = readPageMetadata(html);
  if (metadata.canonical.length) problems.push(`${label}: a filtered catalog URL must not declare a canonical (found ${metadata.canonical.join(", ")})`);
  problems.push(...noindexFollowProblems(label, response, metadata));
  if (metadata.ogUrl.length !== 1) problems.push(`${label}: expected exactly one <meta property="og:url"> in the initial HTML <head>, found ${metadata.ogUrl.length}`);
  else if (canonicalHttpUrl(metadata.ogUrl[0]) !== new URL(expectedOgUrl).href) problems.push(`${label}: og:url ${metadata.ogUrl[0]} is not the page's own URL ${new URL(expectedOgUrl).href}`);
  return problems;
}

// Empty categories and sold listings stay reachable but must be noindex (follow) with a self canonical.
function noindexFollowPageProblems(label, expectedUrl, response, html) {
  const problems = [];
  if (mediaType(response) !== "text/html") problems.push(`${label}: Content-Type is "${response.headers.get("content-type") ?? "missing"}", expected text/html`);
  const metadata = readPageMetadata(html);
  problems.push(...headMetadataProblems(label, new URL(expectedUrl).href, metadata, "the initial HTML <head>", metadata.outsideHead));
  problems.push(...noindexFollowProblems(label, response, metadata));
  return problems;
}

// Pages are checked as each crawler sees them. Next.js serves Bingbot (an "HTML-limited"
// bot) blocking metadata in <head>, but may stream Googlebot's metadata into <body>.
const CRAWLERS = {
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
};

const MAX_SITEMAP_URLS = 50000;
const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;

async function runSeoSmoke(options) {
  const renderer = options.renderer ?? createBrowserRenderer();
  try {
    return await runChecks({ ...options, renderer });
  } finally {
    if (!options.renderer) await renderer.close();
  }
}

async function runChecks({ base, site = DEFAULT_SITE, crawlers = Object.keys(CRAWLERS), fetchImpl = fetch, log = console.log, renderer, soldListing = null, adminCookie = null, waivers = {} }) {
  const origin = httpOrigin(base, "Base URL");
  const siteOrigin = httpOrigin(site, "Canonical site URL");
  const unknownCrawlers = crawlers.filter((crawler) => !Object.hasOwn(CRAWLERS, crawler));
  if (!crawlers.length || unknownCrawlers.length) throw new SmokeFailure([`Crawlers must be a non-empty subset of ${Object.keys(CRAWLERS).join(", ")} (got ${crawlers.join(", ") || "none"})`]);
  const invalidWaivers = Object.keys(waivers).filter((surface) => !REQUIRED_COVERAGE[surface]?.waivable || !String(waivers[surface] ?? "").trim());
  if (invalidWaivers.length) throw new SmokeFailure([`Only ${Object.keys(REQUIRED_COVERAGE).filter((key) => REQUIRED_COVERAGE[key].waivable).join(", ")} can be waived, each with a reason (got ${invalidWaivers.join(", ")})`]);
  if (soldListing !== null && !/^\/instrumentos\/[^/?#]+$/.test(soldListing)) throw new SmokeFailure([`--sold-listing must be a path like /instrumentos/<slug> (got ${soldListing})`]);
  const get = async (requestPath, crawler = crawlers[0], extraHeaders = {}) => {
    const response = await fetchImpl(`${origin}${requestPath}`, {
      redirect: "manual",
      headers: { "User-Agent": CRAWLERS[crawler] ?? crawler, ...extraHeaders },
      signal: AbortSignal.timeout(20000),
    });
    return { response, html: await response.text() };
  };
  const failures = [];
  const passed = [];
  const coverage = {};
  const cover = (surface, detail) => { coverage[surface] = coverage[surface] ?? { status: "verified", detail }; };
  const uncover = (surface, detail) => { coverage[surface] = { status: "failed", detail }; };
  const unverified = `required surfaces (${REQUIRED_SURFACES.join(", ")}) cannot be sampled`;
  const siteUrl = (path) => new URL(path, `${siteOrigin}/`).href;
  const check = async (label, requestPath, evaluate, crawler = crawlers[0], extraHeaders) => {
    try {
      const { response, html } = await get(requestPath, crawler, extraHeaders);
      const problems = await evaluate(response, html);
      if (problems.length) { failures.push(...problems); return false; }
      passed.push(label);
      log(`PASS ${label}`);
      return true;
    } catch (error) {
      failures.push(`${label}: request failed (${error.message})`);
      return false;
    }
  };
  const statusProblem = (label, response, expected = 200) => (response.status === expected ? [] : [`${label}: HTTP ${response.status}`]);

  // 1. sitemap.xml must load and be a valid sitemap before it can provide samples.
  let samples = {};
  let sitemapUrls = [];
  let sitemapOk = false;
  try {
    const { response, html } = await get("/sitemap.xml");
    if (response.status !== 200) {
      failures.push(`sitemap.xml returned HTTP ${response.status}; ${unverified}`);
    } else if (!["application/xml", "text/xml"].includes(mediaType(response))) {
      failures.push(`sitemap.xml Content-Type is "${response.headers.get("content-type") ?? "missing"}", expected application/xml; ${unverified}`);
    } else if (Buffer.byteLength(html) > MAX_SITEMAP_BYTES) {
      failures.push(`sitemap.xml exceeds ${MAX_SITEMAP_BYTES} bytes; ${unverified}`);
    } else {
      try {
        sitemapUrls = readSitemap(html, siteOrigin);
        if (sitemapUrls.length > MAX_SITEMAP_URLS) throw new XmlError(`${sitemapUrls.length} URLs exceed the ${MAX_SITEMAP_URLS}-URL sitemap limit`);
        samples = sampleSitemap(sitemapUrls);
        sitemapOk = true;
        const missing = REQUIRED_SURFACES.filter((surface) => !samples[surface]);
        if (missing.length) failures.push(`INCOMPLETE COVERAGE: sitemap.xml has no ${missing.join(", ")} sample; required surface(s) not verified: ${missing.join(", ")}`);
        const listedPrivate = sitemapUrls.filter((url) => NOINDEX_PAGES.includes(url.pathname));
        if (listedPrivate.length) failures.push(`sitemap.xml lists noindex page(s): ${listedPrivate.map((url) => url.href).join(", ")}`);
      } catch (error) {
        if (!(error instanceof XmlError)) throw error;
        sitemapUrls = [];
        failures.push(`sitemap.xml is malformed (${error.message}); ${unverified}`);
      }
    }
  } catch (error) {
    if (error instanceof SmokeFailure) throw error;
    failures.push(`sitemap.xml could not be fetched (${error.message}); ${unverified}`);
  }
  const sitemapSet = new Set(sitemapUrls.map((url) => url.href));
  const sitemapCategories = new Set(sitemapUrls.filter((url) => classifyPath(url.pathname) === "category").map((url) => url.pathname));
  const populated = sitemapOk ? CATEGORY_LANDINGS.filter((landing) => sitemapCategories.has(`/instrumentos/${landing.slug}`)) : [];
  const empty = sitemapOk ? CATEGORY_LANDINGS.filter((landing) => !sitemapCategories.has(`/instrumentos/${landing.slug}`)) : [];

  const pages = [
    ...STATIC_PAGES.map((path) => ({ label: path, requestPath: path, expected: siteUrl(path) })),
    ...REQUIRED_SURFACES.filter((surface) => samples[surface]).map((surface) => ({
      label: `${surface} ${samples[surface].href}`,
      requestPath: `${samples[surface].pathname}${samples[surface].search}`,
      expected: samples[surface].href,
    })),
  ];

  // 2. robots.txt must allow every public page and sitemap URL, block the noindex pages and name the sitemap.
  try {
    const { response, html } = await get("/robots.txt");
    if (response.status !== 200) failures.push(`robots.txt returned HTTP ${response.status}`);
    else if (mediaType(response) !== "text/plain") failures.push(`robots.txt Content-Type is "${response.headers.get("content-type") ?? "missing"}", expected text/plain`);
    else {
      const robots = parseRobotsTxt(html);
      const problems = robots.invalid.map((line) => `robots.txt has an unrecognized or invalid line: ${line}`);
      const expectedSitemap = `${siteOrigin}/sitemap.xml`;
      if (!robots.sitemaps.includes(expectedSitemap)) problems.push(`robots.txt does not declare Sitemap: ${expectedSitemap}`);
      const publicPaths = [
        ...pages.map((page) => page.requestPath),
        ...sitemapUrls.map((url) => `${url.pathname}${url.search}`),
        ...CATEGORY_LANDINGS.map((landing) => `/instrumentos/${landing.slug}`),
        ...(soldListing ? [soldListing] : []), // noindex pages must stay crawlable so the noindex is seen
      ];
      for (const agent of ["*", "googlebot"]) {
        const blocked = [...new Set(publicPaths)].filter((path) => !robotsAllows(robots, agent, path));
        if (blocked.length) problems.push(`robots.txt blocks public URL(s) for ${agent}: ${blocked.slice(0, 5).join(", ")}${blocked.length > 5 ? ` (+${blocked.length - 5} more)` : ""}`);
        const crawlable = NOINDEX_PAGES.filter((path) => robotsAllows(robots, agent, path));
        if (crawlable.length) problems.push(`robots.txt allows noindex page(s) for ${agent}: ${crawlable.join(", ")}`);
      }
      if (problems.length) failures.push(...problems);
      else { passed.push("/robots.txt"); log("PASS /robots.txt"); }
    }
  } catch (error) {
    failures.push(`robots.txt: request failed (${error.message})`);
  }

  // 3. Indexable pages: one real <head> canonical/og:url/og:title, equal to the page's own URL, and not noindexed.
  for (const crawler of crawlers) {
    for (const page of pages) {
      const label = `[${crawler}] ${page.label}`;
      await check(label, page.requestPath, async (response, html) => {
        if (response.status !== 200) return [`${label}: HTTP ${response.status}`];
        const render = () => renderer.render(`${origin}${page.requestPath}`, CRAWLERS[crawler]);
        return indexablePageProblems(label, page.expected, response, html, { crawler, render });
      }, crawler);
    }
  }

  // 4. Signup and login: noindex and nofollow in both the header and a real <head> robots meta element.
  for (const crawler of crawlers) {
    for (const path of NOINDEX_PAGES) {
      const label = `[${crawler}] ${path}`;
      await check(label, path, (response, html) => (response.status !== 200 ? [`${label}: HTTP ${response.status}`] : noindexPageProblems(label, response, html)), crawler);
    }
  }

  // 5. Required coverage beyond the representative samples (first crawler only).
  const crawler = crawlers[0];
  const tag = (text) => `[${crawler}] ${text}`;
  const render = (path) => () => renderer.render(`${origin}${path}`, CRAWLERS[crawler]);

  // 5a. Catalog pagination: page 2 canonicalizes to itself, or (single page) redirects to page 1.
  {
    const label = tag("/listados?page=2");
    const ok = await check(label, "/listados?page=2", async (response, html) => {
      if (response.status === 200) return indexablePageProblems(label, siteUrl("/listados?page=2"), response, html, { crawler, render: render("/listados?page=2") });
      // A single-page catalog may redirect, but only to /listados itself (no query, no fragment)
      // on the candidate or the canonical site origin.
      const location = response.headers.get("location");
      let target = null;
      try { target = location ? new URL(location, `${origin}/`) : null; } catch { target = null; }
      const sameSite = target && (target.origin === origin || target.origin === siteOrigin);
      if ([301, 302, 303, 307, 308].includes(response.status) && sameSite && target.pathname === "/listados" && !target.search && !target.hash) return [];
      return [`${label}: expected 200 or a redirect to ${origin}/listados or ${siteOrigin}/listados, got HTTP ${response.status}${location ? ` to ${location}` : ""}`];
    });
    if (ok) cover("catalog-pagination", "page 2 verified"); else uncover("catalog-pagination", "see failures");
  }

  // 5b. Category-only catalog URLs canonicalize to their landing page, for every category.
  let aliasesOk = true;
  for (const landing of CATEGORY_LANDINGS) {
    const path = `/listados?${new URLSearchParams({ category: landing.category })}`;
    const label = tag(path);
    aliasesOk = (await check(label, path, async (response, html) => [
      ...statusProblem(label, response),
      ...(response.status === 200 ? await indexablePageProblems(label, siteUrl(`/instrumentos/${landing.slug}`), response, html, { crawler, render: render(path) }) : []),
    ])) && aliasesOk;
  }
  if (aliasesOk) cover("category-aliases", `${CATEGORY_LANDINGS.length} categories`); else uncover("category-aliases", "see failures");

  // 5c. A filtered catalog URL is noindex, follow, without canonical, and names itself in og:url.
  {
    const category = (populated[0] ?? CATEGORY_LANDINGS[0]).category;
    const path = `/listados?${new URLSearchParams({ category, sort: "price_asc" })}`;
    const label = tag(path);
    const ok = await check(label, path, (response, html) => [...statusProblem(label, response), ...(response.status === 200 ? filteredPageProblems(label, siteUrl(path), response, html) : [])]);
    if (ok) cover("filtered-catalog", path); else uncover("filtered-catalog", "see failures");
  }

  // 5d. Every category landing: populated ones (listed in the sitemap) are indexable with ItemList
  // data; empty ones are noindex. Without a valid sitemap the two cannot be told apart.
  let populatedOk = sitemapOk && populated.length > 0;
  if (!sitemapOk) { uncover("populated-category", "sitemap.xml unavailable"); uncover("empty-category", "sitemap.xml unavailable"); }
  else if (!populated.length) { failures.push("INCOMPLETE COVERAGE: no populated category landing in sitemap.xml; required surface not verified: populated-category"); uncover("populated-category", "no populated category"); }
  for (const landing of populated) {
    const path = `/instrumentos/${landing.slug}`;
    const label = tag(`populated category ${path}`);
    // The sampled category's metadata was verified in step 3; the others are verified here.
    const sampled = samples.category?.pathname === path && !samples.category.search;
    populatedOk = (await check(label, path, async (response, html) => response.status !== 200 ? [`${label}: HTTP ${response.status}`] : [
      ...(sampled ? [] : await indexablePageProblems(label, siteUrl(path), response, html, { crawler, render: render(path) })),
      ...structuredDataProblems(label, "category", siteUrl(path), html, { sitemap: sitemapSet }),
    ])) && populatedOk;
  }
  if (populatedOk) cover("populated-category", `${populated.length} populated`); else if (populated.length) uncover("populated-category", "see failures");
  let emptyOk = true;
  for (const landing of empty) {
    const path = `/instrumentos/${landing.slug}`;
    const label = tag(`empty category ${path}`);
    emptyOk = (await check(label, path, (response, html) => response.status !== 200 ? [`${label}: HTTP ${response.status}`] : [
      ...noindexFollowPageProblems(label, siteUrl(path), response, html),
      ...structuredDataProblems(label, "empty-category", siteUrl(path), html),
    ])) && emptyOk;
  }
  if (empty.length) { if (emptyOk) cover("empty-category", `${empty.length} empty`); else uncover("empty-category", "see failures"); }

  // 5e. Sold listing: reachable, noindex, self canonical, SoldOut, absent from the sitemap.
  if (soldListing) {
    const label = tag(`sold listing ${soldListing}`);
    const ok = await check(label, soldListing, (response, html) => response.status !== 200 ? [`${label}: HTTP ${response.status}`] : [
      ...noindexFollowPageProblems(label, siteUrl(soldListing), response, html),
      ...structuredDataProblems(label, "sold-listing", siteUrl(soldListing), html),
      ...(sitemapSet.has(siteUrl(soldListing)) ? [`${label}: a sold listing must not be listed in sitemap.xml`] : []),
    ]);
    if (ok) cover("sold-listing", soldListing); else uncover("sold-listing", "see failures");
  }

  // 5f. Structured data on the home page and the sampled listing and store.
  let structuredOk = true;
  for (const [surface, path, expected] of [
    ["home", "/", siteUrl("/")],
    ...(samples.listing ? [["listing", `${samples.listing.pathname}${samples.listing.search}`, samples.listing.href]] : []),
    // Store JSON-LD always names the store's root page, whichever page the sitemap sampled.
    ...(samples.store ? [["store", `${samples.store.pathname}${samples.store.search}`, new URL(samples.store.pathname, `${siteOrigin}/`).href]] : []),
  ]) {
    const label = tag(`structured data ${surface} ${path}`);
    structuredOk = (await check(label, path, (response, html) => [...statusProblem(label, response), ...structuredDataProblems(label, surface, expected, html)])) && structuredOk;
  }
  if (structuredOk && samples.listing && samples.store) cover("structured-data", "home, listing, store and category JSON-LD");
  else uncover("structured-data", "see failures");

  // 5g. Authenticated Admin record pages server-render real records (Sprint 9 gate: /admin/tiendas 500).
  if (adminCookie) {
    let adminOk = true;
    for (const path of ["/admin/tiendas", "/admin/publicaciones"]) {
      const label = `[admin] ${path}`;
      const browser = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 laria-seo-smoke";
      adminOk = (await check(label, path, (response, html) => {
        if (response.status !== 200) return [`${label}: HTTP ${response.status}${response.headers.get("location") ? ` to ${response.headers.get("location")} (session not accepted?)` : ""}`];
        const problems = [];
        problems.push(...noindexPageProblems(label, response, html));
        if (/id="__next_error__"|Application error: a (server|client)-side exception/.test(html)) problems.push(`${label}: the page rendered a Next.js error`);
        if (/No pudimos cargar esta sección administrativa/.test(html)) problems.push(`${label}: the Admin section reported a load error`);
        const records = parseHtmlElements(html).filter((element) => element.name === "a" && (element.attributes.get("href") ?? "").startsWith("/admin/auditoria/")).length;
        if (!records) problems.push(`${label}: no Admin record was rendered (expected at least one record card with an audit link)`);
        return problems;
      }, browser, { Cookie: adminCookie })) && adminOk;
    }
    if (adminOk) cover("admin-records", "/admin/tiendas, /admin/publicaciones"); else uncover("admin-records", "see failures");
  }

  // Coverage summary: every required surface is verified, or explicitly waived when data-dependent.
  for (const [surface, rule] of Object.entries(REQUIRED_COVERAGE)) {
    const state = coverage[surface];
    if (state?.status === "verified") continue;
    if (state?.status === "failed") continue; // its failures are already listed
    if (rule.waivable && waivers[surface]) { coverage[surface] = { status: "waived", detail: waivers[surface] }; log(`WAIVED ${surface}: ${waivers[surface]}`); continue; }
    coverage[surface] = { status: "missing", detail: rule.how ?? "not exercised" };
    failures.push(`INCOMPLETE COVERAGE: ${surface} was not verified${rule.how ? ` (${rule.how}${rule.waivable ? `, or waive it with --waive=${surface}:<reason>` : ""})` : ""}`);
  }
  for (const surface of Object.keys(waivers)) {
    if (coverage[surface]?.status === "verified") log(`NOTE ${surface} was verified; its waiver was not needed`);
  }

  if (failures.length) throw Object.assign(new SmokeFailure(failures), { coverage });
  return { samples, passed, coverage };
}

module.exports = {
  runSeoSmoke,
  parseXml,
  readSitemap,
  validateSitemapXml,
  sampleSitemap,
  classifyPath,
  parseHtmlElements,
  readPageMetadata,
  parseRobots,
  robotsDirectives,
  parseRobotsTxt,
  robotsAllows,
  normalizeRobotsPath,
  parseLinkHeader,
  decodeHtml,
  isW3cDatetime,
  RenderUnavailable,
  canonicalHttpUrl,
  linkHeaderCanonicals,
  SmokeFailure,
  XmlError,
  REQUIRED_SURFACES,
  REQUIRED_COVERAGE,
  CATEGORY_LANDINGS,
  DEFAULT_SITE,
  CRAWLERS,
  readJsonLd,
  structuredDataProblems,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const base = args.find((arg) => !arg.startsWith("--")) ?? process.env.LARIA_SMOKE_BASE_URL;
  const site = option("site") ?? process.env.LARIA_SMOKE_SITE_URL ?? DEFAULT_SITE;
  const crawlers = (option("crawlers") ?? Object.keys(CRAWLERS).join(",")).split(",").filter(Boolean);
  const soldListing = option("sold-listing") ?? process.env.LARIA_SMOKE_SOLD_LISTING ?? null;
  // The Admin session is a secret: read it from the environment or a file, never from argv.
  const cookieFile = option("admin-cookie-file");
  const adminCookie = (cookieFile ? require("node:fs").readFileSync(cookieFile, "utf8") : process.env.LARIA_SMOKE_ADMIN_COOKIE ?? "").trim() || null;
  const waivers = {};
  for (const arg of args.filter((value) => value.startsWith("--waive="))) {
    const [surface, ...reason] = arg.slice(8).split(":");
    waivers[surface] = reason.join(":").trim();
  }
  runSeoSmoke({ base, site, crawlers, soldListing, adminCookie, waivers })
    .then(({ samples, coverage }) => {
      for (const [surface, state] of Object.entries(coverage)) console.log(`COVERAGE ${surface}: ${state.status} (${state.detail})`);
      console.log(`SEO smoke PASS (category ${samples.category.href}, listing ${samples.listing.href}, store ${samples.store.href})`);
    })
    .catch((error) => {
      for (const [surface, state] of Object.entries(error.coverage ?? {})) console.error(`COVERAGE ${surface}: ${state.status} (${state.detail})`);
      console.error(error.message);
      process.exit(1);
    });
}
