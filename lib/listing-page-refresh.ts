// Launch audit A19: listing pages are cached for up to a minute. After a change made straight from the browser (the
// bulk actions in "Mis publicaciones", the pending actions, Admin's decisions), this asks the server to drop the cached
// copies (app/api/listings/refresh/route.ts), so the change shows at once. Best effort: it never throws, and when the
// call fails the pages catch up within the minute. keepalive lets it finish while the page navigates away.
export function refreshListingPages(target: { listings?: string[]; revisions?: string[] }) {
  return fetch("/api/listings/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(target),
    keepalive: true,
  }).then(() => undefined, () => undefined);
}
