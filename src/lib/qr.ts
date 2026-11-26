/**
 * a compact, dependency-free QR code
 * encoder (byte mode, EC levels L/M/Q/H, versions 1-13 auto-selected).
 *
 * Pure TypeScript, no npm dependency — the toolbox's "QR code
 * generator" needed to stay offline and dependency-free. The output
 * is a boolean matrix (true = dark module) the caller can render as
 * SVG / canvas.
 *
 * Verified against the reference `qrcode` Python package: with the
 * version + error-correction level + mask forced, the matrices are
 * bit-identical (see src/lib/__tests__/qr.test.ts).
 *
 * Structure follows the ISO/IEC 18004 spec (the well-known Nayuki
 * layout): segment encoding → Reed-Solomon over GF(2^8) → block
 * interleaving → module placement → masking with penalty scoring →
 * format/version BCH info.
 */

export type EccLevel = "L" | "M" | "Q" | "H";

const ECC_ORDER: EccLevel[] = ["L", "M", "Q", "H"];

/** 2-bit code used in the format info (spec order L, M, Q, H). */
const ECC_FORMAT_BITS: Record<EccLevel, number> = {L: 0b01, M: 0b00, Q: 0b11, H: 0b10};

/* Error-correction codewords per block, indexed [level][version].
 * Values for versions 1..13, cross-checked against the reference
 * `qrcode` Python package's RS_BLOCK_TABLE (spec tables 13-22). */
const ECC_CODEWORDS_PER_BLOCK: Record<EccLevel, number[]> = {
    L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 26, 18, 20, 24, 26],
    M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22],
    Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24],
    H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22],
};

/* Number of error-correction blocks, indexed [level][version]. */
const NUM_ERROR_CORRECTION_BLOCKS: Record<EccLevel, number[]> = {
    L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4],
    M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9],
    Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12],
    H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16],
};

const MAX_VERSION = 13; // byte-mode capacity 382 chars at L — plenty for a toolbox

/** Total data modules available at a version (function patterns excluded). */
function numRawDataModules(version: number): number {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
        const numAlign = Math.floor(version / 7) + 2;
        result -= (25 * numAlign - 10) * numAlign - 55;
        if (version >= 7) result -= 36; // version info blocks
    }
    return result;
}

/** Number of 8-bit data codewords (ECC excluded) for level + version. */
function numDataCodewords(version: number, level: EccLevel): number {
    return (
        Math.floor(numRawDataModules(version) / 8) -
        ECC_CODEWORDS_PER_BLOCK[level][version] * NUM_ERROR_CORRECTION_BLOCKS[level][version]
    );
}

/* ── Reed-Solomon over GF(2^8), primitive polynomial 0x11D ────────── */

/** Multiply two field elements. */
function reedSolomonMultiply(x: number, y: number): number {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
}

function rsComputeDivisor(degree: number): number[] {
    const result: number[] = new Array<number>(degree).fill(0);
    result[degree - 1] = 1; // monomial x^0
    let root = 1;
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < degree; j++) {
            result[j] = reedSolomonMultiply(result[j], root);
            if (j + 1 < degree) result[j] ^= result[j + 1];
        }
        root = reedSolomonMultiply(root, 2);
    }
    return result;
}

/** Remainder of data * x^degree divided by the divisor. */
function rsComputeRemainder(data: readonly number[], divisor: readonly number[]): number[] {
    const result = new Array<number>(divisor.length).fill(0);
    for (const b of data) {
        const factor = b ^ (result.shift() ?? 0);
        result.push(0);
        divisor.forEach((coef, i) => {
            result[i] ^= reedSolomonMultiply(coef, factor);
        });
    }
    return result;
}

/* ── Bit buffer + byte-mode segment encoding ──────────────────────── */

class BitBuffer {
    private bits: number[] = [];

    get length(): number {
        return this.bits.length;
    }

    append(value: number, length: number): void {
        for (let i = length - 1; i >= 0; i--) {
            this.bits.push((value >>> i) & 1);
        }
    }

    toBytes(): number[] {
        const out: number[] = [];
        for (let i = 0; i + 7 < this.bits.length; i += 8) {
            let b = 0;
            for (let j = 0; j < 8; j++) b = (b << 1) | this.bits[i + j];
            out.push(b);
        }
        // remaining bits (< 8) are left off — padding below completes them
        const rem = this.bits.length % 8;
        if (rem !== 0) {
            let b = 0;
            for (let j = 0; j < rem; j++) b = (b << 1) | this.bits[this.bits.length - rem + j];
            out.push(b << (8 - rem));
        }
        return out;
    }
}

/** Pick the smallest version whose byte-mode capacity fits `text`. */
function pickVersion(text: string, level: EccLevel): number {
    const data = new TextEncoder().encode(text);
    for (let v = 1; v <= MAX_VERSION; v++) {
        const capBits = numDataCodewords(v, level) * 8;
        const ccBits = v <= 9 ? 8 : 16; // byte-mode count bits
        const need = 4 + ccBits + data.length * 8;
        if (need <= capBits) return v;
    }
    throw new Error(
        `Text too long for a version-${MAX_VERSION} QR code at level ${level} (${data.length} bytes).`
    );
}

/* ── The encoder ──────────────────────────────────────────────────── */

export interface QrResult {
    /** Module count per side (version*4 + 17). */
    size: number;
    /** Matrix of true = dark. */
    modules: boolean[][];
    version: number;
    level: EccLevel;
    mask: number;
}

export interface QrOptions {
    level?: EccLevel;
    /** Force the mask (0-7) — used by the tests to compare against a
     * reference encoder. Default: auto (lowest penalty). */
    mask?: number;
    /** Force the version (1-13). Default: smallest that fits. */
    version?: number;
}

export function encodeQr(text: string, options: QrOptions = {}): QrResult {
    const level = options.level ?? "M";
    const version = options.version ?? pickVersion(text, level);
    if (version < 1 || version > MAX_VERSION) throw new Error(`version must be 1-${MAX_VERSION}`);

    // 1. Data codewords (byte segment).
    const data = new TextEncoder().encode(text);
    const ccBits = version <= 9 ? 8 : 16;
    if (4 + ccBits + data.length * 8 > numDataCodewords(version, level) * 8) {
        throw new Error(`text does not fit a version-${version} level-${level} QR code`);
    }
    const buf = new BitBuffer();
    buf.append(0b0100, 4); // byte mode
    buf.append(data.length, ccBits);
    for (const b of data) buf.append(b, 8);

    // Terminator + bit/byte padding.
    const capacityBits = numDataCodewords(version, level) * 8;
    buf.append(0, Math.min(4, capacityBits - buf.length));
    buf.append(0, (8 - (buf.length % 8)) % 8);
    const bytes = buf.toBytes();
    const pad = [0xec, 0x11];
    for (let i = 0; bytes.length < numDataCodewords(version, level); i++) {
        bytes.push(pad[i % 2]);
    }

    // 2. Split into blocks; compute ECC; interleave.
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[level][version];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[level][version];
    const rawCodewords = Math.floor(numRawDataModules(version) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: number[][] = [];
    const eccBlocks: number[][] = [];
    const divisor = rsComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
        const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
        const block = bytes.slice(k, k + dataLen);
        k += dataLen;
        blocks.push(block);
        eccBlocks.push(rsComputeRemainder(block, divisor));
    }

    const interleaved: number[] = [];
    const maxLen = Math.max(...blocks.map((b) => b.length));
    for (let i = 0; i < maxLen; i++) {
        for (const b of blocks) if (i < b.length) interleaved.push(b[i]);
    }
    for (let i = 0; i < blockEccLen; i++) {
        for (const e of eccBlocks) interleaved.push(e[i]);
    }

    // 3. Draw modules.
    const size = version * 4 + 17;
    const modules: boolean[][] = Array.from({length: size}, () => new Array<boolean>(size).fill(false));
    const isFunction: boolean[][] = Array.from({length: size}, () => new Array<boolean>(size).fill(false));

    const setModule = (x: number, y: number, dark: boolean) => {
        if (x < 0 || y < 0 || x >= size || y >= size) return;
        modules[y][x] = dark;
        isFunction[y][x] = true;
    };
    const setFunctionModule = (x: number, y: number, dark: boolean) => setModule(x, y, dark);

    // Timings first (they determine the odd/even pattern; finders below
    // overwrite their intersections).
    for (let i = 0; i < size; i++) {
        setFunctionModule(6, i, i % 2 === 0);
        setFunctionModule(i, 6, i % 2 === 0);
    }

    // Finder patterns + separators (3 corners).
    const drawFinder = (cx: number, cy: number) => {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const dist = Math.max(Math.abs(dx), Math.abs(dy));
                const x = cx + dx;
                const y = cy + dy;
                if (x < 0 || y < 0 || x >= size || y >= size) continue;
                setModule(x, y, dist !== 2 && dist !== 4);
            }
        }
    };
    drawFinder(3, 3);
    drawFinder(size - 4, 3);
    drawFinder(3, size - 4);

    // Alignment patterns (versions >= 2), skipping the 3 finder corners.
    const numAlign = Math.floor(version / 7) + 2;
    if (version >= 2) {
        const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
        // Standard alignment positions: 6, then step increments, then size-7.
        const positions = [6];
        for (let pos = size - 7; positions.length < numAlign; pos -= step) positions.splice(1, 0, pos);
        for (let i = 0; i < numAlign; i++) {
            for (let j = 0; j < numAlign; j++) {
                if (
                    (i === 0 && j === 0) ||
                    (i === 0 && j === numAlign - 1) ||
                    (i === numAlign - 1 && j === 0)
                ) {
                    continue; // overlaps a finder
                }
                const cx = positions[i];
                const cy = positions[j];
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        setModule(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
                    }
                }
            }
        }
    }

    // Reserve the format-info strips: draw them immediately with a dummy
    // mask (0) — this marks exactly the right cells as function modules
    // (the timing cells at (col 8, row 6) and (row 8, col 6) are NOT
    // part of the format strip and keep their timing value). The real
    // format bits are redrawn once the final mask is known.
    const drawFormatBits = (m: number) => {
        const dataBits = (ECC_FORMAT_BITS[level] << 3) | m;
        let rem = dataBits;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const bits = ((dataBits << 10) | rem) ^ 0x5412;
        const bitAt = (i: number) => ((bits >>> i) & 1) !== 0;
        for (let i = 0; i <= 5; i++) setModule(8, i, bitAt(i));
        setModule(8, 7, bitAt(6));
        setModule(8, 8, bitAt(7));
        setModule(7, 8, bitAt(8));
        for (let i = 9; i < 15; i++) setModule(14 - i, 8, bitAt(i));
        for (let i = 0; i <= 7; i++) setModule(size - 1 - i, 8, bitAt(i));
        for (let i = 8; i < 15; i++) setModule(8, size - 15 + i, bitAt(i));
        setModule(8, size - 8, true); // dark module — always dark
    };
    drawFormatBits(0);

    // Version info blocks (versions >= 7).
    if (version >= 7) {
        let rem = version;
        for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        const bits = (version << 12) | ((rem & ((1 << 12) - 1)) << 0);
        for (let i = 0; i < 18; i++) {
            const dark = ((bits >>> i) & 1) !== 0;
            const a = size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            setModule(a, b, dark);
            setModule(b, a, dark);
        }
    }

    // 4. Place the interleaved codewords (zigzag).
    let mask = options.mask ?? -1;
    const applyMask = (m: number) => {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (isFunction[y][x]) continue;
                const invert = maskFunc(m, x, y);
                if (invert) modules[y][x] = !modules[y][x];
            }
        }
    };
    const drawCodewords = (codewords: readonly number[]) => {
        let i = 0;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (let vert = 0; vert < size; vert++) {
                for (let j = 0; j < 2; j++) {
                    const x = right - j;
                    const upward = ((right + 1) & 2) === 0;
                    const y = upward ? size - 1 - vert : vert;
                    if (isFunction[y][x] || i >= codewords.length * 8) continue;
                    modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
                    i++;
                }
            }
        }
    };

    if (mask >= 0) {
        // Forced mask (tests): draw data, mask once, format bits.
        drawCodewords(interleaved);
        applyMask(mask);
        drawFormatBits(mask);
    } else {
        // Auto: try every mask, keep the lowest-penalty matrix.
        let bestModules: boolean[][] | null = null;
        let bestMask = 0;
        let bestPenalty = Infinity;
        const pristine = modules.map((row) => [...row]);
        for (let m = 0; m < 8; m++) {
            // Reset the data+format area to the pristine (function-only) grid.
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    modules[y][x] = pristine[y][x];
                }
            }
            drawCodewords(interleaved);
            applyMask(m);
            drawFormatBits(m);
            const p = penalty(modules);
            if (p < bestPenalty) {
                bestPenalty = p;
                bestModules = modules.map((row) => [...row]);
                bestMask = m;
            }
        }
        if (bestModules) {
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    modules[y][x] = bestModules[y][x];
                }
            }
            mask = bestMask;
        }
        drawFormatBits(mask);
    }

    return {size, modules, version, level, mask};
}

/* ── Mask predicates ──────────────────────────────────────────────── */

function maskFunc(m: number, x: number, y: number): boolean {
    switch (m) {
        case 0:
            return (x + y) % 2 === 0;
        case 1:
            return y % 2 === 0;
        case 2:
            return x % 3 === 0;
        case 3:
            return (x + y) % 3 === 0;
        case 4:
            return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
        case 5:
            return ((x * y) % 2) + ((x * y) % 3) === 0;
        case 6:
            return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
        case 7:
            return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        default:
            throw new Error("invalid mask");
    }
}

/* ── Penalty scoring (spec 8.8.2) ─────────────────────────────────── */

function penalty(modules: boolean[][]): number {
    const size = modules.length;
    let result = 0;

    // Rule 1 — runs of 5+.
    const runPenalty = (getter: (i: number, j: number) => boolean, len: number) => {
        for (let i = 0; i < len; i++) {
            let run = 1;
            let prev = getter(i, 0);
            for (let j = 1; j < len; j++) {
                const cur = getter(i, j);
                if (cur === prev) {
                    run++;
                    if (run === 5) result += 3;
                    else if (run > 5) result += 1;
                } else {
                    run = 1;
                    prev = cur;
                }
            }
        }
    };
    runPenalty((i, j) => modules[i][j], size); // rows
    runPenalty((i, j) => modules[j][i], size); // columns

    // Rule 2 — 2×2 blocks.
    for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
            const c = modules[y][x];
            if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
                result += 3;
            }
        }
    }

    // Rule 3 — finder-like patterns (both polarities).
    const FINDER = [true, false, false, false, true, true, true, false, false, false, true];
    const checkRun = (get: (i: number) => boolean, len: number) => {
        for (let i = 0; i + 11 <= len; i++) {
            let matchA = true;
            let matchB = true;
            for (let k = 0; k < 11; k++) {
                const v = get(i + k);
                if (v !== FINDER[k]) matchA = false;
                if (v !== !FINDER[k]) matchB = false;
            }
            if (matchA || matchB) result += 40;
        }
    };
    for (let y = 0; y < size; y++) checkRun((i) => modules[y][i], size);
    for (let x = 0; x < size; x++) checkRun((i) => modules[i][x], size);

    // Rule 4 — dark/light proportion.
    let dark = 0;
    for (const row of modules) for (const cell of row) if (cell) dark++;
    const total = size * size;
    const k = Math.floor((Math.abs(dark * 2 - total) * 10) / total);
    result += k * 10;
    return result;
}

/* ── SVG rendering helper (toolbox display) ────────────────────────── */

export function qrToSvg(result: QrResult, opts: { margin?: number; cellSize?: number } = {}): string {
    const margin = opts.margin ?? 4;
    const cell = opts.cellSize ?? 4;
    const dim = (result.size + margin * 2) * cell;
    const parts: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">`,
        `<rect width="${dim}" height="${dim}" fill="#ffffff"/>`,
        `<path fill="#000000" d="`,
    ];
    for (let y = 0; y < result.size; y++) {
        for (let x = 0; x < result.size; x++) {
            if (result.modules[y][x]) {
                parts.push(`M${(x + margin) * cell},${(y + margin) * cell}h${cell}v${cell}h-${cell}z`);
            }
        }
    }
    parts.push(`"/></svg>`);
    return parts.join("");
}

/** Exported for tests: is a level string valid? */
export function isEccLevel(v: string): v is EccLevel {
    return ECC_ORDER.includes(v as EccLevel);
}
