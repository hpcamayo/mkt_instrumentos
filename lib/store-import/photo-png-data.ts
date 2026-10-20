// Whether a PNG's image data is all there (Codex re-check R3; photo-check.ts walks the chunks first). The IDAT chunks,
// joined, are one zlib stream; it must inflate to exactly the bytes IHDR implies (one filter-type byte, then the packed
// samples, for every row of every pass), every row must start with a filter type a decoder knows (libpng stops at any
// other), the deflate data must reach its final block, and the stream must end with the zlib checksum of what it
// inflated to. libpng fails without that checksum ("Not enough image data") and usually with a wrong one, and so does
// Pillow; browsers may skip it, but no encoder writes a wrong one.
//
// Stricter than libpng: more data than the rows need (libpng warns), and anything after the checksum, which must be
// the last four bytes of the image data (libpng warns, or ignores it in a later IDAT). Not noticed, as fflate reads
// neither: bytes between the end of the deflate data and the checksum, and the inverted copy of a stored block's
// length (zlib refuses a wrong one; the data itself must still be whole and match the checksum).
//
// Bounds: the caller checks the 8000 px limit first, so the stream may produce at most 8000 × (1 + 8000 × 8) bytes
// (about 512 MB for 16-bit RGBA, the largest case; reading all of it takes about 2 s). It is inflated 4 KB of
// compressed data at a time (about 4 MB of output at most per step, at deflate's 1032:1 ceiling), each step is only
// counted, checksummed and its row starts read, nothing is kept, and inflating stops at the first byte past the
// expected size.
import { Inflate } from "fflate";

export type PngImage = { width: number; height: number; bitDepth: number; colorType: number; interlaced: boolean };

// Samples per pixel by colour type: grey, -, RGB, palette index, grey + alpha, -, RGBA.
const CHANNELS = [1, 0, 3, 1, 2, 0, 4];
// Adam7 passes: first column, first row, column step, row step.
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
const STEP = 4096;

// Thrown from the inflate callback to stop early; any other error from fflate means broken deflate data.
class Stop extends Error {}

export function pngImageDataComplete(data: Uint8Array, image: PngImage, idat: [start: number, end: number][]): boolean {
  const rows = rowRuns(image);
  const expected = rows.reduce((total, run) => total + run.bytes * run.count, 0);
  const pieces = idat.filter(([start, end]) => end > start);
  const byteAt = (index: number) => {
    for (const [start, end] of pieces) {
      if (index < end - start) return data[start + index];
      index -= end - start;
    }
    return -1;
  };
  // zlib header: deflate with a window of at most 32 KB, no preset dictionary, and its check bits.
  const cmf = byteAt(0);
  const flg = byteAt(1);
  if (cmf < 0 || flg < 0 || (cmf & 0x0f) !== 8 || cmf >> 4 > 7 || flg & 0x20 || ((cmf << 8) | flg) % 31) return false;

  let produced = 0;
  let run = 0;
  let rowsLeft = rows[0]?.count ?? 0;
  let inRow = 0;
  // Adler-32, its two sums reduced at least every 5552 bytes as zlib does (they stay exact well within 2^53).
  let sum = 1;
  let sumOfSums = 0;
  const inflater = new Inflate((chunk: Uint8Array) => {
    produced += chunk.length;
    if (produced > expected) throw new Stop();
    let a = sum;
    let b = sumOfSums;
    for (let index = 0; index < chunk.length;) {
      const stop = Math.min(index + 5552, chunk.length);
      for (; index < stop; index += 1) {
        a += chunk[index];
        b += a;
      }
      a %= 65521;
      b %= 65521;
    }
    sum = a;
    sumOfSums = b;
    for (let index = 0; index < chunk.length;) {
      if (inRow === 0 && chunk[index] > 4) throw new Stop();
      const take = Math.min(rows[run].bytes - inRow, chunk.length - index);
      index += take;
      inRow += take;
      if (inRow === rows[run].bytes) {
        inRow = 0;
        rowsLeft -= 1;
        if (rowsLeft === 0) {
          run += 1;
          rowsLeft = rows[run]?.count ?? 0;
        }
      }
    }
  });
  // The deflate data: everything between the two header bytes and the checksum. The last step is marked final, so
  // data that ends before its final block is an error rather than a pause.
  const total = pieces.reduce((length, [start, end]) => length + end - start, 0);
  if (total < 2 + 4 + 1) return false;
  try {
    let before = 0;
    for (const [start, end] of pieces) {
      const from = start + Math.max(0, 2 - before);
      const to = Math.min(end, start + total - 4 - before);
      before += end - start;
      for (let offset = from; offset < to; offset += STEP) {
        const stop = Math.min(offset + STEP, to);
        inflater.push(data.subarray(offset, stop), stop === to && before >= total - 4);
      }
    }
  } catch {
    return false;
  }
  const checksum = ((byteAt(total - 4) << 24) | (byteAt(total - 3) << 16) | (byteAt(total - 2) << 8) | byteAt(total - 1)) >>> 0;
  return produced === expected && checksum === ((sumOfSums << 16) | sum) >>> 0;
}

// The rows of the image data in order: one run per pass (a single pass without interlacing), each row a filter-type
// byte and its packed samples. A pass with no pixels has no rows at all.
function rowRuns({ width, height, bitDepth, colorType, interlaced }: PngImage) {
  const bitsPerPixel = CHANNELS[colorType] * bitDepth;
  const passes = interlaced ? ADAM7 : [[0, 0, 1, 1]];
  return passes
    .map(([x0, y0, dx, dy]) => {
      const columns = width > x0 ? Math.ceil((width - x0) / dx) : 0;
      const count = height > y0 ? Math.ceil((height - y0) / dy) : 0;
      return { bytes: 1 + Math.ceil((columns * bitsPerPixel) / 8), count: columns ? count : 0 };
    })
    .filter((run) => run.count > 0);
}
