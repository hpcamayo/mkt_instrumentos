const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getLocationStock } = require('../lib/store-locations-server.ts');

// Behaves like PostgREST: a requested range may still be capped by max_rows, while count reports the full match.
function stockApi(rows, { cap = 1000, failFrom = -1, emptyFrom = -1 } = {}) {
  const calls = [];
  return { calls, from() {
    let store, ids, range = [0, 999], exact = false;
    const query = {
      select(_columns, options) { exact = options?.count === 'exact'; return query; },
      eq(_key, value) { store = value; return query; },
      in(_key, value) { ids = value; return query; },
      order() { return query; },
      range(from, to) { range = [from, to]; return query; },
      then(resolve) {
        const match = rows.filter(row => row.store_id === store && (!ids || ids.includes(row.item_id)))
          .sort((a,b) => a.item_id.localeCompare(b.item_id) || a.location_id.localeCompare(b.location_id));
        calls.push({ from: range[0], ids, exact });
        resolve({
          data: range[0] === emptyFrom ? [] : match.slice(range[0], range[0] + Math.min(cap, range[1] - range[0] + 1))
            .map(row => ({ item_id: row.item_id, location_id: row.location_id, quantity_on_hand: row.quantity_on_hand })),
          error: range[0] === failFrom ? { message: 'Read failed' } : null,
          count: exact ? match.length : null,
        });
      },
    }; return query;
  } };
}
const ids = Array.from({ length: 200 }, (_,i) => `item-${String(i).padStart(3,'0')}`);
const rows = ids.flatMap(item_id => Array.from({ length: 6 }, (_,i) => ({ store_id:'ours',item_id,location_id:`location-${i}`,quantity_on_hand:1 })));

test('location stock retains all 1,200 rows for 200 items across six locations', async () => {
  const api = stockApi([...rows, { store_id:'other',item_id:ids[0],location_id:'foreign',quantity_on_hand:999 }]);
  const result = await getLocationStock(api,'ours',ids);
  assert.equal(result.length,1200);
  assert.equal(new Set(result.map(row => `${row.item_id}:${row.location_id}`)).size,1200);
  assert.ok(result.every(row=>row.quantity_on_hand===1));
  assert.deepEqual(api.calls.map(call=>call.from),[0,1000]);
});

test('location stock follows the count when the API caps pages below the requested size', async () => {
  const api=stockApi(rows,{cap:300});
  assert.equal((await getLocationStock(api,'ours',null)).length,1200);
  assert.deepEqual(api.calls.map(call=>call.from),[0,300,600,900]);
  assert.equal(api.calls.filter(call=>call.exact).length,1);
});

test('location stock refuses incomplete reads instead of exporting missing rows as zero', async () => {
  assert.equal(await getLocationStock(stockApi(rows,{failFrom:1000}),'ours',ids),null);
  assert.equal(await getLocationStock(stockApi(rows,{emptyFrom:1000}),'ours',ids),null);
  assert.deepEqual(await getLocationStock(stockApi(rows),'ours',[]),[]);
});
