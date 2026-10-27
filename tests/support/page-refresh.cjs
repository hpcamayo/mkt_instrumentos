// The public pages are cached, and the refresh job clears them every minute (launch audit A19, vercel.json's cron). An
// end-to-end test that changes what a page shows outside the app's own routes (a database call, Admin's review
// function) runs the job itself, as that minute's cron would, until the page shows the change. CRON_SECRET comes from
// .env.local, where scripts/acceptance/full-stack.sh writes a new one on every run.
const { setTimeout: sleep } = require("node:timers/promises");

async function refreshPublicPages(base) {
  const response = await fetch(`${base}/api/internal/public-pages/refresh`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  if (response.status !== 200) throw new Error(`the page refresh job answered ${response.status}`);
}

// The page's HTML once `shows` accepts it, running the job between tries.
async function pageOnceRefreshed(base, path, shows, what) {
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) {
      await refreshPublicPages(base);
      await sleep(1500);
    }
    const response = await fetch(`${base}${path}`);
    last = String(response.status);
    const html = await response.text();
    if (response.status === 200 && shows(html)) return html;
  }
  throw new Error(`${path} never showed ${what} (last answer ${last})`);
}

module.exports = { refreshPublicPages, pageOnceRefreshed };
