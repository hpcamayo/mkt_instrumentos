// Review fixes for import photos (Codex review of 2026-10-16, item 4). The server-side check walks each format to its
// real end (JPEG segments and scans up to EOI, every PNG chunk with its CRC, every WebP chunk) and refuses anything
// incomplete or appended; the browser ZIP reader inflates in small steps, so a size header that lies cannot make it
// produce more than about 1 MiB before the cap is checked, and entries it skips are not kept in memory. Runs with
// `pnpm test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fflate = require("fflate");
const { zipSync, deflateSync, strToU8 } = fflate;

// What the ZIP reader is handed for each entry, by entry name: total bytes and the largest single step. Watching
// fflate's Unzip from the outside keeps production code free of test hooks.
const inflated = new Map();
const unzippers = [];
const HANDLER = Symbol("onfile");
class WatchedUnzip extends fflate.Unzip {
  constructor(...args) {
    super(...args);
    unzippers.push(this);
  }
  set onfile(handler) {
    this[HANDLER] = handler;
  }
  get onfile() {
    const handler = this[HANDLER];
    return handler && ((file) => {
      const log = { total: 0, largest: 0 };
      inflated.set(file.name, log);
      let ondata;
      Object.defineProperty(file, "ondata", {
        configurable: true,
        get: () => ondata,
        set: (next) => {
          ondata = (error, data, final) => {
            if (data) {
              log.total += data.length;
              log.largest = Math.max(log.largest, data.length);
            }
            next(error, data, final);
          };
        },
      });
      handler(file);
    });
  }
}

const load = Module._load;
Module._load = function stubModules(request, ...rest) {
  if (request === "fflate") return { ...fflate, Unzip: WatchedUnzip };
  return load.call(this, request, ...rest);
};

const { checkPhoto, readHeader } = require("@/lib/store-import/photo-check");
const { readPhotoArchive, PHOTO_MAX_FILE_BYTES } = require("@/lib/store-import/photo-files");

// ------------------------------------------------------------------ fixtures

// Genuine 400 × 400 files written by Pillow 12.3: a baseline JPEG with restart markers and stuffed 0xFF bytes in its
// scan, a progressive JPEG (Huffman tables between its scans), a PNG, a lossy and a lossless simple WebP, an
// extended WebP with alpha (VP8X, ALPH, VP8) and an animated WebP (VP8X, ANIM, ANMF).
const REAL = Object.fromEntries(Object.entries({
  jpegRestart: `
    /9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABsSFBcUERsXFhceHBsgKEIrKCUlKFE6PTBCYFVlZF9VXVtqeJmBanGQc1tdhbWGkJ6jq62rZ4C8ybqm
    x5moq6T/2wBDARweHigjKE4rK06kbl1upKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKT/wAARCAGQAZAD
    ASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKB
    kaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZ
    mqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQF
    BgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5
    OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX
    2Nna4uPk5ebn6Onq8vP09fb3+Pn6/90ABAAI/9oADAMBAAIRAxEAPwB1FFFcB2hRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9B1FFFcB2hR
    RRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9F1FFFcB2hRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9J1FFFcB2hRRRQAUUUUAFFFFABR
    RRQAUUUUAFFFFABRRRQB/9N1FFFcB2hRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9R1FFFcB2hRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABR
    RRQB/9V1FFFcB2hRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9Z1FFFcB2hRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9d1FFFcB2hR
    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
    AFFFFABRRRQAUUUUAFFFFAH/03UUUVgeQFFFFABRRRUy2N8P/FiFFFFYnuhRRRQAUUUUAFFFFABRRRQB/9R1FFFcB2hRRRQAUUUUAFFFFABRRRQA
    UUUUAFFFFABRRRW0djxMX/Gf9dD/1XUUUVgeQFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH/1nUUUVgeQFFFFABRRRQAUUUVMtjfD/xYhRRR
    WJ7oUUUUAFFFFABRRRQB/9d1FFFcB2hRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9B1FFFcsWkjmxNGpKq3FaBRRRT5kYfV6v8AKFFFFHMg
    +r1f5Qoooo5kH1er/KFFFFHMg+r1f5Qoooo5kH1er/KFFFFHMg+r1f5Qoooo5kH1er/Kf//RdRRRXNzI8/6vV/lCiiijmQfV6v8AKFFFFHMg+r1f
    5Qoooo5kH1er/KFFFFJtWNaFCpGom0FFFFZHsBRRRQAUUUUAf//SdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/TdRRRXAdoUUUU
    AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/UdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/VdRRRXAdoUUUUAFFFFABRRRQAUUUU
    AFFFFABRRRQAUUUUAf/WdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/XdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUU
    Af/QdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/RdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/SdRRRXAdoUUUU
    AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/TdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/UdRRRXAdoUUUUAFFFFABRRRQAUUUU
    AFFFFABRRRQAUUUUAf/VdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/WdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUU
    Af/XdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/QdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/RdRRRXAdoUUUU
    AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/SdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/TdRRRXAdoUUUUAFFFFABRRRQAUUUU
    AFFFFABRRRQAUUUUAf/UdRRRXAdoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/VdRRRXAdp/9k=`,
  jpegProgressive: `
    /9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABsSFBcUERsXFhceHBsgKEIrKCUlKFE6PTBCYFVlZF9VXVtqeJmBanGQc1tdhbWGkJ6jq62rZ4C8ybqm
    x5moq6T/2wBDARweHigjKE4rK06kbl1upKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKT/wgARCAGQAZAD
    ASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAEC/8QAGAEBAAMBAAAAAAAAAAAAAAAAAAECBAP/2gAMAwEAAhADEAAAAaM/YAAAAAAAAAAA
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZQmgAAAAAAAAAALBTWAAAAAAAAAAAF8QTyAAAAAAAAAACOgU3AAAAAAAAAAABfEE8gAAAAAAAAAAjoF
    NwAAAAAAAAAAAXxBPIAAAAAAAAAAI6BTcAAAAAAAAAAAF8QTyAAAAAAAAAACOgU3AAAAAAAAAAABfEE8gAAACE0IAAAACOgU3AAAAAAAAAAABfEE
    8gAAEpONK6A5AAAABHQKbgAAAAAAAAAAAviCeQAAAAAAAAAAR0Cm4AAAAAAAAAAAL4gnkAAAAAAAAAAEdApuAAAAAAAAAAAC+IJ5AAAAAAAAAABH
    QKbgAAAAAAAAAAAviCeQAAAAAAAAAAR0Cm4AAAAAAAAAAAL4gnkAAAAAAAAAAEdApuAAAAAAAAAAAC+QFAAAAAAAAAAAWCmwAAAAAAAAAAAAAAAA
    AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
    AAAAAAAAAAAAAAAAAAAAAAAAAAD/xAAUEAEAAAAAAAAAAAAAAAAAAACw/9oACAEBAAEFAhxP/8QAHxEAAAcBAQEBAQAAAAAAAAAAAAECAxMwMlEg
    EXAh/9oACAEDAQE/AfxxxxRK+EJViVYlWJViVYlWJViVYlWJViVYQ4o1fLXd2N6K13djeitd3Y3orXd2N6K13fr56b0Vru/JBayV6b0Vru7G9Fa7
    uxvRWu7sb0Vru7G9Fa7uxvRWuIUav4I1cEauCNXBGrgjVwRq4I1cEauCNXBGrgjVwIQolfjv/8QAGBEAAwEBAAAAAAAAAAAAAAAAAAERMHD/2gAI
    AQIBAT8B44kQhCEIQhCEJqtHqtHqtHqtHqtHqtHqtHqtHqtHqtHqtHqilKUpSlKUvHv/xAAUEAEAAAAAAAAAAAAAAAAAAACw/9oACAEBAAY/AhxP
    /8QAFhABAQEAAAAAAAAAAAAAAAAAoAEx/9oACAEBAAE/IRkzB9//2gAMAwEAAgADAAAAEAwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwgggggggggggQwwwwwwwwwwwwgwwwwwwwwwwwgwwwwwwwwwwwwgwwwwwwwwwwwgwwwwwwwwwwwwgwwwwwwwwwwwgwwwwwwwwwwwwgwwwwwwwww
    wwgwwwwwwwwwwwwgwwwwzgwwwwwgwwwwwwwwwwwwgwww0GQwwwwwgwwwwwwwwwwwwgwwwwwwwwwwwgwwwwwwwwwwwwgwwwwwwwwwwwgwwwwwwwww
    wwwgwwwwwwwwwwwgwwwwwwwwwwwwgwwwwwwwwwwwgwwwwwwwwwwwwgwwwwwwwwwwwgwwwwwwwwwwwwQgggggggggggQwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww
    wwwwwwwwwwwwwwwwwwwwww//xAAgEQABAwQCAwAAAAAAAAAAAAABADFAQWGx8BEhIDBw/9oACAEDAQE/EPjhETpXsK9hXsK9hXsK9hXsK9hXsK9h
    XsIMI9e17aSU9tJKe2klPbSSntp4uiQHJENPbTxLggoZwBDT20kp7aSU9tJKe2klPbSSjEh17EkkkkkMEj47/8QAGhEAAwEBAQEAAAAAAAAAAAAA
    ABEwMQEgcP/aAAgBAgEBPxD45w7wQQQQQQQQQQQ7xzlcUxXFMVxTFcUxXFMVx577xXFMVxTFcUxXFMVxTFeuc4IIIIIIIIIIId7xfHf/xAAbEAEA
    AgMBAQAAAAAAAAAAAAABESEAMVCg8P/aAAgBAQABPxDxLKDC3gyT0HWDElb+vLB6MEjGteMr/9k=`,
  png: `
    iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAIAAAAP3aGbAAAEBElEQVR42u3WMRHAIBREwZBBDDU6UkQOsigQQYWmWPgNBZldCVe8uTRbuQBOcJsA
    ECwAwQIEC0CwAAQLECwAwQIQLECwAAQLQLAAwQIQLADBAgQLQLAABAsQLADBAhAsQLAABAtAsADBAhAsAMECBAtAsADBAhAsAMECBAtAsAAECxAs
    AMECECxAsAAEC0CwAMECECwAwQIEC0CwAAQLECwAwQIQLECwAAQLQLAAwQIQLADBAgQLQLAAwQIQLADBAgQLQLAABAsQLADBAhAsQLAABAtAsADB
    AhAsAMECBAtAsAAECxAsAMECECxAsAAEC0CwAMECECwAwQIEC0CwAMECECwAwQIEC0CwAAQLECwAwQIQLECwAAQLQLCA/8omiHveagR2GH0ZwcMC
    BAtAsAAECxAsAMECECxAsAAEC0CwAMECECwAwQIEC0CwAMECECwAwQIEC0CwAAQLECwAwQIQLECwAAQLQLAAwQIQLADBAgQLQLAABAsQLADBAhAs
    QLAABAtAsADBAhAsQLBMAAgWgGABggUgWACCBQgWgGABCBYgWACCBSBYgGABCBaAYAGCBSBYAIIFCBaAYAEIFiBYAIIFIFiAYAEIFoBgAYIFIFiA
    YAEIFoBgAYIFIFgAggUIFoBgAQgWIFgAggUgWIBgAQgWgGABggUgWACCBQgWgGABCBYgWACCBSBYgGABCBaAYAGCBSBYgGABCBaAYAGCBSBYAIIF
    CBaAYAEIFiBYAIIFIFiAYAEIFoBgAYIFIFgAggUIFoBgAQgWIFgAggUgWIBgAQgWgGABggUgWIBgAQgWgGABggUgWACCBQgWgGABCBYgWACCBSBY
    gGABCBaAYAGCBSBYAIIFCBaAYAEIFiBYAIIFIFiAYAEIFoBgAYIFIFiAYAEIFoBgAYIFIFgAggUIFoBgAQgWIFgAggUgWIBgAQgWgGABggUgWACC
    BQgWgGABCBYgWACCBSBYgGABCBaAYAGCBSBYgGABCBaAYAGCBSBYAIIFCBaAYAEIFiBYAIIFIFiAYAEIFkBMNkHc6MsI4GEBCBYgWACCBSBYgGAB
    CBaAYAGCBSBYAIIFCBaAYAGCBSBYAIIFCBaAYAEIFiBYAIIFIFiAYAEIFoBgAYIFIFgAggUIFoBgAQgWIFgAggUgWIBgAQgWgGABggUgWACCBQgW
    gGABggUgWACCBQgWgGABCBYgWACCBSBYgGABCBaAYAGCBSBYAIIFCBaAYAEIFiBYAIIFIFiAYAEIFoBgAYIFIFgAggUIFoBgAYIFIFgAggUIFoBg
    AQgWIFgAggUgWIBgAQgWgGABggUgWACCBQgWgGABCBYgWACCBSBYgGABCBaAYAGCBSBYAIIFHOUDC44JvjZpYjUAAAAASUVORK5CYII=`,
  webpLossy: `
    UklGRmoCAABXRUJQVlA4IF4CAAAwMACdASqQAZABPzmcy10vLCmkoogB4CcJZ27hdrEHtU+fgKWmPpr4iD6a+Ig+mG1L9sYdhB7al+2MOxTwg9tS
    /bGHYQe2pftpFjDsoeUWei2AvgJU8os9Fr/3l2ee2MOwg9tS/bGHYQe4KbGHYQe2pftjDsIPbUvbQjanYzD7g0ORtTsZiB7S/bGHYQY0LZ50TyMQ
    oE/tjDsIPQPnmY+mr1FdZUv2xh18LauZj6YP1FjDsIPbUpe0JtGPUXj1721L9sYc7w6ocR0JToYwO2pftjCNC2eZj56yzPbGHYQe1mt7AcF09d7s
    nYQe2pfrYxvxZ5lcnlNjDsIPbS39ub5h9py/UWMOwg9tSmBLPjCET97snYQe2pfrZTKdjzMrk8psYdhB7aWQTwjanYzD7g0ORtTseuywg9tS/bkq
    eUWei2AvgJT4v2xh2EHtqX7Yw7CD21L9sYdhB7al+2MOwg9tS/bGHYQe2pftjDsIPbUv2xh2EHtqX7Yw7CD21L9sYdhB7al+2MOwg9tAAP3J/4d6
    W76sP/kdWGtHAARgQcKENCC+hwjIFk5QfoQTVyRG2ZyfwHwta/a/VJ8Pd5EWzfl6p5/Jv2MAx5kTRiNKy7SdWMw8N/W/wzbVpXhRj5xHt30M29Sm
    IKCarHTttKDSr57RgAW39H5Rtu4r5qgALG52xgAsGNqvz6ooBc/3rMB68oF16VWAvr9hCeu6hx4r78R+UopQ7F7J1uNmNWtsyeGexNzKqaCZmgDr
    xtW0wmbOl7njJv/pR3PbWwHYs53t4TSgQKEEOMILqIRIIPUIAAA=`,
  webpLossless: `
    UklGRigAAABXRUJQVlA4TBwAAAAvj8FjAAdQiirUo/8BAEX6/58i+p/63//+97+I`,
  webpAlpha: `
    UklGRs4CAABXRUJQVlA4WAoAAAAQAAAAjwEAjwEAQUxQSCcAAAABD/DQ/4iIoCYAIUgD/dtpYrW7J6L/E+D3fycTcb3/3n+b0vu/SgEAVlA4IIAC
    AAAwMACdASqQAZABPzmcy10vLCmkoogB4CcJZ27hdrEC9C+fgKWmPpr4iD6a+Ig+mG1L9sYdhB7al+2MOxTwg9tS/bGHYQe2pftpFjDsoeUWei2A
    vgJU8os9Fr/3l2ee2MOwg9tS/bGHYQe4KbGHYQe2pftjDsIPbUvbQjanYzD7g0ORtTsZiB7S/bGHYQY0LZ50TyMQoE/tjDsIPQPnmY+mr1FdZUv2
    xh18LauZj6YP1FjDsIPbUpe0JtGPUXj1721L9sYc7w6ocR0JToYwO2pftjCNC2eZj56yzPbGHYQe1mt7AcF09d7snYQe2pfrYxvxZ5lcnlNjDsIP
    bS39ub5h9py/UWMOwg9tSmBLPjCET97snYQe2pfrZTKdjzMrk8psYdhB7aWQI4QanYzD7g0ORtTseuywg9tS/bkqeUWei2AvgJT4v2xh2EHtqX7Y
    w7CD21L9sYdhB7al+2MOwg9tS/bGHYQe2pftjDsIPbUv2xh2EHtqX7Yw7CD21L9sYdhB7al+2MOwg9tAAP3J/4d6W7mI3/Wu7126AALx2YEEAhAo
    nuIdDKMUDdiBE1w/a9nJ+un1yL9r9Unvx3MTLN+PnVv8m/YuAmys/pV0dPS5bw5pcLqtWMoaonERzS4XVaXBBNCmEHY94sJzqi/mOr6BZ0jH+IwM
    SjAnHRcpFR5urGzkIdAs4sQPmEQhUKYS/LHwMtbQQ1UuMJu9Thd3gMYNAsU/+gE5BZxtUZj0j5lJMmEvPgbnuchDVAXIpWdpOWZNKIE5ZbaEglIm
    Tf/SjvCKa6LdX7L6g27RetuN2zg5GgjrWQvjzcrFUqGk5RFm8sQABSxA7YgV0QO2IFdEAAAA`,
  webpAnimated: `
    UklGRoQAAABXRUJQVlA4WAoAAAACAAAAjwEAjwEAQU5JTQYAAAAAAAAAAABBTk1GKAAAAAAAAAAAAI8BAI8BAGQAAAJWUDhMDwAAAC+PwWMABxD9
    j/4HIqL/AQBBTk1GKAAAAAAAAAAAAI8BAI8BAGQAAABWUDhMDwAAAC+PwWMABxDR//4HIqL/AQA=`,
}).map(([name, text]) => [name, Buffer.from(text.replace(/\s+/g, ""), "base64")]));

const check = (bytes) => checkPhoto(new Uint8Array(bytes));
const code = (bytes) => check(bytes).code;

// Segments of a JPEG up to and including its first scan header: { marker, start (at the 0xFF), end }.
function jpegSegments(bytes) {
  const segments = [];
  for (let offset = 2; offset < bytes.length;) {
    const end = offset + 2 + bytes.readUInt16BE(offset + 2);
    segments.push({ marker: bytes[offset + 1], start: offset, end });
    if (bytes[offset + 1] === 0xda) break;
    offset = end;
  }
  return segments;
}

function jpegSegment(marker, payload) {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

const afterSoi = (bytes, ...inserted) => Buffer.concat([bytes.subarray(0, 2), ...inserted, bytes.subarray(2)]);

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), Buffer.from(data)]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Chunks of a PNG: { type, start, end, data } with end after the CRC.
function pngChunks(bytes) {
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    chunks.push({ type: bytes.toString("latin1", offset + 4, offset + 8), start: offset, end: offset + 12 + length, data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const rawChunk = (bytes, chunk) => bytes.subarray(chunk.start, chunk.end);

function webpChunk(type, data) {
  const head = Buffer.alloc(8);
  head.write(type, 0, "latin1");
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(data.length & 1)]);
}

function webpFile(...chunks) {
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), ...chunks]);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

// Chunks of a WebP: { type, start, end (after any pad byte), data }.
function webpChunks(bytes) {
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size & 1);
    chunks.push({ type: bytes.toString("latin1", offset, offset + 4), start: offset, end, data: bytes.subarray(offset + 8, offset + 8 + size) });
    offset = end;
  }
  return chunks;
}

function vp8x(width, height, flags = 0) {
  const data = Buffer.alloc(10);
  data[0] = flags;
  data.writeUIntLE(width - 1, 4, 3);
  data.writeUIntLE(height - 1, 7, 3);
  return webpChunk("VP8X", data);
}

function withRiffSize(bytes, size) {
  const copy = Buffer.from(bytes);
  copy.writeUInt32LE(size, 4);
  return copy;
}

const smallZip = () => Buffer.from(zipSync({ "payload.txt": strToU8("contenido escondido después de la imagen") }));

// ------------------------------------------------------------------ server-side check: complete files only

test("real JPEG, PNG and WebP files pass, including progressive JPEG and extended WebP with alpha", () => {
  const cases = [
    ["jpegRestart", "image/jpeg"],
    ["jpegProgressive", "image/jpeg"],
    ["png", "image/png"],
    ["webpLossy", "image/webp"],
    ["webpLossless", "image/webp"],
    ["webpAlpha", "image/webp"],
  ];
  for (const [name, mime] of cases) {
    const result = check(REAL[name]);
    assert.equal(result.ok, true, name);
    assert.equal(result.mime_type, mime, name);
    assert.equal(result.width, 400, name);
    assert.equal(result.height, 400, name);
  }
});

test("a JPEG cut right after its frame header, or inside its scan, is refused", () => {
  // Codex's 15-byte case: SOI and a frame header, nothing else.
  const codex = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x03, 0xe8, 0x03, 0xe8, 0x01, 0x01, 0x11, 0x00]);
  assert.equal(code(codex), "PHOTO_NOT_IMAGE", "SOI + SOF only");
  for (const name of ["jpegRestart", "jpegProgressive"]) {
    const bytes = REAL[name];
    const frame = jpegSegments(bytes).find((segment) => segment.marker === 0xc0 || segment.marker === 0xc2);
    assert.equal(code(bytes.subarray(0, frame.end)), "PHOTO_NOT_IMAGE", `${name}: cut after SOF`);
    assert.equal(code(bytes.subarray(0, bytes.length - 100)), "PHOTO_NOT_IMAGE", `${name}: cut inside a scan`);
    assert.equal(code(bytes.subarray(0, bytes.length - 1)), "PHOTO_NOT_IMAGE", `${name}: half an EOI`);
  }
});

test("a JPEG that ends in EOI without a scan, or with an empty scan, is refused", () => {
  const bytes = REAL.jpegRestart;
  const scan = jpegSegments(bytes).find((segment) => segment.marker === 0xda);
  const eoi = Buffer.from([0xff, 0xd9]);
  assert.equal(code(Buffer.concat([bytes.subarray(0, scan.start), eoi])), "PHOTO_NOT_IMAGE", "tables and frame, then EOI");
  assert.equal(code(Buffer.concat([bytes.subarray(0, scan.end), eoi])), "PHOTO_NOT_IMAGE", "scan header, then EOI");
});

test("a real JPEG with anything after EOI is refused, a ZIP included", () => {
  assert.equal(code(Buffer.concat([REAL.jpegRestart, smallZip()])), "PHOTO_NOT_IMAGE");
  assert.equal(code(Buffer.concat([REAL.jpegProgressive, Buffer.from([0, 0])])), "PHOTO_NOT_IMAGE", "even padding");
  assert.equal(code(Buffer.concat([REAL.jpegRestart, REAL.jpegRestart])), "PHOTO_NOT_IMAGE", "a second image");
});

test("a JPEG with a marker no decoder accepts outside its scans is refused", () => {
  assert.equal(code(afterSoi(REAL.jpegRestart, jpegSegment(0x02, Buffer.alloc(8)))), "PHOTO_NOT_IMAGE", "reserved marker");
  assert.equal(code(afterSoi(REAL.jpegRestart, jpegSegment(0xf7, Buffer.alloc(8)))), "PHOTO_NOT_IMAGE", "JPEG-LS frame");
  assert.equal(code(afterSoi(REAL.jpegRestart, Buffer.from([0xff, 0xd8]))), "PHOTO_NOT_IMAGE", "a second SOI");
  const frame = jpegSegments(REAL.jpegRestart).find((segment) => segment.marker === 0xc0);
  const twoFrames = afterSoi(REAL.jpegRestart, REAL.jpegRestart.subarray(frame.start, frame.end));
  assert.equal(code(twoFrames), "PHOTO_NOT_IMAGE", "two frame headers");
  // Fill bytes before a marker and a comment segment are fine.
  assert.equal(check(afterSoi(REAL.jpegRestart, Buffer.from([0xff, 0xff]), jpegSegment(0xfe, Buffer.from("Laria")))).ok, true);
});

test("a PNG that ends in IEND but whose chunk walk or CRC is broken is refused", () => {
  const bytes = REAL.png;
  const chunks = pngChunks(bytes);
  const idat = chunks.find((chunk) => chunk.type === "IDAT");

  const longer = Buffer.from(bytes);
  longer.writeUInt32BE(idat.data.length + 3, idat.start);
  assert.equal(code(longer), "PHOTO_NOT_IMAGE", "IDAT length off by three");

  const flipped = Buffer.from(bytes);
  flipped[idat.start + 8 + 10] ^= 0xff;
  assert.equal(code(flipped), "PHOTO_NOT_IMAGE", "IDAT data does not match its CRC");

  const ihdr = rawChunk(bytes, chunks[0]);
  const iend = rawChunk(bytes, chunks[chunks.length - 1]);
  assert.equal(code(Buffer.concat([PNG_SIGNATURE, ihdr, iend])), "PHOTO_NOT_IMAGE", "no IDAT");
  assert.equal(code(Buffer.concat([PNG_SIGNATURE, ihdr, pngChunk("CRIT", Buffer.from("x")), rawChunk(bytes, idat), iend])),
    "PHOTO_NOT_IMAGE", "unknown critical chunk");
  const split = [pngChunk("IDAT", idat.data.subarray(0, 500)), pngChunk("IDAT", idat.data.subarray(500))];
  assert.equal(code(Buffer.concat([PNG_SIGNATURE, ihdr, split[0], pngChunk("tEXt", Buffer.from("Comment\0Laria")), split[1], iend])),
    "PHOTO_NOT_IMAGE", "IDAT chunks not consecutive");

  // Several IDAT chunks in a row and ancillary chunks are normal.
  assert.equal(check(Buffer.concat([PNG_SIGNATURE, ihdr, pngChunk("tEXt", Buffer.from("Comment\0Laria")), ...split, iend])).ok, true);

  // A palette image needs its PLTE before the image data.
  const paletteHeader = Buffer.from(chunks[0].data);
  paletteHeader[9] = 3;
  const palette = pngChunk("PLTE", Buffer.alloc(6, 0x80));
  assert.equal(code(Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", paletteHeader), ...split, iend])), "PHOTO_NOT_IMAGE", "palette missing");
  assert.equal(check(Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", paletteHeader), palette, ...split, iend])).ok, true);
});

test("a PNG with anything after its IEND is refused, even data that ends like an IEND", () => {
  const iend = rawChunk(REAL.png, pngChunks(REAL.png).pop());
  assert.equal(code(Buffer.concat([REAL.png, smallZip(), iend])), "PHOTO_NOT_IMAGE");
  assert.equal(code(Buffer.concat([REAL.png, Buffer.from("x")])), "PHOTO_NOT_IMAGE");
});

test("a WebP that is only a VP8X header is refused", () => {
  assert.equal(code(webpFile(vp8x(900, 900))), "PHOTO_NOT_IMAGE");
  assert.equal(code(webpFile(vp8x(400, 400), webpChunk("EXIF", Buffer.alloc(20)))), "PHOTO_NOT_IMAGE", "metadata but no image");
});

test("a WebP whose RIFF or chunk sizes do not match the file is refused", () => {
  const bytes = REAL.webpLossy;
  assert.equal(code(withRiffSize(bytes, bytes.length - 8 + 2)), "PHOTO_NOT_IMAGE", "RIFF size too large");
  assert.equal(code(Buffer.concat([bytes, Buffer.from("PK")])), "PHOTO_NOT_IMAGE", "bytes beyond the RIFF size");
  const [image] = webpChunks(bytes);
  const longer = Buffer.from(bytes);
  longer.writeUInt32LE(image.data.length + 100, image.start + 4);
  assert.equal(code(longer), "PHOTO_NOT_IMAGE", "image chunk runs past the end");
});

test("a WebP with bytes after its image is refused, even inside the RIFF size", () => {
  const [image] = webpChunks(REAL.webpLossy);
  const raw = rawChunk(REAL.webpLossy, image);
  assert.equal(code(webpFile(raw, Buffer.from("PK\x03\x04 sobra"))), "PHOTO_NOT_IMAGE", "loose bytes");
  assert.equal(code(webpFile(raw, webpChunk("ZIPX", smallZip()))), "PHOTO_NOT_IMAGE", "a second chunk in a simple file");
  assert.equal(code(webpFile(raw, raw)), "PHOTO_NOT_IMAGE", "two images");
});

test("an animated WebP is refused and a VP8X canvas must match its image", () => {
  assert.equal(code(REAL.webpAnimated), "PHOTO_NOT_IMAGE", "animation");
  const chunks = webpChunks(REAL.webpAlpha);
  const header = Buffer.from(chunks[0].data);
  header.writeUIntLE(499, 4, 3);
  const rest = chunks.slice(1).map((chunk) => rawChunk(REAL.webpAlpha, chunk));
  assert.equal(code(webpFile(webpChunk("VP8X", header), ...rest)), "PHOTO_NOT_IMAGE", "canvas 500 wide, image 400");
  assert.equal(check(webpFile(rawChunk(REAL.webpAlpha, chunks[0]), ...rest)).ok, true, "rebuilt unchanged");
});

test("markup inside an otherwise complete image is still suspicious", () => {
  assert.equal(code(afterSoi(REAL.jpegRestart, jpegSegment(0xfe, Buffer.from("<script>alert(1)</script>")))), "PHOTO_SUSPICIOUS");
  const chunks = pngChunks(REAL.png);
  const text = pngChunk("tEXt", Buffer.from("Comment\0<html><body>hola</body></html>"));
  const parts = [PNG_SIGNATURE, rawChunk(REAL.png, chunks[0]), text, ...chunks.slice(1).map((chunk) => rawChunk(REAL.png, chunk))];
  assert.equal(code(Buffer.concat(parts)), "PHOTO_SUSPICIOUS");
});

test("damaged copies of real files never throw and never pass with impossible values", () => {
  let seed = 0x5eed;
  const random = (limit) => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed % limit;
  };
  const names = Object.keys(REAL);
  for (let round = 0; round < 3000; round += 1) {
    let bytes = Buffer.from(REAL[names[round % names.length]]);
    for (let change = 0, changes = 1 + random(4); change < changes; change += 1) {
      const kind = random(4);
      if (kind === 0) bytes[random(bytes.length)] = random(256);
      else if (kind === 1) bytes[random(bytes.length)] = 0xff;
      else if (kind === 2) bytes = bytes.subarray(0, random(bytes.length + 1));
      else bytes = Buffer.concat([bytes, bytes.subarray(random(bytes.length))]);
    }
    let result;
    assert.doesNotThrow(() => { result = checkPhoto(new Uint8Array(bytes)); readHeader(new Uint8Array(bytes)); });
    if (result.ok) {
      assert.ok(["image/jpeg", "image/png", "image/webp"].includes(result.mime_type));
      assert.ok(result.width >= 400 && result.width <= 8000 && result.height >= 400 && result.height <= 8000);
    }
  }
});

// ------------------------------------------------------------------ browser ZIP reader: bounded inflating

// How far past its cap an entry may get: the last slice (1 KiB at deflate's ~1:1032 ceiling) or one stored deflate
// block (64 KiB). No single step may produce more than the cap itself.
const OVERSHOOT = 1032 * 1024 + 64 * 1024;

function streamOf(bytes, chunk = 64 * 1024) {
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunk) controller.enqueue(bytes.subarray(offset, offset + chunk));
      controller.close();
    },
  });
}

async function readArchive(bytes, remaining) {
  inflated.clear();
  const photos = [];
  const result = await readPhotoArchive(streamOf(bytes), { remaining, onPhoto: async (photo) => { photos.push(photo); } });
  return { ...result, photos, names: photos.map((photo) => photo.name) };
}

// Rewrites the uncompressed size of one entry in its local header and in the central directory, as a hostile archive
// would, leaving everything else (compressed size included) intact.
function understateSize(zip, name, size) {
  const bytes = Buffer.from(zip);
  for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
    const signature = bytes.readUInt32LE(offset);
    if (signature === 0x04034b50 && bytes.toString("latin1", offset + 30, offset + 30 + bytes.readUInt16LE(offset + 26)) === name) {
      bytes.writeUInt32LE(size, offset + 22);
    }
    if (signature === 0x02014b50 && bytes.toString("latin1", offset + 46, offset + 46 + bytes.readUInt16LE(offset + 28)) === name) {
      bytes.writeUInt32LE(size, offset + 24);
    }
  }
  return bytes;
}

// A deflate ZIP whose entries use a data descriptor (flag bit 3): the local header carries no CRC and no sizes, the
// way macOS and streaming zippers write them.
function zipWithDescriptors(entries) {
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const [name, data] of Object.entries(entries)) {
    const body = Buffer.from(deflateSync(data, { level: 9 }));
    const crc = crc32(data);
    const nameBytes = Buffer.from(name, "latin1");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0008, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(nameBytes.length, 26);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(body.length, 8);
    descriptor.writeUInt32LE(data.length, 12);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x0008, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(body.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt32LE(offset, 42);
    parts.push(local, nameBytes, body, descriptor);
    directory.push(record, nameBytes);
    offset += local.length + nameBytes.length + body.length + descriptor.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, central, end]);
}

test("a ZIP entry whose header understates its size stops at the cap while inflating", async () => {
  const zip = understateSize(zipSync({
    "bomba__01.jpg": [new Uint8Array(40 * 1024 * 1024), { level: 9 }],
    "ok__01.jpg": new Uint8Array(REAL.jpegRestart),
  }), "bomba__01.jpg", 1000);
  assert.ok(zip.length < 64 * 1024, "the whole bomb fits in one read");
  const result = await readArchive(zip);
  assert.deepEqual(result.skipped, [{ name: "bomba__01.jpg", reason: "too_large" }]);
  assert.deepEqual(result.names, ["ok__01.jpg"]);
  assert.deepEqual(Buffer.from(result.photos[0].data), REAL.jpegRestart, "the next entry still reads intact");
  const bomb = inflated.get("bomba__01.jpg");
  assert.ok(bomb.largest <= PHOTO_MAX_FILE_BYTES, `largest step ${bomb.largest} bytes`);
  assert.ok(bomb.total <= PHOTO_MAX_FILE_BYTES + OVERSHOOT, `inflated ${bomb.total} bytes before stopping`);
});

test("an entry with a data descriptor (no sizes in its header) is capped the same way", async () => {
  const zip = zipWithDescriptors({ "bomba__01.jpg": new Uint8Array(40 * 1024 * 1024), "ok__01.jpg": REAL.jpegProgressive });
  const result = await readArchive(zip);
  assert.deepEqual(result.skipped, [{ name: "bomba__01.jpg", reason: "too_large" }]);
  assert.deepEqual(result.names, ["ok__01.jpg"]);
  assert.deepEqual(Buffer.from(result.photos[0].data), REAL.jpegProgressive);
  const bomb = inflated.get("bomba__01.jpg");
  assert.ok(bomb.largest <= PHOTO_MAX_FILE_BYTES, `largest step ${bomb.largest} bytes`);
  assert.ok(bomb.total <= PHOTO_MAX_FILE_BYTES + OVERSHOOT, `inflated ${bomb.total} bytes before stopping`);
  // Honest descriptor entries read normally.
  const honest = await readArchive(zipWithDescriptors({ "a__01.png": REAL.png, "b__01.webp": REAL.webpAlpha }));
  assert.deepEqual(honest.names, ["a__01.png", "b__01.webp"]);
  assert.equal(checkPhoto(honest.photos[1].data).ok, true);
});

test("entries the reader skips are not kept in memory", async () => {
  const zip = zipSync({
    "fotos/video.mp4": [new Uint8Array(8 * 1024 * 1024).fill(7), { level: 0 }],
    "fotos/grande__01.jpg": [new Uint8Array(6 * 1024 * 1024), { level: 9 }],
    "fotos/.oculto.jpg": [new Uint8Array(1024 * 1024).fill(1), { level: 0 }],
    "fotos/a__01.jpg": new Uint8Array(REAL.jpegRestart),
    "fotos/b__01.jpg": [new Uint8Array(REAL.jpegProgressive), { level: 0 }],
  });
  const result = await readArchive(zip, 1);
  assert.deepEqual(result.names, ["a__01.jpg"]);
  assert.deepEqual(result.skipped.map((item) => item.reason), ["not_image", "too_large", "over_limit"]);
  // fflate 0.8.2 keeps the bytes of every entry that is never started in Unzip#k until the reader is dropped.
  const unzipper = unzippers[unzippers.length - 1];
  assert.ok(Array.isArray(unzipper.k), "fflate's internal buffer moved; update this check");
  const held = unzipper.k.reduce((sum, chunks) => sum + chunks.reduce((total, chunk) => total + chunk.length, 0), 0);
  assert.ok(held < 64 * 1024, `the reader still holds ${held} bytes of skipped entries`);
  assert.equal(inflated.get("fotos/grande__01.jpg").total, 0, "a skipped entry is never inflated");
});

test("honest photos come through byte for byte in small steps", async () => {
  const entries = {
    "a__01.jpg": new Uint8Array(REAL.jpegRestart),
    "a__02.jpg": [new Uint8Array(REAL.jpegProgressive), { level: 0 }],
    "b__01.png": new Uint8Array(REAL.png),
    "c__01.webp": new Uint8Array(REAL.webpLossy),
  };
  const result = await readArchive(Buffer.from(zipSync(entries)));
  assert.deepEqual(result.names, Object.keys(entries));
  for (const photo of result.photos) {
    const source = entries[photo.name];
    assert.deepEqual(Buffer.from(photo.data), Buffer.from(Array.isArray(source) ? source[0] : source), photo.name);
  }
});
