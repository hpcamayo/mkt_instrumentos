// Code 128 barcodes for price labels (reach-10), with no dependency. Mostrador reads them with the camera or a USB
// scanner and matches the SKU exactly. Code set B for text, switching to code set C for runs of digits (two digits per
// symbol, so numeric SKUs print shorter).

// Bar and space widths of symbols 0 to 106 (106 is the stop symbol, with its final bar).
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

// Printable ASCII only: a SKU with other characters (accents, ñ) cannot be a Code 128 barcode.
export function canEncodeCode128(text: string) {
  return text.length > 0 && text.length <= 48 && /^[\x20-\x7e]+$/.test(text);
}

function digitRun(text: string, from: number) {
  let end = from;
  while (end < text.length && text.charCodeAt(end) >= 48 && text.charCodeAt(end) <= 57) end++;
  return end - from;
}

// The symbol values, start and checksum included, stop excluded.
export function code128Values(text: string): number[] {
  if (!canEncodeCode128(text)) throw new Error("CODE128_UNSUPPORTED");
  const values: number[] = [];
  let set: "B" | "C";
  let i = 0;
  // Start in C when the code opens with four or more digits (or is only an even run of digits).
  const leading = digitRun(text, 0);
  if (leading >= 4 || (leading === text.length && leading % 2 === 0)) {
    set = "C";
    values.push(START_C);
  } else {
    set = "B";
    values.push(START_B);
  }
  while (i < text.length) {
    const run = digitRun(text, i);
    if (set === "C") {
      if (run >= 2) {
        values.push(Number(text.slice(i, i + 2)));
        i += 2;
        continue;
      }
      values.push(CODE_B);
      set = "B";
    }
    // In B, switch to C for a run of 6 or more digits (4 or more at the end), keeping an odd digit in B first.
    if (run >= 6 || (run >= 4 && i + run === text.length)) {
      if (run % 2 === 1) {
        values.push(text.charCodeAt(i) - 32);
        i++;
      }
      values.push(CODE_C);
      set = "C";
      continue;
    }
    values.push(text.charCodeAt(i) - 32);
    i++;
  }
  const checksum = values.reduce((sum, value, position) => sum + value * Math.max(position, 1), 0) % 103;
  values.push(checksum);
  return values;
}

// Bar widths in modules, starting with a bar and alternating bar/space, stop included (no quiet zone: leave ten
// modules of white on each side when drawing).
export function code128Widths(text: string): number[] {
  return [...code128Values(text), STOP].flatMap((value) => PATTERNS[value].split("").map(Number));
}

// The bars as SVG rectangles in module units: draw in a viewBox `0 0 width 1` stretched to the label height.
export function code128Bars(text: string, quiet = 10) {
  const widths = code128Widths(text);
  const bars: { x: number; width: number }[] = [];
  let x = quiet;
  widths.forEach((width, i) => {
    if (i % 2 === 0) bars.push({ x, width });
    x += width;
  });
  return { bars, width: x + quiet };
}
