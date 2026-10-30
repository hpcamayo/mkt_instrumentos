"use strict";
const d = require("./d-helpers.cjs");
const INV = "/mi-cuenta/tienda/inventario";
module.exports = [{
  id: "EASE-604",
  run: async (t) => {
    const { owner } = d.inventoryStore({ name: `Depura ${t.tag().slice(-4)}` });
    const three = d.sku(owner, { merchant_sku: `DBG-${t.tag().slice(-5).toUpperCase()}`, product_name: "Afinador" }, 3);
    const page = await t.page({ as: owner.email });
    await t.goto(page, `${INV}?q=${three.merchant_sku}`);
    await page.getByRole("button", { name: `Registrar venta de 1 unidad de ${three.merchant_sku}` }).click();
    await page.mouse.move(5, 5);
    for (let n = 0; n < 14; n += 1) {
      const text = await page.locator("main").innerText().then((s) => (/Deshacer[^\n]*/.exec(s) || ["(none)"])[0]).catch(() => "?");
      const focus = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120));
      t.note(`${n}s: ${text} | focus ${focus}`);
      await t.sleep(1000);
    }
  },
}];
