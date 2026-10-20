// Whether a WebP image's compressed data is all there (Codex re-check R3; photo-check.ts walks the RIFF chunks first).
// The data is parsed as libwebp parses it, and a stream that needs data it does not have, or breaks a rule libwebp
// enforces, is incomplete. Lossy (VP8): the first partition's headers and every macroblock's modes, then every
// macroblock's coefficient tokens from the partition libwebp reads them from. Lossless (VP8L): the transforms, colour
// cache and prefix codes, then every pixel's symbols and backward references; only the entropy image, which picks the
// prefix codes of each tile, is decoded to values. Alpha (ALPH, for a lossy image): the same lossless walk, or a raw
// plane of at least width × height bytes. Pixels are never reconstructed: no prediction, no transforms, no filtering.
//
// Each stream is read within its own chunk. libwebp hands the image decoder the rest of the file, so it would let a
// stream run on into the chunk's padding byte or later chunks; an encoder never writes one that does. Also stricter than libwebp: a lossless alpha
// plane whose last symbol runs past its data (libwebp tolerates that one symbol), and a lossless image with more than
// 4096 prefix-code groups (libwebp's encoder writes at most 2600).
//
// Bounds: the caller checks the 8000 px limit first. A lossy frame has at most 500 × 500 macroblocks, each read once
// (a 5 MB frame crafted for the most bool-decoder reads, about 280 million, takes about 2 s; real photos up to 5 MB
// need under 60 million). Lossless symbols that read bits move forward through at most 5 MB of data; a run of pixels
// that reads none (a code with a single symbol) is crossed a tile row at a time (one bit per pixel over 5 MB takes
// about 0.9 s). Memory: the entropy image (up to 2000 × 2000 values) and the prefix codes (up to 4096 × 5).

export type WebpImage = { lossless: boolean; start: number; end: number; width: number; height: number };

export function webpImageDataComplete(data: Uint8Array, image: WebpImage, alpha: [start: number, end: number] | null) {
  const stream = data.subarray(image.start, image.end);
  if (image.lossless) return losslessComplete(stream, image.width, image.height, 40); // after the 5-byte VP8L header
  if (!lossyFrameComplete(stream)) return false;
  return alpha === null || alphaComplete(data.subarray(alpha[0], alpha[1]), image.width, image.height);
}

// ------------------------------------------------------------------ lossy (VP8, RFC 6386)

// libwebp's tables (RFC 6386 13.5, 13.4 and 11.5), base64: default coefficient probabilities and their update
// probabilities, each [type 4][band 8][context 3][11], and the 4×4 mode probabilities [above 10][left 10][9].
const COEFFICIENT_PROBABILITIES = Buffer.from(
  "gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA/Yj+/+TbgICAgIC9gfL/49X/24CAgGp+4/zW0f//gICAAWL4/+zi//+AgIC1he7+"
    + "3er/moCAgE6GyvfGtP/bgICAAbn5//P/gICAgIC4lvf/7OCAgICAgE1u2P/s5oCAgICAAWX7//H/gICAgICqi/H87NH//4CAgCV0xPPk////"
    + "gICAAcz+//X/gICAgIDPoPr/7oCAgICAgGZn5//Tq4CAgICAAZj8//D/gICAgICxh/P/6uGAgICAgFCB0//C4ICAgICAAQH/gICAgICAgID2"
    + "Af+AgICAgICAgP+AgICAgICAgICAxiPt38G7oqCRmz6DLcbdrLDcnfzdAUQvktCVp92i/9+AAZXx/93g//+AgIC4jer93tz/x4CAgFFjtfKw"
    + "vvnK//+AAYHo/dbF8sT//4BjedL6ycb/yoCAgBdbo/Kqu/fS//+AAcj2/+r/gICAgIBtsvH/5/X//4CAgCyCyf3NwP//gICAAYTv+9vR/6WA"
    + "gIBeiOH72r7//4CAgBZkrvW6of/HgICAAbb5/+jrgICAgIB8j/H/4+qAgICAgCNNtfvB0//NgICAAZ33/+zn//+AgIB5jev/4eP//4CAgC1j"
    + "vPvD2f/ggICAAQH7/9X/gICAgIDLAfj//4CAgICAgIkBsf/g/4CAgICA/Qn4+8/Q/8CAgICvDeDzwbn5xv//gEkRq92hs+yn/+qAAV/3/dS3"
    + "//+AgIDvWvT609H//4CAgJtNw/i8w///gICAARjv+9rb/82AgIDJM9v/xLqAgICAgEUuvu/J2v/kgICAAb/7//+AgICAgIDfpfn/1f+AgICA"
    + "gI18+P//gICAgICAARD4//+AgICAgIC+JOb/7P+AgICAgJUB/4CAgICAgICAAeL/gICAgICAgID3wP+AgICAgICAgPCA/4CAgICAgICAAYb8"
    + "//+AgICAgIDVPvr//4CAgICAgDdd/4CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAyhjV67q/3KDwr/9+Jrboqbjk"
    + "rv+7gD0uituXsvCq/9iAAXDm+se/95///4CmbeT809f/roCAgCdNouistPWy//+AATTc9sbH+dz//4B8Sr/zt8H63f//gBhHgtuaqvO2//+A"
    + "Abbh+dvw/+CAgICVluL82M3/q4CAgBxsqvK3wv7f//+AAVHm/MzL/8CAgIB7ZtH3vMT/6YCAgBRfmfOkrf/LgICAAd74/9jVgICAgICor/b8"
    + "683//4CAgC901//T1P//gICAAXns/dTW//+AgICNVNX8ycr/24CAgCpQoPCiuf/NgICAAQH/gICAgICAgID0Af+AgICAgICAgO4B/4CAgICA"
    + "gICA",
  "base64",
);
const COEFFICIENT_UPDATES = Buffer.from(
  "////////////////////////////////////////////sPb////////////f8fz///////////n9/f////////////T8///////////q/v7/"
    + "//////////3///////////////b+///////////v/f7///////////7//v////////////j+///////////7//7/////////////////////"
    + "//////3+///////////7/v7///////////7//v////////////79//7////////6//7//v////////7/////////////////////////////"
    + "////////////////////////////2f/////////////h/PH9///+/////+r68fr9//3+//////7////////////f/v7//////////+79/v7/"
    + "//////////j+///////////5/v////////////////////////////3////////////3/v////////////////////////////3+////////"
    + "///8//////////////////////////////7+///////////9//////////////////////////////79///////////6//////////////7/"
    + "////////////////////////////////////////////////////////uvv6///////////q+/T+//////////v78/3+//7///////3+////"
    + "///////s/f7///////////v9/f7+//////////7+///////////+/v7///////////////////////////7////////////+/v//////////"
    + "//7////////////////////////////+////////////////////////////////////////////////////////////////////////////"
    + "////////////////////////////////////////////////////////////////////////////////////+P/////////////6/vz+////"
    + "//////j++f3///////////39///////////2/f3///////////z++/7+//////////78///////////4/v3///////////3//v7/////////"
    + "//v+///////////1+/7///////////39/v////////////v9///////////8/f7////////////+//////////////z////////////5//7/"
    + "/////////////v/////////////9///////////6///////////////////////////////////////////+////////////////////////"
    + "////",
  "base64",
);
const SUBBLOCK_MODE_PROBABILITIES = Buffer.from(
  "53gwWXNxeJhwmLNAfqp2LkZfr0WPUFVSSJtnODoKq9q9EQ2YchoRoyzDFQqteRhQwxo+LEBVkEcKJqvVkCIaqi43E4igIc5HPxQIcnLQDAni"
    + "USgLYLZUHRAkhrdZiWJlaqWUSLtkgp1vIEtQQmanY0o+KOqAKTUJsvGNGghrSisakkmmMRedQSZpoDM0H3OAaE8MG9n/VxEHV0RHLHIzD7oX"
    + "LykObra3FRHCQi0ZZsW9FxIWWFiTliouLcTNK2G3dVUmI7M9JzXIVxoVK+irOCIzaHJmHV1NJxxVqzqlWmJAIhZ0zhciK6ZJazYgGjMBUSsf"
    + "RBlqFkCrJOFyIhMVZoS8EEx8PhJOX1U5MjAzwWUjn9dvWS5vPJQfrNvkFRJvcHFNVbP/JnhyKCoBxPXRChltWCsdjKbVJSuaPT8em0MtRAHR"
    + "ZFAIK5oBMxpHjk5OEP+AIsWrKSgFZtO3BAHdMzIRqNHAFxlSih8kqxumJizlQ1c6qVJzGjuzPztatDumXUmaKCgVdI/RIievLw8QtyLfMS23"
    + "LhEhtwZiDyC3OS4WGIABNhElQSBJcxyAF4DNKAMJczPAEgbfVyUJcztNQBUvaDcs2gk2NYLiQFpGzSgpFxo5NjlwuAUpJqbVHiIahZh0CiCG"
    + "JxM13RpyIEn/HwlB6gIPAXZJSyAMM8D/oCszWB8jQ2ZVN7pVOBUXbzvNLSXANyZGfElmASJifWIqWGhVda9SX1Q1WYBkcWUtS097LzOAUasB"
    + "OREFR2Y5NSkxJiENeTlJGgFVKQpDik1uWi9ycxUCCmb/phcGZR0QClWAZcQaORIKZmbVIhQrdRQPJKOARAEaZj1HJSI1H/PARTxHJkl3HN4l"
    + "RC2AIgEvC/WrPhETRpJVNz5GJSslmmSjVaABPwlciBxAIMlVSw8JCUD/uHcQVgYcBUD/GfgBOAgRhIn/N3SAOg8UUoc5GnkopDIfiZqFGSPa"
    + "M2csg4N7HwaeVihAh5TgLbeAFhoRg/CaDgHRLRAVW0DeBwHFOBUnmzyKF2bVUwwNNsD/RC8cVRpVVYCAIJKrEgsHP5CrBAT2IxsKkq6rDBqA"
    + "vlAjY7RQfjYtVX4vV7AzKRQgZUuAi3aSdIBVOCkPsOxVJQk+Rx4Rd3b/ERKKZSY8ijdGKxqOkiQTHqv/YRsUii09PtsBUbxAICkUdZeOFBWj"
    + "cBMMPcOAMAQY",
  "base64",
);
// Coefficient bands by position, with the sentinel libwebp reads after the last coefficient.
const BANDS = [0, 1, 2, 3, 6, 4, 5, 6, 6, 6, 6, 6, 6, 6, 6, 7, 0];
// Extra-bit probabilities of the DCT_CAT3 to DCT_CAT6 token categories.
const CATEGORIES = [
  [173, 148, 140],
  [176, 155, 140, 135],
  [180, 157, 141, 134, 130],
  [254, 254, 243, 230, 196, 177, 153, 140, 133, 130, 129],
];

// The boolean decoder, as libwebp's VP8BitReader (range kept minus one, bytes loaded one at a time when needed).
// Reading past the data sets eof, which libwebp checks after each macroblock row of modes and each macroblock of tokens.
class BoolDecoder {
  eof = false;
  private range = 254;
  private value = 0;
  private bits = -8;
  private position = 0;

  private constructor(private readonly data: Uint8Array) {
    this.load();
  }

  // A partition's decoder; null when its first byte is 0xff, which no encoder writes (RFC 6386 7.2).
  static open(data: Uint8Array) {
    const decoder = new BoolDecoder(data);
    return decoder.value >>> decoder.bits <= decoder.range ? decoder : null;
  }

  private load() {
    if (this.position < this.data.length) {
      this.bits += 8;
      this.value = (this.value << 8) | this.data[this.position++];
    } else if (!this.eof) {
      this.value <<= 8;
      this.bits += 8;
      this.eof = true;
    } else {
      this.bits = 0;
    }
  }

  bit(probability: number) {
    let range = this.range;
    if (this.bits < 0) this.load();
    const position = this.bits;
    const split = (range * probability) >> 8;
    let bit = 0;
    if (this.value >>> position > split) {
      range -= split;
      this.value -= (split + 1) << position;
      bit = 1;
    } else {
      range = split + 1;
    }
    const shift = 7 ^ (31 - Math.clz32(range));
    this.range = (range << shift) - 1;
    this.bits -= shift;
    return bit;
  }

  // A coefficient's sign, read as libwebp's VP8GetSigned does.
  sign() {
    if (this.bits < 0) this.load();
    const position = this.bits;
    const split = this.range >> 1;
    const mask = (split - (this.value >>> position)) >> 31;
    this.bits -= 1;
    this.range = (this.range + mask) | 1;
    this.value -= ((split + 1) & mask) << position;
  }

  literal(count: number) {
    let value = 0;
    while (count-- > 0) value |= this.bit(128) << count;
    return value;
  }

  signedLiteral(count: number) {
    this.literal(count);
    this.bit(128);
  }
}

// A key frame (photo-check.ts checked the frame tag, start code and size): the first partition holds the headers and
// every macroblock's modes, row by row; each row's tokens come from token partition row % count.
function lossyFrameComplete(frame: Uint8Array) {
  const columns = (((frame[6] | (frame[7] << 8)) & 0x3fff) + 15) >> 4;
  const rows = (((frame[8] | (frame[9] << 8)) & 0x3fff) + 15) >> 4;
  const firstSize = (frame[0] | (frame[1] << 8) | (frame[2] << 16)) >>> 5;
  if (firstSize > frame.length - 10) return false;
  const modes = BoolDecoder.open(frame.subarray(10, 10 + firstSize));
  if (!modes) return false;

  // Colour space and clamping type, then the segment and filter headers.
  modes.bit(128);
  modes.bit(128);
  let segmentProbabilities: number[] | null = null;
  if (modes.bit(128)) {
    const updateMap = modes.bit(128);
    if (modes.bit(128)) {
      modes.bit(128);
      for (let segment = 0; segment < 4; segment += 1) if (modes.bit(128)) modes.signedLiteral(7);
      for (let segment = 0; segment < 4; segment += 1) if (modes.bit(128)) modes.signedLiteral(6);
    }
    if (updateMap) segmentProbabilities = [0, 1, 2].map(() => (modes.bit(128) ? modes.literal(8) : 255));
  }
  modes.bit(128);
  modes.literal(6);
  modes.literal(3);
  if (modes.bit(128) && modes.bit(128)) {
    for (let delta = 0; delta < 8; delta += 1) if (modes.bit(128)) modes.signedLiteral(6);
  }
  if (modes.eof) return false;

  // Token partitions: the sizes of all but the last come first (each cut to the data left), the last takes the rest
  // and must not be empty.
  const partitionCount = 1 << modes.literal(2);
  const sizes = 10 + firstSize;
  let offset = sizes + 3 * (partitionCount - 1);
  if (offset > frame.length) return false;
  const partitions: BoolDecoder[] = [];
  for (let index = 0; index < partitionCount; index += 1) {
    const last = index === partitionCount - 1;
    if (last && offset >= frame.length) return false;
    const at = sizes + 3 * index;
    const size = last ? frame.length - offset : Math.min(frame[at] | (frame[at + 1] << 8) | (frame[at + 2] << 16), frame.length - offset);
    const partition = BoolDecoder.open(frame.subarray(offset, offset + size));
    if (!partition) return false;
    partitions.push(partition);
    offset += size;
  }

  // Quantizer indices, the refresh-probabilities flag libwebp ignores, the coefficient probability updates and the
  // skip probability.
  modes.literal(7);
  for (let delta = 0; delta < 5; delta += 1) if (modes.bit(128)) modes.signedLiteral(4);
  modes.bit(128);
  const probabilities = new Uint8Array(COEFFICIENT_PROBABILITIES.length);
  for (let index = 0; index < probabilities.length; index += 1) {
    probabilities[index] = modes.bit(COEFFICIENT_UPDATES[index]) ? modes.literal(8) : COEFFICIENT_PROBABILITIES[index];
  }
  const skipProbability = modes.bit(128) ? modes.literal(8) : -1;

  // Contexts: the 4×4 modes along the top and left edges, and which blocks above and to the left had coefficients
  // (libwebp's nz bits: four luma columns or rows, then two for each chroma plane, and the Y2 block apart).
  const top = new Uint8Array(4 * columns);
  const left = new Uint8Array(4);
  const context = { topNz: new Uint8Array(columns), topDc: new Uint8Array(columns), leftNz: 0, leftDc: 0 };
  const skipped = new Uint8Array(columns);
  const subblocks = new Uint8Array(columns);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (segmentProbabilities) {
        if (!modes.bit(segmentProbabilities[0])) modes.bit(segmentProbabilities[1]);
        else modes.bit(segmentProbabilities[2]);
      }
      skipped[column] = skipProbability >= 0 ? modes.bit(skipProbability) : 0;
      subblocks[column] = modes.bit(145) ? 0 : 1;
      if (!subblocks[column]) {
        // 16×16 prediction (DC, V, H or TM) fills the edge contexts with the matching 4×4 mode.
        const mode = modes.bit(156) ? (modes.bit(128) ? 1 : 3) : modes.bit(163) ? 2 : 0;
        top.fill(mode, 4 * column, 4 * column + 4);
        left.fill(mode);
      } else {
        for (let y = 0; y < 4; y += 1) {
          let mode = left[y];
          for (let x = 0; x < 4; x += 1) {
            mode = subblockMode(modes, (top[4 * column + x] * 10 + mode) * 9);
            top[4 * column + x] = mode;
          }
          left[y] = mode;
        }
      }
      if (modes.bit(142) && modes.bit(114)) modes.bit(183);
    }
    if (modes.eof) return false;

    const tokens = partitions[row & (partitionCount - 1)];
    for (let column = 0; column < columns; column += 1) {
      if (!skipped[column]) {
        macroblockTokens(tokens, probabilities, context, column, !subblocks[column]);
      } else {
        context.leftNz = context.topNz[column] = 0;
        if (!subblocks[column]) context.leftDc = context.topDc[column] = 0;
      }
      if (tokens.eof) return false;
    }
    context.leftNz = 0;
    context.leftDc = 0;
    left.fill(0);
  }
  return true;
}

// A 4×4 block's prediction mode (B_DC_PRED 0 … B_HU_PRED 9), with libwebp's hard-coded tree.
function subblockMode(modes: BoolDecoder, at: number) {
  const p = (index: number) => SUBBLOCK_MODE_PROBABILITIES[at + index];
  if (!modes.bit(p(0))) return 0;
  if (!modes.bit(p(1))) return 1;
  if (!modes.bit(p(2))) return 2;
  if (!modes.bit(p(3))) {
    if (!modes.bit(p(4))) return 3;
    return modes.bit(p(5)) ? 5 : 4;
  }
  if (!modes.bit(p(6))) return 6;
  if (!modes.bit(p(7))) return 7;
  return modes.bit(p(8)) ? 9 : 8;
}

type TokenContext = { topNz: Uint8Array; topDc: Uint8Array; leftNz: number; leftDc: number };

// libwebp's ParseResiduals, keeping only what decides the next probabilities: the Y2 block of a 16×16-predicted
// macroblock, sixteen luma blocks and four blocks of each chroma plane.
function macroblockTokens(tokens: BoolDecoder, probabilities: Uint8Array, context: TokenContext, column: number, whole: boolean) {
  let first = 0;
  let lumaType = 3;
  if (whole) {
    const nz = coefficients(tokens, probabilities, 1, context.topDc[column] + context.leftDc, 0);
    context.topDc[column] = context.leftDc = nz > 0 ? 1 : 0;
    first = 1;
    lumaType = 0;
  }
  let tnz = context.topNz[column] & 0x0f;
  let lnz = context.leftNz & 0x0f;
  for (let y = 0; y < 4; y += 1) {
    let l = lnz & 1;
    for (let x = 0; x < 4; x += 1) {
      l = coefficients(tokens, probabilities, lumaType, l + (tnz & 1), first) > first ? 1 : 0;
      tnz = (tnz >> 1) | (l << 7);
    }
    tnz >>= 4;
    lnz = (lnz >> 1) | (l << 7);
  }
  let outTop = tnz;
  let outLeft = lnz >> 4;
  for (let plane = 0; plane < 4; plane += 2) {
    tnz = context.topNz[column] >> (4 + plane);
    lnz = context.leftNz >> (4 + plane);
    for (let y = 0; y < 2; y += 1) {
      let l = lnz & 1;
      for (let x = 0; x < 2; x += 1) {
        l = coefficients(tokens, probabilities, 2, l + (tnz & 1), 0) > 0 ? 1 : 0;
        tnz = (tnz >> 1) | (l << 3);
      }
      tnz >>= 2;
      lnz = (lnz >> 1) | (l << 5);
    }
    outTop |= (tnz << 4) << plane;
    outLeft |= (lnz & 0xf0) << plane;
  }
  context.topNz[column] = outTop;
  context.leftNz = outLeft;
}

// One block's tokens from coefficient n on (libwebp's GetCoeffs); returns the position after the last non-zero one.
function coefficients(tokens: BoolDecoder, probabilities: Uint8Array, type: number, context: number, n: number) {
  let p = ((type * 8 + BANDS[n]) * 3 + context) * 11;
  for (; n < 16; n += 1) {
    if (!tokens.bit(probabilities[p])) return n;
    while (!tokens.bit(probabilities[p + 1])) {
      n += 1;
      if (n === 16) return 16;
      p = (type * 8 + BANDS[n]) * 33;
    }
    const next = (type * 8 + BANDS[n + 1]) * 33;
    if (!tokens.bit(probabilities[p + 2])) {
      p = next + 11;
    } else {
      largeValue(tokens, probabilities, p);
      p = next + 22;
    }
    tokens.sign();
  }
  return 16;
}

function largeValue(tokens: BoolDecoder, probabilities: Uint8Array, p: number) {
  if (!tokens.bit(probabilities[p + 3])) {
    if (tokens.bit(probabilities[p + 4])) tokens.bit(probabilities[p + 5]);
  } else if (!tokens.bit(probabilities[p + 6])) {
    if (!tokens.bit(probabilities[p + 7])) {
      tokens.bit(159);
    } else {
      tokens.bit(165);
      tokens.bit(145);
    }
  } else {
    const high = tokens.bit(probabilities[p + 8]);
    const low = tokens.bit(probabilities[p + 9 + high]);
    for (const probability of CATEGORIES[2 * high + low]) tokens.bit(probability);
  }
}

// ------------------------------------------------------------------ alpha (ALPH)

// One header byte (compression, filter, pre-processing, reserved bits), then a raw plane or a lossless stream without
// the VP8L header, its size taken from the frame.
function alphaComplete(chunk: Uint8Array, width: number, height: number) {
  if (chunk.length <= 1) return false;
  const method = chunk[0] & 0x03;
  if (method > 1 || ((chunk[0] >> 4) & 0x03) > 1 || chunk[0] >> 6) return false;
  if (method === 0) return chunk.length - 1 >= width * height;
  return losslessComplete(chunk.subarray(1), width, height, 0);
}

// ------------------------------------------------------------------ lossless (VP8L)

const MAX_GROUPS = 4096;
const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
// Distance codes 1–120 name nearby pixels: (row offset << 4) | (8 − column offset).
const PLANE_CODES = Buffer.from(
  "1807171928062729161a262a38053739151b363a252b48044749141c353b464a242c58454b343c035759131d565a232d444c555b333d68"
    + "026769121e666a222e545c434d656b323e78017779535d111f646c424e767a212f757b313f636d525e00747c414f1020626e30737d515f"
    + "40727e616f50717f6070",
  "hex",
);

// Least-significant-bit-first reader with libwebp's end-of-stream rule: a stream of n bytes may be read for
// max(n, 8) bytes' worth of bits (a stream shorter than 8 bytes reads zeros after its end), and one bit more is the
// end of the stream, however far decoding then gets.
class BitReader {
  private readonly data: Uint8Array;
  private readonly limit: number;

  constructor(stream: Uint8Array, private bit: number) {
    this.data = new Uint8Array(Math.max(stream.length, 8) + 4);
    this.data.set(stream);
    this.limit = 8 * Math.max(stream.length, 8);
  }

  get overrun() {
    return this.bit > this.limit;
  }

  // At least the next 25 bits, the next one lowest (zeros once past the end).
  peek() {
    const d = this.data;
    const index = Math.min(this.bit >>> 3, d.length - 4);
    return (d[index] | (d[index + 1] << 8) | (d[index + 2] << 16) | (d[index + 3] << 24)) >>> (this.bit & 7);
  }

  skip(count: number) {
    this.bit += count;
  }

  read(count: number) {
    const value = this.peek() & ((1 << count) - 1);
    this.bit += count;
    return value;
  }
}

// A canonical prefix code as libwebp accepts it: a single symbol (read with no bits) or a complete code. Codes up to
// eight bits are looked up at once, longer ones are read a bit at a time.
type PrefixCode = { single: number; rootBits: number; root: Uint16Array; counts: Uint16Array; symbols: Uint16Array };

function buildCode(lengths: Uint8Array, size: number): PrefixCode | null {
  const counts = new Uint16Array(16);
  let used = 0;
  let last = 0;
  let longest = 0;
  for (let symbol = 0; symbol < size; symbol += 1) {
    const length = lengths[symbol];
    if (!length) continue;
    counts[length] += 1;
    used += 1;
    last = symbol;
    if (length > longest) longest = length;
  }
  const empty = new Uint16Array(0);
  if (used === 0) return null;
  if (used === 1) return { single: last, rootBits: 0, root: empty, counts, symbols: empty };
  let kraft = 0;
  for (let length = 1; length <= 15; length += 1) kraft += counts[length] << (15 - length);
  if (kraft !== 1 << 15) return null;

  const symbols = new Uint16Array(used);
  const offsets = new Uint16Array(16);
  for (let length = 1; length < 15; length += 1) offsets[length + 1] = offsets[length] + counts[length];
  for (let symbol = 0; symbol < size; symbol += 1) if (lengths[symbol]) symbols[offsets[lengths[symbol]]++] = symbol;

  // Root table: each code of up to rootBits bits, bit-reversed (it is read first bit lowest), in every entry it prefixes.
  const rootBits = Math.min(longest, 8);
  const root = new Uint16Array(1 << rootBits);
  let code = 0;
  let index = 0;
  for (let length = 1; length <= rootBits; length += 1) {
    for (let count = 0; count < counts[length]; count += 1, code += 1, index += 1) {
      let reversed = 0;
      for (let bit = 0; bit < length; bit += 1) reversed |= ((code >> bit) & 1) << (length - 1 - bit);
      for (let entry = reversed; entry < root.length; entry += 1 << length) root[entry] = (length << 12) | symbols[index];
    }
    code <<= 1;
  }
  return { single: -1, rootBits, root, counts, symbols };
}

function decodeSymbol(reader: BitReader, code: PrefixCode) {
  if (code.single >= 0) return code.single;
  const bits = reader.peek();
  const entry = code.root[bits & ((1 << code.rootBits) - 1)];
  if (entry) {
    reader.skip(entry >>> 12);
    return entry & 0xfff;
  }
  let value = 0;
  let first = 0;
  let index = 0;
  for (let length = 1; length <= 15; length += 1) {
    value |= (bits >>> (length - 1)) & 1;
    const count = code.counts[length];
    if (value - first < count) {
      reader.skip(length);
      return code.symbols[index + value - first];
    }
    index += count;
    first = (first + count) << 1;
    value <<= 1;
  }
  return 0; // not reached: the code is complete
}

// A prefix code: either "simple" (one or two symbols listed outright) or code lengths coded with a code-length code.
function readCode(reader: BitReader, alphabet: number, lengths: Uint8Array) {
  lengths.fill(0, 0, alphabet);
  if (reader.read(1)) {
    const two = reader.read(1);
    lengths[reader.read(reader.read(1) ? 8 : 1)] = 1;
    if (two) lengths[reader.read(8)] = 1;
  } else {
    const codeLengths = new Uint8Array(19);
    const count = reader.read(4) + 4;
    for (let index = 0; index < count; index += 1) codeLengths[CODE_LENGTH_ORDER[index]] = reader.read(3);
    if (!readCodeLengths(reader, codeLengths, alphabet, lengths)) return null;
  }
  return reader.overrun ? null : buildCode(lengths, alphabet);
}

function readCodeLengths(reader: BitReader, codeLengths: Uint8Array, alphabet: number, lengths: Uint8Array) {
  const code = buildCode(codeLengths, 19);
  if (!code) return false;
  let remaining = alphabet;
  if (reader.read(1)) {
    remaining = 2 + reader.read(2 + 2 * reader.read(3));
    if (remaining > alphabet) return false;
  }
  let previous = 8;
  for (let symbol = 0; symbol < alphabet && remaining-- > 0;) {
    const length = decodeSymbol(reader, code);
    if (length < 16) {
      lengths[symbol++] = length;
      if (length) previous = length;
    } else {
      const repeat = length === 16 ? 3 + reader.read(2) : length === 17 ? 3 + reader.read(3) : 11 + reader.read(7);
      if (symbol + repeat > alphabet) return false;
      lengths.fill(length === 16 ? previous : 0, symbol, symbol + repeat);
      symbol += repeat;
    }
  }
  return true;
}

// Which prefix codes each pixel uses: one group of five (green with length and cache codes, red, blue, alpha,
// distance), or, with an entropy image, the group its tile names.
type Layout = { groups: PrefixCode[][]; image: Uint32Array | null; bits: number; imageWidth: number };

function readLayout(reader: BitReader, width: number, height: number, cacheBits: number, entropyImage: boolean): Layout | null {
  let image: Uint32Array | null = null;
  let bits = 0;
  let imageWidth = 0;
  let groupCount = 1;
  if (entropyImage && reader.read(1)) {
    bits = 2 + reader.read(3);
    imageWidth = subSample(width, bits);
    image = readEntropyImage(reader, imageWidth, subSample(height, bits));
    if (!image) return null;
    for (let index = 0; index < image.length; index += 1) {
      image[index] = (image[index] >> 8) & 0xffff;
      if (image[index] >= groupCount) groupCount = image[index] + 1;
    }
  }
  if (reader.overrun || groupCount > MAX_GROUPS) return null;
  const green = 280 + (cacheBits ? 1 << cacheBits : 0);
  const lengths = new Uint8Array(green);
  const groups: PrefixCode[][] = [];
  for (let group = 0; group < groupCount; group += 1) {
    const codes: PrefixCode[] = [];
    for (const alphabet of [green, 256, 256, 256, 40]) {
      const code = readCode(reader, alphabet, lengths);
      if (!code) return null;
      codes.push(code);
    }
    groups.push(codes);
  }
  return { groups, image, bits, imageWidth };
}

// The image stream of a VP8L chunk (after its header) or of an ALPH chunk: transforms, then the main image.
function losslessComplete(stream: Uint8Array, width: number, height: number, startBit: number) {
  const reader = new BitReader(stream, startBit);
  let codedWidth = width;
  let seen = 0;
  while (reader.read(1)) {
    const type = reader.read(2);
    if (seen & (1 << type)) return false;
    seen |= 1 << type;
    if (type === 0 || type === 1) {
      // Predictor or cross-colour transform: a sub-image of one value per block.
      const bits = 2 + reader.read(3);
      if (!readSubImage(reader, subSample(codedWidth, bits), subSample(height, bits))) return false;
    } else if (type === 3) {
      // Colour indexing: a palette, and up to eight pixels packed in each coded one.
      const colors = reader.read(8) + 1;
      if (!readSubImage(reader, colors, 1)) return false;
      codedWidth = subSample(codedWidth, colors > 16 ? 0 : colors > 4 ? 1 : colors > 2 ? 2 : 3);
    }
  }
  const cacheBits = readCacheBits(reader);
  if (cacheBits < 0) return false;
  const layout = readLayout(reader, codedWidth, height, cacheBits, true);
  return layout !== null && walkPixels(reader, codedWidth, height, layout);
}

// A sub-image (transform data, palette, entropy image) has its own colour cache and one group of codes, and no
// transforms. Only the entropy image's values matter; the others are read through.
function readSubImage(reader: BitReader, width: number, height: number) {
  const cacheBits = readCacheBits(reader);
  const layout = cacheBits < 0 ? null : readLayout(reader, width, height, cacheBits, false);
  return layout !== null && walkPixels(reader, width, height, layout);
}

function readEntropyImage(reader: BitReader, width: number, height: number) {
  const cacheBits = readCacheBits(reader);
  const layout = cacheBits < 0 ? null : readLayout(reader, width, height, cacheBits, false);
  return layout && readValues(reader, width, height, cacheBits, layout.groups[0]);
}

function readCacheBits(reader: BitReader) {
  if (!reader.read(1)) return 0;
  const bits = reader.read(4);
  return bits >= 1 && bits <= 11 ? bits : -1;
}

// Reads every pixel's symbols. A step that reads no bits (a group whose codes each have one symbol) is repeated to the
// end of its tile's part of the row at once: a literal or cache pixel advances one, a copy its length.
function walkPixels(reader: BitReader, width: number, height: number, layout: Layout) {
  const total = width * height;
  const free = layout.groups.map((codes) => freeStep(codes, width));
  const mask = (1 << layout.bits) - 1;
  let position = 0;
  let column = 0;
  let row = 0;
  while (position < total) {
    const group = layout.image ? layout.image[layout.imageWidth * (row >> layout.bits) + (column >> layout.bits)] : 0;
    const step = free[group];
    if (step) {
      const end = layout.image ? row * width + Math.min(width, (column | mask) + 1) : total;
      const count = Math.ceil((end - position) / step.length);
      if (position < step.distance || position + count * step.length > total) return false;
      position += count * step.length;
      row = Math.floor(position / width);
      column = position - row * width;
      continue;
    }
    const codes = layout.groups[group];
    const green = decodeSymbol(reader, codes[0]);
    if (green < 256) {
      decodeSymbol(reader, codes[1]);
      decodeSymbol(reader, codes[2]);
      decodeSymbol(reader, codes[3]);
    } else if (green < 280) {
      const length = prefixValue(reader, green - 256);
      const distance = planeDistance(width, prefixValue(reader, decodeSymbol(reader, codes[4])));
      if (reader.overrun || position < distance || total - position < length) return false;
      position += length;
      row = Math.floor(position / width);
      column = position - row * width;
      continue;
    }
    if (reader.overrun) return false;
    position += 1;
    column += 1;
    if (column === width) {
      column = 0;
      row += 1;
    }
  }
  return !reader.overrun;
}

function freeStep(codes: PrefixCode[], width: number) {
  const green = codes[0].single;
  if (green < 0) return null;
  if (green < 256) return codes[1].single >= 0 && codes[2].single >= 0 && codes[3].single >= 0 ? { length: 1, distance: 0 } : null;
  if (green >= 280) return { length: 1, distance: 0 };
  const distance = codes[4].single;
  if (green - 256 >= 4 || distance < 0 || distance >= 4) return null;
  return { length: green - 256 + 1, distance: planeDistance(width, distance + 1) };
}

// The entropy image, decoded to ARGB values (its colour cache needs them; the group is in the red and green bytes).
function readValues(reader: BitReader, width: number, height: number, cacheBits: number, codes: PrefixCode[]) {
  const total = width * height;
  const values = new Uint32Array(total);
  const cache = new Uint32Array(cacheBits ? 1 << cacheBits : 0);
  let position = 0;
  let cached = 0;
  while (position < total) {
    const green = decodeSymbol(reader, codes[0]);
    if (green < 256) {
      const red = decodeSymbol(reader, codes[1]);
      const blue = decodeSymbol(reader, codes[2]);
      const alpha = decodeSymbol(reader, codes[3]);
      values[position++] = (alpha << 24) | (red << 16) | (green << 8) | blue;
    } else if (green < 280) {
      const length = prefixValue(reader, green - 256);
      const distance = planeDistance(width, prefixValue(reader, decodeSymbol(reader, codes[4])));
      if (reader.overrun || position < distance || total - position < length) return null;
      for (const end = position + length; position < end; position += 1) values[position] = values[position - distance];
    } else {
      for (; cached < position; cached += 1) cache[Math.imul(values[cached], 0x1e35a7bd) >>> (32 - cacheBits)] = values[cached];
      values[position++] = cache[green - 280];
    }
    if (reader.overrun) return null;
  }
  return values;
}

// Lengths and distances: a prefix symbol, then extra bits for symbols 4 and up.
function prefixValue(reader: BitReader, symbol: number) {
  if (symbol < 4) return symbol + 1;
  const extraBits = (symbol - 2) >> 1;
  return ((2 + (symbol & 1)) << extraBits) + reader.read(extraBits) + 1;
}

function planeDistance(width: number, code: number) {
  if (code > 120) return code - 120;
  const plane = PLANE_CODES[code - 1];
  return Math.max(1, (plane >> 4) * width + 8 - (plane & 0x0f));
}

function subSample(size: number, bits: number) {
  return (size + (1 << bits) - 1) >> bits;
}
