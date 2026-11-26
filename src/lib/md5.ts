/**
 * MD5 in pure TypeScript — Web Crypto
 * covers SHA-1/256/384/512 but deliberately omits MD5, and the hash
 * tool promised md5. Straight RFC 1321 implementation (the classic
 * 64-step loop form); test vectors in
 * src/lib/__tests__/toolbox-libs.test.ts.
 */

// Per-round shift amounts (RFC 1321).
const SHIFTS = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

// K[i] = floor(abs(sin(i + 1)) * 2^32) — computed (RFC 1321), which
// rules out hand-transcription errors. IEEE-754 double sin is
// deterministic across JS engines.
const K = new Array<number>(64);
for (let i = 0; i < 64; i++) {
    K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0) as number;
}

const rotl = (x: number, c: number): number => (x << c) | (x >>> (32 - c));

/** MD5 digest of a UTF-8 string, as lowercase hex. */
export function md5(input: string): string {
    const msgBytes = [...new TextEncoder().encode(input)];
    const msgBits = msgBytes.length * 8;

    // Pad: 0x80, zeros to 56 mod 64, then the bit length LE (64-bit).
    const padded = [...msgBytes, 0x80];
    while (padded.length % 64 !== 56) padded.push(0);
    const lenLo = msgBits >>> 0;
    const lenHi = Math.floor(msgBits / 0x100000000);
    padded.push(
        lenLo & 0xff, (lenLo >>> 8) & 0xff, (lenLo >>> 16) & 0xff, (lenLo >>> 24) & 0xff,
        lenHi & 0xff, (lenHi >>> 8) & 0xff, (lenHi >>> 16) & 0xff, (lenHi >>> 24) & 0xff
    );

    let a0 = 1732584193; // 0x67452301
    let b0 = -271733879; // 0xefcdab89
    let c0 = -1732584194; // 0x98badcfe
    let d0 = 271733878; // 0x10325476

    for (let block = 0; block < padded.length; block += 64) {
        // 16 little-endian words.
        const m = new Array<number>(16);
        for (let i = 0; i < 16; i++) {
            const o = block + i * 4;
            m[i] =
                (padded[o] | (padded[o + 1] << 8) | (padded[o + 2] << 16) | (padded[o + 3] << 24)) | 0;
        }

        let aa = a0, bb = b0, cc = c0, dd = d0;
        for (let i = 0; i < 64; i++) {
            let f: number;
            let g: number;
            if (i < 16) {
                f = (bb & cc) | (~bb & dd);
                g = i;
            } else if (i < 32) {
                f = (dd & bb) | (~dd & cc);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                f = bb ^ cc ^ dd;
                g = (3 * i + 5) % 16;
            } else {
                f = cc ^ (bb | ~dd);
                g = (7 * i) % 16;
            }
            // All terms stay in signed-32-bit space; the |0 wraps the sum.
            const sum = (aa + f + K[i] + m[g]) | 0;
            aa = dd;
            dd = cc;
            cc = bb;
            bb = (bb + rotl(sum, SHIFTS[i])) | 0;
        }
        a0 = (a0 + aa) | 0;
        b0 = (b0 + bb) | 0;
        c0 = (c0 + cc) | 0;
        d0 = (d0 + dd) | 0;
    }

    // Hex, little-endian per word.
    const words = [a0, b0, c0, d0];
    let hex = "";
    for (const w of words) {
        for (let j = 0; j < 4; j++) {
            const byte = (w >>> (j * 8)) & 0xff;
            hex += byte.toString(16).padStart(2, "0");
        }
    }
    return hex;
}
