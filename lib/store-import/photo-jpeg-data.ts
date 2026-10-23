// Whether a JPEG's entropy-coded data is all there (Codex re-check R3; photo-check.ts walks the marker segments first).
// Every scan is decoded block by block, as libjpeg reads it: Huffman codes, the extra bits after them, end-of-band runs
// and the correction bits of progressive refinement, restart markers in order. A scan that needs a bit its data does
// not have is incomplete; libjpeg would fill the rest with grey and only warn. So is one that meets a code no table
// defines: only damage produces one, and libjpeg-turbo reads it as zero, often without a warning. Pixels are never
// reconstructed: no dequantizing, no inverse DCT, no colour conversion.
//
// Accepted: Huffman-coded baseline, extended sequential and progressive frames with 8-bit samples, the kinds browsers
// display. Every component must be coded (in some scan of a sequential frame; with at least its DC in a progressive
// one, as libjpeg's encoder requires, since a progressive file may stop refining early).
//
// Bounds: the caller checks the 8000 px limit first. Decoding moves forward through at most 5 MB of data; a run of
// empty blocks in a first AC scan is skipped in one step, so the only work not tied to data read is one check per
// block in a refinement scan's runs, and a frame may have at most 100 scans (real encoders write about 10; 100
// refinement scans over an 8000 × 8000 image take about 0.7 s). Memory: one copy of the scan data without stuffing,
// and, for progressive frames, which coefficients are non-zero (8 bytes per block, 1,000,000 blocks for an
// 8000 × 8000 component).

export type JpegSegment = { marker: number; start: number; end: number; scanEnd: number };

const MAX_SCANS = 100;

type Table = { maxcode: Int32Array; offset: Int32Array; values: Uint8Array; lookup: Uint16Array; dc: boolean };
type Component = { id: number; h: number; v: number; quant: number; blocksWide: number; blocksHigh: number };

export function jpegScansComplete(data: Uint8Array, segments: JpegSegment[]): boolean {
  const tables: (Table | null)[] = [null, null, null, null, null, null, null, null]; // DC 0–3, AC 0–3
  const quantDefined = [false, false, false, false];
  let restartInterval = 0;
  let frame: { progressive: boolean; components: Component[]; mcusWide: number; mcusHigh: number } | null = null;
  let scans = 0;
  let singleScan = false;
  const coded = new Set<number>();
  const history: (Uint32Array | null)[] = [null, null, null, null];
  const reader = new BitReader(new Uint8Array(data.length));

  for (const segment of segments) {
    const { marker, start, end } = segment;
    if (marker === 0xc4) {
      if (!readHuffmanTables(data, start, end, tables)) return false;
    } else if (marker === 0xdb) {
      if (!readQuantTables(data, start, end, quantDefined)) return false;
    } else if (marker === 0xdd) {
      if (end - start !== 2) return false;
      restartInterval = (data[start] << 8) | data[start + 1];
    } else if (marker >= 0xc0 && marker <= 0xcf) {
      frame = readFrame(data, start, marker);
      if (!frame) return false;
    } else if (marker === 0xda) {
      scans += 1;
      if (!frame || scans > MAX_SCANS) return false;
      const scan = readScanHeader(data, start, frame.components);
      if (!scan) return false;
      // A sequential frame whose first scan codes every component is a single-scan image: libjpeg stops at a second
      // scan ("expected EOI").
      if (!frame.progressive && scans === 1) singleScan = scan.components.length === frame.components.length;
      else if (singleScan) return false;
      if (scan.components.some((component) => !quantDefined[component.quant])) return false;
      if (!reader.load(data, end, segment.scanEnd)) return false;
      const walk = frame.progressive
        ? walkProgressiveScan(reader, frame, scan, tables, restartInterval, history)
        : walkSequentialScan(reader, frame, scan, tables, restartInterval);
      if (!walk) return false;
      for (const component of scan.components) {
        if (!frame.progressive || (scan.ss === 0 && scan.ah === 0)) coded.add(component.id);
      }
    }
  }
  return !!frame && frame.components.every((component) => coded.has(component.id));
}

// ------------------------------------------------------------------ segments

// DHT: one or more tables, each a class and slot byte, 16 counts and the symbols, filling the segment exactly.
function readHuffmanTables(data: Uint8Array, start: number, end: number, tables: (Table | null)[]) {
  let offset = start;
  while (offset < end) {
    if (offset + 17 > end) return false;
    const slot = data[offset];
    if ((slot & 0xec) !== 0) return false; // class 0 or 1, slot 0–3
    const counts = data.subarray(offset + 1, offset + 17);
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total > 256 || offset + 17 + total > end) return false;
    const table = buildTable(counts, data.subarray(offset + 17, offset + 17 + total));
    if (!table) return false;
    tables[(slot >> 4) * 4 + (slot & 3)] = table;
    offset += 17 + total;
  }
  return true;
}

// Canonical codes in order of length, as libjpeg builds them. A table that would need the all-ones code of a length
// is refused, as libjpeg refuses it; one whose symbols are all at most 15 can serve as a DC table.
function buildTable(counts: Uint8Array, values: Uint8Array): Table | null {
  const maxcode = new Int32Array(18).fill(-1);
  const offset = new Int32Array(17);
  const lookup = new Uint16Array(512);
  let code = 0;
  let index = 0;
  for (let length = 1; length <= 16; length += 1) {
    const count = counts[length - 1];
    offset[length] = index - code;
    for (let left = count; left > 0; left -= 1) {
      if (length <= 9) {
        const first = code << (9 - length);
        lookup.fill((length << 8) | values[index], first, first + (1 << (9 - length)));
      }
      code += 1;
      index += 1;
    }
    if (count) {
      maxcode[length] = code - 1;
      if (code >= 1 << length) return null;
    }
    code <<= 1;
  }
  return { maxcode, offset, values, lookup, dc: values.every((value) => value <= 15) };
}

// DQT: one or more tables of 64 entries, two bytes each when the precision nibble is not 0, filling the segment.
function readQuantTables(data: Uint8Array, start: number, end: number, defined: boolean[]) {
  let offset = start;
  while (offset < end) {
    const size = 1 + (data[offset] >> 4 ? 128 : 64);
    const slot = data[offset] & 0x0f;
    if (slot > 3 || offset + size > end) return false;
    defined[slot] = true;
    offset += size;
  }
  return true;
}

// SOF0 (baseline), SOF1 (extended sequential) or SOF2 (progressive), Huffman-coded with 8-bit samples; components
// with sampling factors 1–4 that divide the largest ones (libjpeg cannot upsample by fractions).
function readFrame(data: Uint8Array, start: number, marker: number) {
  if (marker > 0xc2 || data[start] !== 8) return null;
  const height = (data[start + 1] << 8) | data[start + 2];
  const width = (data[start + 3] << 8) | data[start + 4];
  const count = data[start + 5];
  const raw = Array.from({ length: count }, (_, index) => {
    const at = start + 6 + 3 * index;
    return { id: data[at], h: data[at + 1] >> 4, v: data[at + 1] & 0x0f, quant: data[at + 2] };
  });
  if (raw.some((component) => component.h < 1 || component.h > 4 || component.v < 1 || component.v > 4 || component.quant > 3)) {
    return null;
  }
  const hMax = Math.max(...raw.map((component) => component.h));
  const vMax = Math.max(...raw.map((component) => component.v));
  if (raw.some((component) => hMax % component.h || vMax % component.v)) return null;
  const components = raw.map((component) => ({
    ...component,
    blocksWide: Math.ceil((width * component.h) / (8 * hMax)),
    blocksHigh: Math.ceil((height * component.v) / (8 * vMax)),
  }));
  return { progressive: marker === 0xc2, components, mcusWide: Math.ceil(width / (8 * hMax)), mcusHigh: Math.ceil(height / (8 * vMax)) };
}

type Scan = { components: (Component & { dc: number; ac: number; index: number })[]; ss: number; se: number; ah: number; al: number };

// SOS, matched to the frame as libjpeg-turbo matches it: the selector in position i names the first frame component
// with that id among positions i and later, never one already in the scan. An interleaved scan has at most 10 blocks
// per MCU.
function readScanHeader(data: Uint8Array, start: number, frame: Component[]): Scan | null {
  const count = data[start];
  const components: Scan["components"] = [];
  for (let index = 0; index < count; index += 1) {
    const selector = data[start + 1 + 2 * index];
    const tables = data[start + 2 + 2 * index];
    let position = -1;
    for (let at = index; at < Math.min(frame.length, 4) && position < 0; at += 1) {
      if (frame[at].id === selector) position = at;
    }
    if (position < 0 || components.some((used) => used.index === position) || tables >> 4 > 3 || (tables & 0x0f) > 3) {
      return null;
    }
    components.push({ ...frame[position], dc: tables >> 4, ac: tables & 0x0f, index: position });
  }
  if (count > 1 && components.reduce((blocks, component) => blocks + component.h * component.v, 0) > 10) return null;
  const at = start + 1 + 2 * count;
  return { components, ss: data[at], se: data[at + 1], ah: data[at + 2] >> 4, al: data[at + 2] & 0x0f };
}

// ------------------------------------------------------------------ entropy-coded data

// The scan's data with byte stuffing removed (0xFF 0x00 is a 0xFF byte; extra 0xFF before a marker is fill), split
// at its restart markers. Reads bits most significant first, never past the end of the current interval.
class BitReader {
  private bytes: Uint8Array;
  private starts: number[] = [];
  private markers: number[] = [];
  private interval = 0;
  private position = 0;
  private end = 0;
  private buffer = 0;
  private count = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  load(data: Uint8Array, from: number, to: number) {
    const { bytes } = this;
    let length = 0;
    this.starts = [0];
    this.markers = [-1];
    for (let index = from; index < to;) {
      const byte = data[index];
      if (byte !== 0xff) {
        bytes[length++] = byte;
        index += 1;
        continue;
      }
      let next = index + 1;
      while (next < to && data[next] === 0xff) next += 1;
      if (next >= to) return false;
      if (data[next] === 0x00) {
        bytes[length++] = 0xff;
      } else if (data[next] >= 0xd0 && data[next] <= 0xd7) {
        this.starts.push(length);
        this.markers.push(data[next] - 0xd0);
      } else {
        return false;
      }
      index = next + 1;
    }
    this.starts.push(length);
    this.select(0);
    return true;
  }

  // Moves to the next restart interval, whose marker must be RSTn with n = (interval - 1) mod 8. Unused bytes left in
  // the current interval are dropped, as libjpeg drops them.
  restart(interval: number) {
    if (interval >= this.starts.length - 1 || this.markers[interval] !== (interval - 1) % 8) return false;
    this.select(interval);
    return true;
  }

  private select(interval: number) {
    this.interval = interval;
    this.position = this.starts[interval];
    this.end = this.starts[interval + 1];
    this.buffer = 0;
    this.count = 0;
  }

  private fill() {
    while (this.count <= 16 && this.position < this.end) {
      this.buffer = (this.buffer << 8) | this.bytes[this.position++];
      this.count += 8;
    }
  }

  // The next `length` bits (at most 16), or -1 when the interval ends first.
  bits(length: number) {
    if (this.count < length) {
      this.fill();
      if (this.count < length) return -1;
    }
    this.count -= length;
    const value = (this.buffer >>> this.count) & ((1 << length) - 1);
    this.buffer &= (1 << this.count) - 1;
    return value;
  }

  // The next symbol of a table: -1 when the interval ends first, -2 for a code the table does not have.
  symbol(table: Table) {
    if (this.count < 16) this.fill();
    let code = 0;
    let length = 1;
    if (this.count >= 9) {
      const entry = table.lookup[(this.buffer >>> (this.count - 9)) & 511];
      if (entry) {
        this.count -= entry >> 8;
        this.buffer &= (1 << this.count) - 1;
        return entry & 0xff;
      }
      code = this.bits(9);
      length = 10;
    }
    for (; length <= 16; length += 1) {
      const bit = this.bits(1);
      if (bit < 0) return -1;
      code = (code << 1) | bit;
      if (code <= table.maxcode[length]) return table.values[table.offset[length] + code];
    }
    return -2;
  }
}

// ------------------------------------------------------------------ sequential frames

function walkSequentialScan(reader: BitReader, frame: NonNullable<ReturnType<typeof readFrame>>, scan: Scan, tables: (Table | null)[], restartInterval: number) {
  const parts = scan.components.map((component) => ({ component, dc: tables[component.dc], ac: tables[4 + component.ac] }));
  if (parts.some((part) => !part.dc || !part.ac || !part.dc.dc)) return false;
  const single = parts.length === 1;
  const mcus = single ? parts[0].component.blocksWide * parts[0].component.blocksHigh : frame.mcusWide * frame.mcusHigh;
  for (let mcu = 0; mcu < mcus; mcu += 1) {
    if (restartInterval && mcu && mcu % restartInterval === 0 && !reader.restart(mcu / restartInterval)) return false;
    for (const { component, dc, ac } of parts) {
      for (let block = single ? 1 : component.h * component.v; block > 0; block -= 1) {
        if (!sequentialBlock(reader, dc as Table, ac as Table)) return false;
      }
    }
  }
  return true;
}

// DC difference (category, then that many bits) and AC run/size pairs up to end-of-block or the 63rd coefficient.
function sequentialBlock(reader: BitReader, dc: Table, ac: Table) {
  const category = reader.symbol(dc);
  if (category < 0 || (category && reader.bits(category) < 0)) return false;
  for (let k = 1; k < 64; k += 1) {
    const symbol = reader.symbol(ac);
    if (symbol < 0) return false;
    const run = symbol >> 4;
    const size = symbol & 15;
    if (size) {
      k += run;
      if (reader.bits(size) < 0) return false;
    } else if (run === 15) {
      k += 15;
    } else {
      break;
    }
  }
  return true;
}

// ------------------------------------------------------------------ progressive frames

// The scan parameters libjpeg rejects outright: a DC band is coefficient 0 only, an AC band has one component and
// stays within 1–63, a refinement lowers the point transform by exactly one, and the point transform is at most 13.
function walkProgressiveScan(
  reader: BitReader,
  frame: NonNullable<ReturnType<typeof readFrame>>,
  scan: Scan,
  tables: (Table | null)[],
  restartInterval: number,
  history: (Uint32Array | null)[],
) {
  const { ss, se, ah, al } = scan;
  const dcBand = ss === 0;
  if (dcBand ? se !== 0 : ss > se || se > 63 || scan.components.length !== 1) return false;
  if ((ah !== 0 && al !== ah - 1) || al > 13) return false;

  if (dcBand) {
    const parts = scan.components.map((component) => ({ component, table: tables[component.dc] }));
    if (ah === 0 && parts.some((part) => !part.table || !part.table.dc)) return false;
    const single = parts.length === 1;
    const mcus = single ? parts[0].component.blocksWide * parts[0].component.blocksHigh : frame.mcusWide * frame.mcusHigh;
    for (let mcu = 0; mcu < mcus; mcu += 1) {
      if (restartInterval && mcu && mcu % restartInterval === 0 && !reader.restart(mcu / restartInterval)) return false;
      for (const { component, table } of parts) {
        for (let block = single ? 1 : component.h * component.v; block > 0; block -= 1) {
          if (ah === 0) {
            const category = reader.symbol(table as Table);
            if (category < 0 || (category && reader.bits(category) < 0)) return false;
          } else if (reader.bits(1) < 0) {
            return false;
          }
        }
      }
    }
    return true;
  }

  // AC bands: one component, one block per MCU, in the component's own block grid, so the MCU index is the block
  // index. `history` keeps, per block, which coefficients (in zigzag order) are non-zero: refinement scans read one
  // correction bit for each of them, so they decide how many bits a block takes.
  const component = scan.components[0];
  const table = tables[4 + component.ac];
  if (!table) return false;
  const blocks = component.blocksWide * component.blocksHigh;
  const nonZero = (history[component.index] ??= new Uint32Array(2 * blocks));
  const band = bandMask(ss, se);
  let eobRun = 0;
  for (let mcu = 0; mcu < blocks;) {
    if (restartInterval && mcu && mcu % restartInterval === 0) {
      if (!reader.restart(mcu / restartInterval)) return false;
      eobRun = 0;
    }
    if (ah === 0) {
      if (eobRun > 0) {
        // A run of empty bands: nothing to read, so the whole run (up to the next restart) is skipped at once.
        const untilRestart = restartInterval ? restartInterval - (mcu % restartInterval) : blocks - mcu;
        const skip = Math.min(eobRun, untilRestart, blocks - mcu);
        eobRun -= skip;
        mcu += skip;
        continue;
      }
      eobRun = firstAcBand(reader, table, ss, se, al, nonZero, mcu);
    } else {
      eobRun = refineAcBand(reader, table, ss, se, nonZero, mcu, eobRun, band);
    }
    if (eobRun < 0) return false;
    mcu += 1;
  }
  return true;
}

// The first scan of an AC band: run/size pairs, ZRL, or an end-of-band run (2^r plus r bits) covering this and the
// following blocks. Returns the blocks of the run still to come, or -1. Coefficients are kept as libjpeg keeps them,
// shifted by the point transform into 16 bits, so one that wraps to zero stays zero, as it does for libjpeg.
function firstAcBand(reader: BitReader, table: Table, ss: number, se: number, al: number, nonZero: Uint32Array, block: number) {
  for (let k = ss; k <= se; k += 1) {
    const symbol = reader.symbol(table);
    if (symbol < 0) return -1;
    const run = symbol >> 4;
    const size = symbol & 15;
    if (size) {
      k += run;
      const bits = reader.bits(size);
      if (bits < 0) return -1;
      const value = bits < 1 << (size - 1) ? bits - (1 << size) + 1 : bits;
      mark(nonZero, block, Math.min(k, 63), ((value << al) & 0xffff) !== 0);
    } else if (run === 15) {
      k += 15;
    } else {
      let eobRun = 1 << run;
      if (run) {
        const bits = reader.bits(run);
        if (bits < 0) return -1;
        eobRun += bits;
      }
      return eobRun - 1;
    }
  }
  return 0;
}

// A refinement scan of an AC band (libjpeg's decode_mcu_AC_refine): new coefficients of size 1 with a sign bit, and a
// correction bit for every coefficient already non-zero that the band passes over, including in end-of-band runs.
function refineAcBand(reader: BitReader, table: Table, ss: number, se: number, nonZero: Uint32Array, block: number, eobRun: number, band: [number, number]) {
  let k = ss;
  if (eobRun === 0) {
    for (; k <= se; k += 1) {
      const symbol = reader.symbol(table);
      if (symbol < 0) return -1;
      let run = symbol >> 4;
      const size = symbol & 15;
      if (size) {
        if (reader.bits(1) < 0) return -1;
      } else if (run !== 15) {
        eobRun = 1 << run;
        if (run) {
          const bits = reader.bits(run);
          if (bits < 0) return -1;
          eobRun += bits;
        }
        break;
      }
      do {
        if (isNonZero(nonZero, block, k)) {
          if (reader.bits(1) < 0) return -1;
        } else if (--run < 0) {
          break;
        }
        k += 1;
      } while (k <= se);
      if (size) mark(nonZero, block, Math.min(k, 63), true);
    }
  }
  if (eobRun > 0) {
    // Correction bits for the rest of the band; only the set positions need a look.
    const low = nonZero[2 * block] & band[0] & (k < 32 ? ~((1 << k) - 1) : 0);
    const high = nonZero[2 * block + 1] & band[1] & (k < 32 ? -1 : ~((2 ** (k - 32) - 1) | 0));
    const bits = popCount(low) + popCount(high);
    for (let bit = 0; bit < bits; bit += 1) {
      if (reader.bits(1) < 0) return -1;
    }
    eobRun -= 1;
  }
  return eobRun;
}

function bandMask(ss: number, se: number): [number, number] {
  let low = 0;
  let high = 0;
  for (let k = ss; k <= se; k += 1) {
    if (k < 32) low |= 1 << k;
    else high |= 1 << (k - 32);
  }
  return [low, high];
}

function mark(nonZero: Uint32Array, block: number, k: number, value: boolean) {
  const word = 2 * block + (k >> 5);
  if (value) nonZero[word] |= 1 << (k & 31);
  else nonZero[word] &= ~(1 << (k & 31));
}

function isNonZero(nonZero: Uint32Array, block: number, k: number) {
  return (nonZero[2 * block + (k >> 5)] & (1 << (k & 31))) !== 0;
}

function popCount(value: number) {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return Math.imul((value + (value >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}
