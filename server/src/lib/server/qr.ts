// Minimal QR-code SVG renderer. Self-contained — avoids pulling another deps tree.
// Implements QR Model 2 with byte-mode encoding. Picks the smallest version that fits.

interface BitMatrix {
  size: number;
  data: Uint8Array;
}

function newMatrix(size: number): BitMatrix {
  return { size, data: new Uint8Array(size * size) };
}

function get(m: BitMatrix, r: number, c: number): number {
  return m.data[r * m.size + c];
}
function set(m: BitMatrix, r: number, c: number, v: number) {
  m.data[r * m.size + c] = v;
}

// --- Galois Field 2^8 with primitive 0x11d ---
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    poly = polyMul(poly, [1, GF_EXP[i]]);
  }
  return poly;
}
function polyMul(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) out[i + j] ^= gfMul(a[i], b[j]);
  }
  return out;
}
function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen);
  const buf = data.concat(new Array(ecLen).fill(0));
  for (let i = 0; i < data.length; i++) {
    const factor = buf[i];
    if (factor !== 0) {
      for (let j = 0; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], factor);
    }
  }
  return buf.slice(data.length);
}

// --- QR table data: only what we need (versions 1-10, ECC level L). Each entry:
// [totalDataModules, ecCodewordsPerBlock, blocks(g1count, g1size, g2count, g2size)]
// Sourced from the spec (ISO/IEC 18004) Table 9 + alignment positions.
const VERSIONS_L: Array<{ ec: number; blocks: number[][] }> = [
  { ec: 7, blocks: [[1, 19]] }, // v1
  { ec: 10, blocks: [[1, 34]] }, // v2
  { ec: 15, blocks: [[1, 55]] }, // v3
  { ec: 20, blocks: [[1, 80]] }, // v4
  { ec: 26, blocks: [[1, 108]] }, // v5
  { ec: 18, blocks: [[2, 68]] }, // v6
  { ec: 20, blocks: [[2, 78]] }, // v7
  { ec: 24, blocks: [[2, 97]] }, // v8
  { ec: 30, blocks: [[2, 116]] }, // v9
  { ec: 18, blocks: [[2, 68], [2, 69]] } // v10
];

const ALIGN_PATTERNS: number[][] = [
  [], // v1
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
];

function versionSize(v: number): number {
  return 17 + 4 * v;
}

function pickVersion(byteLen: number): number {
  // mode (4) + length (8 for v1-9, 16 for v10+) + 8*byteLen + terminator (4) bits
  for (let v = 1; v <= 10; v++) {
    const lenBits = v < 10 ? 8 : 16;
    const totalBits = 4 + lenBits + byteLen * 8 + 4;
    const totalBytes = Math.ceil(totalBits / 8);
    const cap = VERSIONS_L[v - 1].blocks.reduce((a, [n, s]) => a + n * s, 0);
    if (totalBytes <= cap) return v;
  }
  throw new Error('Payload too large for v1-10 QR');
}

function encodeData(payload: string, version: number): number[] {
  const bytes = new TextEncoder().encode(payload);
  const lenBits = version < 10 ? 8 : 16;
  const bits: number[] = [];
  function pushBits(value: number, n: number) {
    for (let i = n - 1; i >= 0; i--) bits.push((value >> i) & 1);
  }
  pushBits(0b0100, 4); // byte mode
  pushBits(bytes.length, lenBits);
  for (const b of bytes) pushBits(b, 8);

  const cap = VERSIONS_L[version - 1].blocks.reduce((a, [n, s]) => a + n * s, 0);
  const padTerminator = Math.min(4, cap * 8 - bits.length);
  for (let i = 0; i < padTerminator; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  const padBytes = [0xec, 0x11];
  let pi = 0;
  while (data.length < cap) data.push(padBytes[pi++ % 2]);

  // RS encode per block
  const blocks = VERSIONS_L[version - 1].blocks;
  const ec = VERSIONS_L[version - 1].ec;
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let off = 0;
  for (const [n, size] of blocks) {
    for (let i = 0; i < n; i++) {
      const blk = data.slice(off, off + size);
      off += size;
      dataBlocks.push(blk);
      ecBlocks.push(rsEncode(blk, ec));
    }
  }

  // Interleave
  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const blk of dataBlocks) if (i < blk.length) out.push(blk[i]);
  }
  for (let i = 0; i < ec; i++) {
    for (const blk of ecBlocks) out.push(blk[i]);
  }
  return out;
}

function placeFinder(m: BitMatrix, r: number, c: number) {
  for (let i = -1; i <= 7; i++) {
    for (let j = -1; j <= 7; j++) {
      const rr = r + i;
      const cc = c + j;
      if (rr < 0 || cc < 0 || rr >= m.size || cc >= m.size) continue;
      let val = 0;
      if ((i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
          (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
          (i >= 2 && i <= 4 && j >= 2 && j <= 4)) val = 1;
      // separator (border) is 0
      set(m, rr, cc, val | 0x80); // mark as reserved
    }
  }
}

function placeAlignment(m: BitMatrix, version: number) {
  const positions = ALIGN_PATTERNS[version - 1];
  for (const r of positions) {
    for (const c of positions) {
      // skip the three corners that overlap finders
      if ((r === 6 && c === 6) || (r === 6 && c === positions[positions.length - 1]) || (r === positions[positions.length - 1] && c === 6)) continue;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const val = Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0;
          set(m, r + i, c + j, val | 0x80);
        }
      }
    }
  }
}

function placeTimingPatterns(m: BitMatrix) {
  for (let i = 8; i < m.size - 8; i++) {
    const v = i % 2 === 0 ? 1 : 0;
    if ((get(m, 6, i) & 0x80) === 0) set(m, 6, i, v | 0x80);
    if ((get(m, i, 6) & 0x80) === 0) set(m, i, 6, v | 0x80);
  }
}

function reserveFormat(m: BitMatrix) {
  // 8 bits along the right of finder TL plus 8 bits below
  for (let i = 0; i < 9; i++) {
    if ((get(m, 8, i) & 0x80) === 0) set(m, 8, i, 0x80);
    if ((get(m, i, 8) & 0x80) === 0) set(m, i, 8, 0x80);
  }
  for (let i = 0; i < 8; i++) {
    set(m, 8, m.size - 1 - i, 0x80);
    set(m, m.size - 1 - i, 8, 0x80);
  }
  // dark module
  set(m, m.size - 8, 8, 1 | 0x80);
}

function placeData(m: BitMatrix, codewords: number[], maskFn: (r: number, c: number) => number) {
  const size = m.size;
  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip vertical timing
    for (let i = 0; i < size; i++) {
      const r = upward ? size - 1 - i : i;
      for (const dc of [0, 1]) {
        const c = col - dc;
        if ((get(m, r, c) & 0x80) !== 0) continue;
        if (bitIdx >= codewords.length * 8) {
          set(m, r, c, 0);
          continue;
        }
        const byte = codewords[bitIdx >> 3];
        const bit = (byte >> (7 - (bitIdx & 7))) & 1;
        const masked = bit ^ maskFn(r, c);
        set(m, r, c, masked);
        bitIdx++;
      }
    }
    upward = !upward;
  }
}

const MASKS: Array<(r: number, c: number) => number> = [
  (r, c) => ((r + c) % 2 === 0 ? 1 : 0),
  (r) => (r % 2 === 0 ? 1 : 0),
  (_r, c) => (c % 3 === 0 ? 1 : 0),
  (r, c) => ((r + c) % 3 === 0 ? 1 : 0),
  (r, c) => ((Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0 ? 1 : 0),
  (r, c) => (((r * c) % 2) + ((r * c) % 3) === 0 ? 1 : 0),
  (r, c) => ((((r * c) % 2) + ((r * c) % 3)) % 2 === 0 ? 1 : 0),
  (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2 === 0 ? 1 : 0)
];

// BCH-encoded format strings (level L = 01) for masks 0-7
const FORMAT_BITS_L: number[] = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976
];

function placeFormat(m: BitMatrix, mask: number) {
  const bits = FORMAT_BITS_L[mask];
  for (let i = 0; i < 15; i++) {
    const v = (bits >> i) & 1;
    // top-left strip
    let r1: number, c1: number;
    if (i < 6) { r1 = 8; c1 = i; }
    else if (i === 6) { r1 = 8; c1 = 7; }
    else if (i === 7) { r1 = 8; c1 = 8; }
    else if (i === 8) { r1 = 7; c1 = 8; }
    else { r1 = 14 - i; c1 = 8; }
    set(m, r1, c1, v | 0x80);

    // bottom-left + top-right strip
    let r2: number, c2: number;
    if (i < 8) { r2 = m.size - 1 - i; c2 = 8; }
    else { r2 = 8; c2 = m.size - 15 + i; }
    set(m, r2, c2, v | 0x80);
  }
}

function rawValue(m: BitMatrix, r: number, c: number): number {
  return get(m, r, c) & 1;
}

function buildMatrix(payload: string): BitMatrix {
  const bytes = new TextEncoder().encode(payload);
  const version = pickVersion(bytes.length);
  const size = versionSize(version);
  const m = newMatrix(size);

  placeFinder(m, 0, 0);
  placeFinder(m, 0, size - 7);
  placeFinder(m, size - 7, 0);
  placeAlignment(m, version);
  placeTimingPatterns(m);
  reserveFormat(m);

  const codewords = encodeData(payload, version);

  // Try mask 0 only — good enough for our short URLs and avoids the heavy
  // penalty-scoring loop. Most readers handle any valid mask.
  const mask = 0;
  // Clear the data area (preserve reserved bits)
  for (let i = 0; i < size * size; i++) {
    if ((m.data[i] & 0x80) === 0) m.data[i] = 0;
  }
  placeData(m, codewords, MASKS[mask]);
  placeFormat(m, mask);
  return m;
}

export function renderQrSvg(payload: string, opts: { scale?: number; quiet?: number } = {}): string {
  const m = buildMatrix(payload);
  const scale = opts.scale ?? 8;
  const quiet = opts.quiet ?? 4;
  const total = (m.size + quiet * 2) * scale;
  let path = '';
  for (let r = 0; r < m.size; r++) {
    let runStart = -1;
    for (let c = 0; c < m.size; c++) {
      const v = rawValue(m, r, c);
      if (v === 1) {
        if (runStart < 0) runStart = c;
      } else if (runStart >= 0) {
        path += `M${(quiet + runStart) * scale},${(quiet + r) * scale}h${(c - runStart) * scale}v${scale}h-${(c - runStart) * scale}z`;
        runStart = -1;
      }
    }
    if (runStart >= 0) {
      path += `M${(quiet + runStart) * scale},${(quiet + r) * scale}h${(m.size - runStart) * scale}v${scale}h-${(m.size - runStart) * scale}z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
