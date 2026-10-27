import { connection } from "next/server";

// Launch audit A19: a cached page never stores a failed read. At run time such a page throws, so the cache keeps
// serving the last good copy and tries again at the next rebuild. During `next build` there is no good copy yet, and
// throwing would fail the deploy, so the page gives up being prerendered instead: this deployment renders it on each
// request, as before A19, until a later deploy caches it again.
export async function renderPerRequestIfBuilding(page: string) {
  if (process.env.NEXT_PHASE !== "phase-production-build") return;
  console.warn("cached-page-read-failed-during-build", page);
  await connection();
}
