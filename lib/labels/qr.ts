// A small QR Code encoder for labels and posters (reach-10), with no dependency: byte mode, error correction level M
// (about 15% of the code can be damaged or covered), versions 1 to 10 (up to 213 bytes, enough for any Laria URL).
// deal-trust's Mostrador sale QR imports it too. Follows ISO/IEC 18004; the mask is the one with the lowest penalty.

// Per version (index 0 = version 1): total codewords, error-correction codewords per block, and number of blocks.
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ALIGNMENT = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
export const QR_MAX_BYTES = 213;

function dataCodewords(version: number) {
  return TOTAL_CODEWORDS[version - 1] - ECC_PER_BLOCK[version - 1] * BLOCKS[version - 1];
}

// GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
function gfMultiply(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number) {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]) {
  const result = new Array<number>(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, i) => { result[i] ^= gfMultiply(coefficient, factor); });
  }
  return result;
}

function utf8(text: string) {
  return Array.from(new TextEncoder().encode(text));
}

// Mode, length, data, terminator and padding, then the error correction, interleaved block by block.
function codewords(bytes: number[], version: number) {
  const capacity = dataCodewords(version);
  const bits: number[] = [];
  const push = (value: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((byte) => push(byte, 8));
  push(0, Math.min(4, capacity * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  for (let pad = 0xec; data.length < capacity; pad ^= 0xec ^ 0x11) data.push(pad);

  const blocks = BLOCKS[version - 1];
  const eccLength = ECC_PER_BLOCK[version - 1];
  const total = TOTAL_CODEWORDS[version - 1];
  const shortBlocks = blocks - (total % blocks);
  const shortLength = Math.floor(total / blocks);
  const divisor = rsDivisor(eccLength);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const block = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1));
    k += block.length;
    const ecc = rsRemainder(block, divisor);
    if (i < shortBlocks) block.push(0);
    all.push(block.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < all[0].length; i++) {
    all.forEach((block, j) => {
      if (i !== shortLength - eccLength || j >= shortBlocks) result.push(block[i]);
    });
  }
  return result;
}

const MASKS: ((row: number, col: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

class Grid {
  readonly size: number;
  readonly dark: boolean[][];
  readonly fixed: boolean[][];

  constructor(readonly version: number) {
    this.size = version * 4 + 17;
    this.dark = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.fixed = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  set(x: number, y: number, dark: boolean) {
    this.dark[y][x] = dark;
    this.fixed[y][x] = true;
  }

  drawPatterns() {
    const { size } = this;
    for (let i = 0; i < size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          if (x >= 0 && x < size && y >= 0 && y < size) this.set(x, y, distance !== 2 && distance !== 4);
        }
      }
    }
    const positions = ALIGNMENT[this.version - 1];
    const last = positions.length - 1;
    positions.forEach((x, i) => positions.forEach((y, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }));
    this.drawFormat(0);
    if (this.version >= 7) {
      let remainder = this.version;
      for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
      const bits = (this.version << 12) | remainder;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) === 1;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.set(a, b, dark);
        this.set(b, a, dark);
      }
    }
  }

  // Level M has the format bits 00.
  drawFormat(mask: number) {
    const { size } = this;
    const data = mask;
    let remainder = data;
    for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    const bits = ((data << 10) | remainder) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bit(i));
    this.set(8, size - 8, true);
  }

  drawData(data: number[]) {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < size; vertical++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vertical : vertical;
          if (!this.fixed[y][x] && i < data.length * 8) {
            this.dark[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.fixed[y][x] && MASKS[mask](y, x)) this.dark[y][x] = !this.dark[y][x];
      }
    }
  }

  // The four penalty rules of the standard: long runs, 2×2 blocks, finder-like patterns and dark/light balance.
  penalty() {
    const { size, dark } = this;
    let score = 0;
    const lines: boolean[][] = [];
    for (let i = 0; i < size; i++) {
      lines.push(dark[i]);
      lines.push(dark.map((row) => row[i]));
    }
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) { run++; continue; }
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
      const text = line.map((module) => (module ? "1" : "0")).join("");
      for (let at = text.indexOf("1011101"); at >= 0; at = text.indexOf("1011101", at + 1)) {
        const before = text.slice(Math.max(0, at - 4), at);
        const after = text.slice(at + 7, at + 11);
        if ((at >= 4 && before === "0000") || (at + 11 <= size && after === "0000")) score += 40;
      }
    }
    let darkCount = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (dark[y][x]) darkCount++;
        if (x < size - 1 && y < size - 1) {
          const color = dark[y][x];
          if (dark[y][x + 1] === color && dark[y + 1][x] === color && dark[y + 1][x + 1] === color) score += 3;
        }
      }
    }
    score += Math.floor(Math.abs((darkCount * 100) / (size * size) - 50) / 5) * 10;
    return score;
  }
}

// The smallest version that holds the text, or null when it does not fit (over 213 bytes).
export function qrVersionFor(text: string) {
  const length = utf8(text).length;
  for (let version = 1; version <= 10; version++) {
    const headerBits = 4 + (version < 10 ? 8 : 16);
    if (Math.floor((dataCodewords(version) * 8 - headerBits) / 8) >= length) return version;
  }
  return null;
}

// The modules of the QR code for the text, row by row (true = dark), without the quiet zone: leave four modules of
// white around it when drawing. Throws when the text does not fit.
export function qrModules(text: string): boolean[][] {
  const version = qrVersionFor(text);
  if (!version) throw new Error(`QR_TOO_LONG: up to ${QR_MAX_BYTES} bytes`);
  const data = codewords(utf8(text), version);
  let best: { grid: Grid; score: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const grid = new Grid(version);
    grid.drawPatterns();
    grid.drawData(data);
    grid.applyMask(mask);
    grid.drawFormat(mask);
    const score = grid.penalty();
    if (!best || score < best.score) best = { grid, score };
  }
  return (best as { grid: Grid }).grid.dark.map((row) => row.slice());
}

// One SVG path ("M x y h1 v1 h-1 z" per dark module, merged along rows), in module units with the quiet zone added:
// draw it in a viewBox of `0 0 size size` with shape-rendering="crispEdges".
export function qrSvgPath(modules: boolean[][], quiet = 4) {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) { x++; continue; }
      let end = x;
      while (end < row.length && row[end]) end++;
      parts.push(`M${x + quiet} ${y + quiet}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  });
  return { path: parts.join(""), size: modules.length + quiet * 2 };
}
