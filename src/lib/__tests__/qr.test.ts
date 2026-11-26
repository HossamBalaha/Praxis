/**
 * tests for the pure-TS QR encoder.
 *
 * The reference matrices were generated with the `qrcode` Python
 * package (byte mode, forced version + mask — the spec is
 * deterministic, so any compliant encoder must agree bit-for-bit).
 * Regenerate with scripts/qr-gen-refs.py if needed.
 */
import {describe, expect, it} from "vitest";
import {type EccLevel, encodeQr, qrToSvg} from "@/lib/qr";

interface RefCase {
    text: string;
    level: EccLevel;
    mask: number;
    version: number;
    size: number;
    hex: string;
}

const REFS: RefCase[] = [
    {
        text: "HELLO",
        level: "M",
        mask: 0,
        version: 1,
        size: 21,
        hex: "fe73fc15906e88bb7465dbaaaec13507faafe00b00aa50954310819a3f5ac42676aa005a9bf85cf047b0bab73dd219aeaa2b04c52feab380",
    },
    {
        text: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        level: "H",
        mask: 2,
        version: 4,
        size: 33,
        hex: "fec44c3fc14416106eb205abb74cc9c5dba4e7caec140de107faaaaafe01913d003aef4ef3e62758013582e481d89a1c1ae7e6b7ed276056a0135827501daaa10dad4fe376d3bef7720130ba6f01de39d6dae6e8dee925ef37e0120be4d61d73bf4eaea29c67fa005df6453f8e892bd04a65f1eba8b74fa5d7dc7e9aea788a1904a69d0cfe6d95d300",
    },
    {
        text: "D".repeat(80),
        level: "L",
        mask: 0,
        version: 7,
        size: 45,
        hex: "fe06b4ee8bfc1100f220906ea4ad2b64bb7412281eb5dba33bfa5baec115ac468107faaaaaaaafe015c3122200ef8cafbbae26eca4008809b1eb9eaeeae7b219a04a446ff96fa8f08ba48a2a92d509988b3ebc8aac3d0ca221229bfbcfbbabbde78a08880aa397faceeafe5a8a93a48aa5fd6eff0fffbc66246d2c486ad2ebcbaae111c1122312bfdcafbbbfbe22a4e488859ad79b2eea8791e9bc4a7164b2ee48f0eb90522a12de0b1d2b1ebcbaf6ac0ea22382d6abcfbbbdbd214ae8887a8291faaeef7ef19ab0a4baa9b6eeff0efe80422c6d2c4bfab2abcbaaf054c1122112babcbfbbafbdd2a4e888092ea79deeeae70569a24a426fe8efb0f0bb80",
    },
    {
        text: "E".repeat(100),
        level: "L",
        mask: 3,
        version: 10,
        size: 57,
        hex: "fe883584dc733fc136af3281ac906ebff04fc8a5cbb752e656234e25dbadb88ff85592ec10502513ae1107faaaaaaaaaaafe00431545c47100f2c3957e81364ebaacbe625ceae333c8c81945f30c52b615c10c3ae9b5a3045861578c3d02b2aaaef8218f18b77df4f22c75aa3af1ce5ac3cedbe20d20a71d049a30c19e28e3df8683956c960d045d9c2f889e451c79273f35411a710401c9c4d9c2a6d0dcbc81e61d70e7f8cd5c90472812aab554ce137ec74ec5e676cea338f7ea813fdf32ff4f115cec43ae11e7ae45f2b578cacac43a9d1f82346b3ee7c0ff2293fe5a3f19712c1b60877cd64ef1c6a8ba021ad06e381104fad78cd0d67475b6f82f24528b0e24d32971a7617507ec44cc2afbd2dbf81311d709083b79ced472a898eb414e5337ec74cc646505ea31c687ab1369732871f7a80ea4bae1b402b89f37f78ce8894199c58823423a993c104a2945c3f21d9c1081adb803bf60fe7c70fa0062ac31f38e457f9678dacd60aa904cc23c4528b1aba0f287fa77dfddd4f47242af124aeb61379d70c51905b8ea2b2a9f69fec0e23d7ec99c00",
    },
    {
        text: "Multi-block Q level",
        level: "Q",
        mask: 7,
        version: 9,
        size: 53,
        hex: "fec0fae43c23fc135dae6d81906ea84041d3b4bb755e7702edd5dba4663faf8a2ec17e67c6e37107faaaaaaaaaafe01134b18ce800579bd2fbfbaf6ae02d2f2e1a9db0817b6393fa569b9ef6ef6e2a33f5083210f7eb26d2ce9140a331ac08d39ef4dee7846609ab4a646e3f1d6e0c7971c49ec008c007b2c64e01d8b95f4873513403720139ae1a59d524a670ba25d2dada0bb2aea82ea57a122a756403830f9bf9fb94efb14523b450e64466b2de2b88aeb39178771a485180fe922fa2a1fa400b56cd9b30cbcf2ce714bae9d1b092d7e2155abe45bf9004b37204fffbf1e04031a246fa648271d1c7a4678ce244ab198f5769a0eecf8f7b7c5d075d7d83d793cb3e8e1c9346b708c3f4c4e7b30ea32bc2b2a57f3f3789aafa2daf1ac081969eed7d112bbf1fc62cfc805105c72d1c6ffbfefeaf58ead05dd1f1d9ed1eba5238feff0ff5d6b47d0b49336e872091075feb05286b6ca4b86fe556bc9d464f00",
    },
];

function matrixToHex(modules: boolean[][]): string {
    const bits = modules.map((row) => row.map((b) => (b ? "1" : "0")).join("")).join("");
    let out = "";
    for (let i = 0; i < bits.length; i += 8) {
        out += parseInt(bits.slice(i, i + 8).padEnd(8, "0"), 2)
            .toString(16)
            .padStart(2, "0");
    }
    return out;
}

describe("encodeQr (pure-TS QR encoder)", () => {
    it.each(REFS)("matches the reference matrix for $text", (ref) => {
        const out = encodeQr(ref.text, {level: ref.level, mask: ref.mask, version: ref.version});
        expect(out.size).toBe(ref.size);
        expect(out.version).toBe(ref.version);
        expect(out.mask).toBe(ref.mask);
        expect(matrixToHex(out.modules)).toBe(ref.hex);
    });

    it("picks the smallest version that fits (auto)", () => {
        expect(encodeQr("HELLO").version).toBe(1);
        expect(encodeQr("A".repeat(30), {level: "H"}).version).toBe(4);
        expect(encodeQr("https://example.com/some/path?query=1&x=2", {level: "L"}).version).toBe(3);
        expect(encodeQr("The quick brown fox jumps over the lazy dog 0123456789", {level: "M"}).version).toBe(4);
    });

    it("encodes unicode text (byte mode, UTF-8)", () => {
        const out = encodeQr("Praxis — Σ rue du Québec 🐍", {level: "M"});
        expect(out.size).toBeGreaterThan(21);
        // Finder patterns survive in every corner.
        const corner = (ox: number, oy: number) => out.modules[oy + 2][ox + 3];
        expect(corner(0, 0)).toBe(true);
        expect(corner(out.size - 7, 0)).toBe(true);
        expect(corner(0, out.size - 7)).toBe(true);
        // The dark module is dark.
        expect(out.modules[out.size - 8][8]).toBe(true);
    });

    it("rejects text that cannot fit", () => {
        expect(() => encodeQr("x".repeat(500), {level: "H", version: 13})).toThrow(/fit/i);
        expect(() => encodeQr("HELLO", {version: 20})).toThrow(/1-13/);
    });

    it("auto mask stays within 0-7 and produces the same structure", () => {
        const out = encodeQr("auto-mask check");
        expect(out.mask).toBeGreaterThanOrEqual(0);
        expect(out.mask).toBeLessThanOrEqual(7);
        // Timing row alternates (col 8 dark, col 9 light … between finders).
        expect(out.modules[6][8]).toBe(true);
        expect(out.modules[6][9]).toBe(false);
        expect(out.modules[8][6]).toBe(true);
    });

    it("renders scannable-looking SVG output", () => {
        const svg = qrToSvg(encodeQr("svg"), {margin: 2, cellSize: 3});
        expect(svg).toMatch(/^<svg/);
        expect(svg).toContain("</svg>");
        expect(svg).toContain("M6,6h3v3h-3z"); // first dark module cell
    });
});
