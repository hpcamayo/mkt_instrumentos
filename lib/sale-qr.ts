// The QR the Mostrador shows after a sale (reach-11). One small wrapper so the counter code doesn't care where the
// encoder lives: the store-floor batch is adding lib/labels/qr.ts with qrModules(text): boolean[][] for its labels.
// When that lands, saleQrModules becomes `return qrModules(text)` and everything below goes (FD-deal-trust-5).
//
// Until then this is a plain QR Model 2 encoder, byte mode, error correction level M, versions 1 to 10 (up to 213
// bytes; a counter purchase link is about 70), cut down from Project Nayuki's QR Code generator library
// (https://www.nayuki.io/page/qr-code-generator-library). tests/deal-trust.test.cjs reads every code back with a
// separate decoder: the published format and version words, the fixed patterns, a zero Reed-Solomon syndrome for each
// block and the text itself, for every mask and version.
//
// Copyright (c) Project Nayuki. (MIT License)
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to the following conditions:
// - The above copyright notice and this permission notice shall be included in all copies or substantial portions of
//   the Software.
// - The Software is provided "as is", without warranty of any kind, express or implied, including but not limited to
//   the warranties of merchantability, fitness for a particular purpose and noninfringement. In no event shall the
//   authors or copyright holders be liable for any claim, damages or other liability, whether in an action of
//   contract, tort or otherwise, arising from, out of or in connection with the Software or the use or other dealings
//   in the Software.

// ECC level M per version: [error correction codewords per block, blocks].
const ECC_M: Array<[number, number]> = [
  [0, 0],
  [10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4], [18, 4], [22, 4], [22, 5], [26, 5],
];
const ALIGNMENT: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];
const MAX_VERSION = 10;

export class SaleQrTooLong extends Error {}

export function saleQrModules(text: string, forcedMask?: number): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const data = dataCodewords(bytes, version);
    if (data) return build(version, data, forcedMask);
  }
  throw new SaleQrTooLong("El enlace es demasiado largo para el código.");
}

function totalCodewords(version: number) {
  // Raw modules minus function patterns, as whole codewords (ISO/IEC 18004 table 1).
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    modules -= (25 * align - 10) * align - 55;
    if (version >= 7) modules -= 36;
  }
  return Math.floor(modules / 8);
}

function dataCapacity(version: number) {
  const [ecc, blocks] = ECC_M[version];
  return totalCodewords(version) - ecc * blocks;
}

function dataCodewords(bytes: Uint8Array, version: number): number[] | null {
  const capacityBits = dataCapacity(version) * 8;
  const countBits = version <= 9 ? 8 : 16;
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, countBits);
  for (const byte of bytes) push(byte, 8);
  if (bits.length > capacityBits || bytes.length >= 1 << countBits) return null;
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const result: number[] = [];
  for (let index = 0; index < bits.length; index += 8) result.push(bits.slice(index, index + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  for (let pad = 0xec; result.length < capacityBits / 8; pad ^= 0xec ^ 0x11) result.push(pad);
  return result;
}

function build(version: number, data: number[], forcedMask?: number) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    fixed[y][x] = true;
  };

  for (let index = 0; index < size; index += 1) {
    set(6, index, index % 2 === 0);
    set(index, 6, index % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, distance !== 2 && distance !== 4);
      }
    }
  }
  const positions = ALIGNMENT[version];
  const last = positions.length - 1;
  positions.forEach((row, i) => positions.forEach((column, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(column + dx, row + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  drawFormat(set, size, 0);
  if (version >= 7) drawVersion(set, size, version);

  const codewords = withErrorCorrection(data, version);
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (!fixed[y][x] && bit < codewords.length * 8) {
          modules[y][x] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
          bit += 1;
        }
      }
    }
  }

  let mask = forcedMask ?? -1;
  if (mask < 0 || mask > 7) {
    let best = Infinity;
    for (let candidate = 0; candidate < 8; candidate += 1) {
      applyMask(modules, fixed, candidate);
      drawFormat(set, size, candidate);
      const score = penalty(modules);
      if (score < best) {
        best = score;
        mask = candidate;
      }
      applyMask(modules, fixed, candidate);
    }
  }
  applyMask(modules, fixed, mask);
  drawFormat(set, size, mask);
  return modules;
}

function drawFormat(set: (x: number, y: number, dark: boolean) => void, size: number, mask: number) {
  // Level M is 00, so the five data bits are just the mask.
  const data = mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const on = (index: number) => ((bits >>> index) & 1) === 1;
  for (let index = 0; index <= 5; index += 1) set(8, index, on(index));
  set(8, 7, on(6));
  set(8, 8, on(7));
  set(7, 8, on(8));
  for (let index = 9; index < 15; index += 1) set(14 - index, 8, on(index));
  for (let index = 0; index < 8; index += 1) set(size - 1 - index, 8, on(index));
  for (let index = 8; index < 15; index += 1) set(8, size - 15 + index, on(index));
  set(8, size - 8, true);
}

function drawVersion(set: (x: number, y: number, dark: boolean) => void, size: number, version: number) {
  let remainder = version;
  for (let index = 0; index < 12; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  const bits = (version << 12) | remainder;
  for (let index = 0; index < 18; index += 1) {
    const dark = ((bits >>> index) & 1) === 1;
    const a = size - 11 + (index % 3);
    const b = Math.floor(index / 3);
    set(a, b, dark);
    set(b, a, dark);
  }
}

function withErrorCorrection(data: number[], version: number) {
  const [eccLength, blockCount] = ECC_M[version];
  const raw = totalCodewords(version);
  const shortBlocks = blockCount - (raw % blockCount);
  const shortLength = Math.floor(raw / blockCount);
  const divisor = rsDivisor(eccLength);
  const blocks: number[][] = [];
  for (let index = 0, offset = 0; index < blockCount; index += 1) {
    const length = shortLength - eccLength + (index < shortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + length);
    offset += length;
    const ecc = rsRemainder(block, divisor);
    if (index < shortBlocks) block.push(0);
    blocks.push(block.concat(ecc));
  }
  const result: number[] = [];
  for (let index = 0; index < blocks[0].length; index += 1) {
    blocks.forEach((block, blockIndex) => {
      if (index !== shortLength - eccLength || blockIndex >= shortBlocks) result.push(block[index]);
    });
  }
  return result;
}

function rsDivisor(degree: number) {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]) {
  const result = new Array<number>(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] ^= rsMultiply(coefficient, factor);
    });
  }
  return result;
}

function rsMultiply(x: number, y: number) {
  let z = 0;
  for (let index = 7; index >= 0; index -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> index) & 1) * x;
  }
  return z;
}

function applyMask(modules: boolean[][], fixed: boolean[][], mask: number) {
  const size = modules.length;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (fixed[y][x]) continue;
      let invert: boolean;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

// ISO/IEC 18004 §7.8.3: runs, 2×2 blocks, finder-like sequences and the dark share.
function penalty(modules: boolean[][]) {
  const size = modules.length;
  let score = 0;
  const line = (get: (index: number) => boolean) => {
    let run = 1;
    for (let index = 1; index <= size; index += 1) {
      if (index < size && get(index) === get(index - 1)) {
        run += 1;
      } else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    const pattern = [true, false, true, true, true, false, true];
    for (let index = 0; index + 7 <= size; index += 1) {
      if (!pattern.every((dark, offset) => get(index + offset) === dark)) continue;
      const before = index >= 4 && [1, 2, 3, 4].every((offset) => !get(index - offset));
      const after = index + 11 <= size && [7, 8, 9, 10].every((offset) => !get(index + offset));
      if (before) score += 40;
      if (after) score += 40;
    }
  };
  for (let y = 0; y < size; y += 1) line((x) => modules[y][x]);
  for (let x = 0; x < size; x += 1) line((y) => modules[y][x]);
  let dark = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (modules[y][x]) dark += 1;
      if (y + 1 < size && x + 1 < size) {
        const color = modules[y][x];
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) score += 3;
      }
    }
  }
  const total = size * size;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return score;
}
