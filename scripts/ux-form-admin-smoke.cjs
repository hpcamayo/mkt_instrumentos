#!/usr/bin/env node
// Local-only form-error and Admin master-detail regression. No browser mutation is allowed.
// Requires the documented local accounts and populated local moderation fixtures.
// LARIA_PLAYWRIGHT_MODULE=<module> LARIA_AXE_PATH=<axe.min.js> \
//   LARIA_UX_BROWSERS=chromium,firefox,webkit node scripts/ux-form-admin-smoke.cjs http://localhost:3108
const fs = require("node:fs"), assert = require("node:assert/strict"), os = require("node:os"), path = require("node:path");
require("node:process").loadEnvFile(".env.local");
const pw = require(process.env.LARIA_PLAYWRIGHT_MODULE || "playwright");
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const target = new URL(process.argv[2] || "http://localhost:3000"), base = target.origin;
assert.ok(localHosts.has(target.hostname), "Local app only.");
assert.ok(localHosts.has(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname), "Local Supabase only.");
const accounts = JSON.parse(fs.readFileSync(process.env.LARIA_UX_ACCOUNTS || ".ux-accounts.local.json"));
const axe = fs.readFileSync(process.env.LARIA_AXE_PATH, "utf8");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "laria-form-admin-"));
const engines = (process.env.LARIA_UX_BROWSERS || "chromium").split(",");
assert.ok(engines.every(e => ["chromium", "firefox", "webkit"].includes(e)));
const report = { checks: [], pages: [], errors: [], blocked: [] };
let browser, engine;
const save = () => fs.writeFileSync(out + "/results.json", JSON.stringify(report, null, 2));
function pass(name, evidence = {}) { report.checks.push({ engine, name, passed: true, ...evidence }); save(); console.log("PASS", engine, name); }
async function session(role, width = 390) {
    const c = await browser.newContext({ viewport: { width, height: 900 }, locale: "es-PE", serviceWorkers: "block", reducedMotion: "reduce" });
    // The explicit local login below is the only write; invalid submissions must not attempt one.
    await c.route("**/*", r => {
        const request = r.request();
        if (localHosts.has(new URL(request.url()).hostname) && ["GET", "HEAD"].includes(request.method()))
            return r.continue();
        report.blocked.push({ method: request.method(), url: request.url() });
        return r.abort("blockedbyclient");
    });
    if (role)
        assert.equal((await c.request.post(base + "/api/auth/login", { data: accounts[role] })).status(), 200);
    const p = await c.newPage();
    p.on("pageerror", e => report.errors.push({ engine, url: p.url(), message: e.message }));
    return [c, p];
}
async function go(p, route) { assert.equal((await p.goto(base + route, { waitUntil: "networkidle" })).status(), 200); await p.locator("h1").waitFor(); }
async function scan(p, name, width) { await p.evaluate(axe); const violations = await p.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))); const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth); report.pages.push({ engine, name, width, violations, overflow }); save(); assert.deepEqual(violations, [], name); assert.equal(overflow, false, name); }
async function invalid(p, form, names) { const writes = []; const listener = r => { if (!['GET', 'HEAD'].includes(r.method()) && !r.url().endsWith('/api/events/session'))
    writes.push(new URL(r.url()).pathname); }; p.on('request', listener); await form.locator('button[type=submit]').click(); const summary = form.locator('[role=alert][aria-labelledby]'); await summary.waitFor(); await p.waitForTimeout(100); assert.ok(await summary.evaluate(e => e === document.activeElement), 'summary takes focus'); const invalidNames = await form.locator('[aria-invalid=true]').evaluateAll(es => es.map(e => e.name)); for (const name of names)
    assert.ok(invalidNames.includes(name), 'inline error ' + name); const links = await summary.locator('a').evaluateAll(es => es.map(e => e.getAttribute('href').slice(1))); assert.ok(links.length >= names.length); for (const id of links) {
    const field = p.locator('[id="' + id + '"]');
    assert.equal(await field.count(), 1, 'one linked field ' + id);
    assert.equal(await field.getAttribute('aria-invalid'), 'true');
    const described = (await field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    assert.ok(described.some(v => v.endsWith('-error')), 'error is described');
    assert.ok(await p.locator('[id="' + described.find(v => v.endsWith('-error')) + '"]').count());
} await summary.locator('a').first().click(); assert.equal(await p.evaluate(() => document.activeElement.id), links[0]); assert.deepEqual(writes, [], 'invalid form must not submit'); p.off('request', listener); }
async function blank(form, names) { for (const name of names) {
    const e = form.locator('[name="' + name + '"]');
    if (await e.evaluate(e => e.tagName) === 'SELECT')
        await e.selectOption('');
    else
        await e.fill('');
} }
(async () => {
    try {
        for (engine of engines) {
            browser = await pw[engine].launch({ headless: true });
            try {
                for (const width of [390, 1440]) {
                    const [c, p] = await session(null, width);
                    for (const [route, names] of [['/login', ['email', 'password']], ['/registro/vendedor', ['fullName', 'email', 'password', 'phone', 'city', 'region', 'acceptedRules']], ['/registro/tienda', ['fullName', 'email', 'password', 'phone', 'city', 'region']], ['/recuperar-contrasena', ['email']], ['/restablecer-contrasena', ['password', 'confirmation']]]) {
                        await go(p, route);
                        const f = p.locator('main form[novalidate]');
                        await invalid(p, f, names);
                        await scan(p, route + ' invalid', width);
                        await p.screenshot({ path: out + '/' + engine + '-' + route.slice(1).replaceAll('/', '-') + '-errors-' + width + '.png', fullPage: true });
                        const first = f.locator('[aria-invalid=true]').first(), name = await first.getAttribute('name');
                        await first.fill(name === 'email' ? 'prueba@laria.test' : name === 'password' ? '12345678' : 'Lucía');
                        assert.notEqual(await f.locator('[name="' + name + '"]').getAttribute('aria-invalid'), 'true', 'field clears on change');
                        pass('invalid ' + route + ' @' + width, { fields: names.length });
                    }
                    await go(p, '/login');
                    await p.locator('main form[novalidate] button[type=submit]').click();
                    await p.getByRole('button', { name: 'Enlace mágico', exact: true }).click();
                    assert.equal(await p.locator('[aria-invalid=true]').count(), 0);
                    assert.equal(await p.locator('input[name=password]').count(), 0);
                    await invalid(p, p.locator('main form[novalidate]'), ['email']);
                    pass('login mode resets errors @' + width);
                    await c.close();
                    for (const role of ['particular', 'store']) {
                        const [c, p] = await session(role, width);
                        await go(p, '/mi-cuenta/perfil');
                        let f = p.locator('main form[novalidate]');
                        await blank(f, ['fullName', 'phone', 'city', 'region']);
                        await invalid(p, f, ['fullName', 'phone', 'city', 'region']);
                        await scan(p, 'profile ' + role, width);
                        pass('profile ' + role + ' @' + width);
                        await go(p, '/registro/' + (role === 'store' ? 'tienda' : 'vendedor') + '/invitacion');
                        f = p.locator('main form[novalidate]');
                        await blank(f, ['fullName', 'phone', 'city', 'region']);
                        await invalid(p, f, ['fullName', 'phone', 'city', 'region']);
                        await scan(p, 'invite ' + role, width);
                        pass('invite ' + role + ' @' + width);
                        if (role === 'store') {
                            await go(p, '/mi-cuenta/tienda');
                            f = p.locator('main form[novalidate]');
                            await blank(f, ['name', 'razon_social', 'ruc', 'email', 'contact_person', 'whatsapp_phone', 'city', 'region', 'address']);
                            await invalid(p, f, ['name', 'razon_social', 'ruc', 'email', 'contact_person', 'whatsapp_phone', 'city', 'region', 'address']);
                            await scan(p, 'store application', width);
                            await p.screenshot({ path: out + '/' + engine + '-store-errors-' + width + '.png', fullPage: true });
                            pass('store required fields @' + width);
                        }
                        else {
                            await go(p, '/mi-cuenta/seguridad');
                            f = p.locator('main form[novalidate]');
                            await f.locator('[name=password]').fill('1234567');
                            await f.locator('[name=confirmation]').fill('mismatch');
                            await invalid(p, f, ['password', 'confirmation']);
                            await scan(p, 'change password', width);
                            pass('password minimum and mismatch @' + width);
                        }
                        await c.close();
                    }
                }
                for (const width of [390, 1440]) {
                    const [c, p] = await session('admin', width);
                    for (const queue of ['publicaciones', 'revisiones', 'tiendas', 'verificacion', 'reportes', 'resenas']) {
                        await go(p, '/admin?cola=' + queue);
                        const buttons = p.locator('[data-queue-item-id]'), count = await buttons.count();
                        if (count) {
                            if (width < 1280) {
                                assert.equal(await p.locator('#moderation-detail').isVisible(), false);
                                await buttons.first().click();
                                assert.ok(await p.locator('#moderation-detail').isVisible());
                                await p.waitForFunction(() => document.activeElement?.tagName === 'H2');
                            }
                            const detail = p.locator('#moderation-detail'), checks = detail.getByRole('checkbox');
                            assert.equal(await checks.count(), 4);
                            await checks.first().check();
                            assert.match(await detail.innerText(), /1 de 4 puntos revisados/);
                            if (count > 1) {
                                await detail.getByRole('button', { name: 'Siguiente pendiente' }).click();
                                assert.match(await detail.innerText(), /0 de 4 puntos revisados/);
                                await p.waitForFunction(() => document.activeElement?.tagName === 'H2');
                            }
                            await scan(p, 'admin ' + queue + ' detail', width);
                            if ([390, 1440].includes(width))
                                await p.screenshot({ path: out + '/' + engine + '-admin-' + queue + '-' + width + '.png', fullPage: true });
                            if (width < 1280) {
                                await detail.getByRole('button', { name: 'Volver a la cola' }).click();
                                assert.equal(await detail.isVisible(), false);
                                await p.waitForFunction(() => document.activeElement?.hasAttribute('data-queue-item-id'));
                            }
                        }
                        else
                            assert.match(await p.locator('main').innerText(), /No hay acciones pendientes/);
                        await scan(p, 'admin ' + queue + ' queue', width);
                        pass('master-detail ' + queue + ' @' + width, { items: count, empty: !count });
                    }
                    await c.close();
                }
            }
            finally {
                await browser.close();
                browser = null;
            }
        }
        assert.deepEqual(report.errors, []);
        console.log(JSON.stringify({ artifacts: out, checks: report.checks.length, pages: report.pages.length }));
    }
    finally {
        if (browser)
            await browser.close();
        save();
    }
})().catch(e => { report.failure = e.stack; save(); console.error(e); console.error("Evidence:", out); process.exitCode = 1; });
