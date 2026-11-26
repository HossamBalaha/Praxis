/**
 * tests for the pure helpers in
 * toolbox-more.ts (plus the toolbox QR encoder's lib-level facts).
 * Reference values: CRC-32 / Roman / morse / WCAG / semver / subnet
 * vectors are cross-checked against well-known standards.
 */
import {describe, expect, it} from "vitest";
import {
    asciiTable,
    buildGitignore,
    chmodFromSymbolic,
    chmodToSymbolic,
    cleanText,
    compareSemver,
    contrastRatio,
    crackTimeEstimate,
    crc32,
    cssBoxShadow,
    cssLinearGradient,
    csvToMarkdownTable,
    escapeString,
    formatDotenv,
    formatDuration,
    fromRoman,
    generatePassword,
    hexDump,
    jsonToTypes,
    jwtSignHs256,
    morseDecode,
    morseEncode,
    nanoid,
    parseDotenv,
    parseDuration,
    parseSemver,
    parseSubnet,
    passwordEntropyBits,
    reverseText,
    semverSatisfies,
    slugify,
    svgPlaceholder,
    toNato,
    toRoman,
    transformLines,
    ulid,
    uuidv7,
    wcagRating,
} from "../toolbox-more";

describe("crc32", () => {
    it("matches the classic vectors", () => {
        expect(crc32("123456789")).toBe("cbf43926");
        expect(crc32("hello")).toBe("3610a686");
        expect(crc32("")).toBe("00000000");
    });
});

describe("jwtSignHs256", () => {
    it("produces three base64url segments and a stable signature", async () => {
        const a = await jwtSignHs256({sub: "u1", role: "dev"}, "topsecret", 60);
        const b = await jwtSignHs256({sub: "u1", role: "dev"}, "topsecret", 60);
        expect(a.split(".")).toHaveLength(3);
        expect(a).toBe(b);
        const header = JSON.parse(atob(a.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
        expect(header).toEqual({alg: "HS256", typ: "JWT"});
        const payload = JSON.parse(atob(a.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        expect(payload.sub).toBe("u1");
        expect(payload.exp).toBeGreaterThan(0);
    });
    it("differs with a different secret", async () => {
        const a = await jwtSignHs256({x: 1}, "s1");
        const b = await jwtSignHs256({x: 1}, "s2");
        expect(a.split(".")[2]).not.toBe(b.split(".")[2]);
    });
});

describe("identifiers", () => {
    it("uuidv7 is RFC-4122 shaped and monotonic", () => {
        const a = uuidv7(1730000000000);
        const b = uuidv7(1730000000001);
        expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(b > a).toBe(true);
        expect(a.slice(0, 8)).toBe(b.slice(0, 8)); // same ~ms prefix
    });
    it("ulid is 26 chars of Crockford base32, sortable", () => {
        const a = ulid(1000);
        const b = ulid(2000);
        expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(b > a).toBe(true);
    });
    it("nanoid uses the requested length", () => {
        expect(nanoid(10)).toHaveLength(10);
        expect(nanoid(21)).toMatch(/^[-_A-Za-z0-9]{21}$/);
    });
});

describe("password generator", () => {
    const seq = () => {
        let x = 42;
        return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
    };
    it("honors the options and includes every chosen set", () => {
        const pw = generatePassword({length: 24, lower: true, upper: true, digits: true, symbols: true}, seq());
        expect(pw).toHaveLength(24);
        expect(pw).toMatch(/[a-z]/);
        expect(pw).toMatch(/[A-Z]/);
        expect(pw).toMatch(/[0-9]/);
        expect(pw).toMatch(/[^A-Za-z0-9]/);
    });
    it("respects the ambiguous-exclusion flag", () => {
        const pw = generatePassword(
            {length: 200, lower: true, upper: true, digits: true, symbols: false, excludeAmbiguous: true},
            seq()
        );
        expect(pw).not.toMatch(/[Il1O0o5S2Z|`'\\]/);
    });
    it("computes entropy and a human estimate", () => {
        expect(passwordEntropyBits("abcd")).toBe(19); // 4 × log2(26)
        expect(passwordEntropyBits("Ab3!")).toBe(25); // 4 × log2(95)
        expect(passwordEntropyBits("A1b2C3d4E5f6")).toBe(79);
        expect(crackTimeEstimate(4)).toContain("instantly");
        expect(crackTimeEstimate(80)).toMatch(/year|millennium|universe/);
    });
});

describe("text tools", () => {
    it("slugify folds accents and separators", () => {
        expect(slugify("Über schnelle Bäume!")).toBe("uber-schnelle-baume");
        expect(slugify("  Hello, Praxis World?  ")).toBe("hello-praxis-world");
        expect(slugify("API_V2 reference")).toBe("api-v2-reference");
    });
    it("transformLines sorts, uniques, numbers", () => {
        const out = transformLines("b\na\nb\n\na", {
            sort: "alpha", unique: true, trim: true, removeEmpty: true, reverse: false, addLineNumbers: true,
        });
        expect(out).toBe("1 a\n2 b");
    });
    it("reverseText handles chars, words and lines", () => {
        expect(reverseText("Praxis", "chars")).toBe("sixarP");
        expect(reverseText("the quick brown", "words")).toBe("brown quick the");
        expect(reverseText("one\ntwo", "lines")).toBe("two\none");
    });
    it("escapeString escapes per target language", () => {
        expect(escapeString('say "hi"\n', "json")).toBe('say "hi"\\n');
        expect(escapeString("a.b*c", "regex")).toBe("a\\.b\\*c");
        expect(escapeString("it's", "sql")).toBe("it''s");
        expect(escapeString("a b&c", "url-query")).toBe("a%20b%26c");
    });
    it("csvToMarkdownTable renders a GFM table", () => {
        expect(csvToMarkdownTable("name,age\nAda,36\nBob,unknown")).toBe(
            "| name | age |\n| --- | --- |\n| Ada | 36 |\n| Bob | unknown |"
        );
    });
    it("cleanText trims, collapses and normalizes", () => {
        expect(
            cleanText("  a \t b  \n\n\u201Cquoted\u201D\u2026\n", {
                trimLines: true, collapseSpaces: true, removeBlankLines: true, normalizeQuotes: true,
            })
        ).toBe('a b\n"quoted"...');
    });
    it("hexDump renders offset/hex/ascii columns", () => {
        const out = hexDump("AB", 16);
        expect(out).toMatch(/^00000000  41 42/);
        expect(out).toContain("|AB|");
    });
    it("asciiTable renders a box-drawing table", () => {
        const out = asciiTable([["k", "v"], ["a", "1"]]);
        expect(out.split("\n")[0]).toBe("┌───┬───┐");
        expect(out).toContain("│ k │ v │");
        expect(out.split("\n").at(-1)).toBe("└───┴───┘");
    });
});

describe("duration", () => {
    it("formatDuration humanizes", () => {
        expect(formatDuration(0)).toBe("0ms");
        expect(formatDuration(1500)).toBe("1s500ms");
        expect(formatDuration(5400000)).toBe("1h30m");
        expect(formatDuration(-86400000)).toBe("-1d");
    });
    it("parseDuration accepts compound strings", () => {
        expect(parseDuration("1h 30m")).toBe(5400000);
        expect(parseDuration("90 s")).toBe(90000);
        expect(parseDuration("2 days")).toBe(172800000);
        expect(parseDuration("45")).toBe(45000);
        expect(parseDuration("junk")).toBeNull();
    });
});

describe("semver", () => {
    it("parses versions with prerelease", () => {
        expect(parseSemver("1.2.3")).toEqual({major: 1, minor: 2, patch: 3, prerelease: []});
        expect(parseSemver("v2.0.0-rc.1")).toEqual({major: 2, minor: 0, patch: 0, prerelease: ["rc", "1"]});
        expect(parseSemver("not-a-version")).toBeNull();
    });
    it("orders versions including prerelease precedence", () => {
        expect(compareSemver(parseSemver("1.2.3")!, parseSemver("1.2.4")!)).toBeLessThan(0);
        expect(compareSemver(parseSemver("1.2.3")!, parseSemver("1.2.3")!)).toBe(0);
        expect(compareSemver(parseSemver("1.0.0")!, parseSemver("1.0.0-alpha")!)).toBeGreaterThan(0);
        expect(compareSemver(parseSemver("1.0.0-alpha")!, parseSemver("1.0.0-alpha.1")!)).toBeLessThan(0);
    });
    it("checks ranges", () => {
        expect(semverSatisfies("^1.2.0", "1.9.9")).toBe(true);
        expect(semverSatisfies("^1.2.0", "2.0.0")).toBe(false);
        expect(semverSatisfies("~4.0.0", "4.0.9")).toBe(true);
        expect(semverSatisfies("~4.0.0", "4.1.0")).toBe(false);
        expect(semverSatisfies(">=2.1", "2.1.5")).toBe(true);
        expect(semverSatisfies("<2", "1.9.0")).toBe(true);
        expect(semverSatisfies("=3.0.0", "3.0.0")).toBe(true);
    });
});

describe("chmod", () => {
    it("converts octal → symbolic", () => {
        expect(chmodToSymbolic("755")).toBe("rwxr-xr-x");
        expect(chmodToSymbolic("644")).toBe("rw-r--r--");
        expect(chmodToSymbolic("777")).toBe("rwxrwxrwx");
        expect(chmodToSymbolic("0o600")).toBe("rw-------");
    });
    it("converts symbolic → octal (round-trip)", () => {
        expect(chmodFromSymbolic("rwxr-xr-x")).toBe("755");
        expect(chmodFromSymbolic("rw-r--r--")).toBe("644");
        expect(chmodToSymbolic(chmodFromSymbolic("rwxr-x---"))).toBe("rwxr-x---");
    });
});

describe("roman numerals", () => {
    it("round-trips", () => {
        for (const n of [1, 4, 9, 14, 40, 49, 90, 400, 444, 1987, 2024, 3999]) {
            expect(fromRoman(toRoman(n))).toBe(n);
        }
        expect(toRoman(2024)).toBe("MMXXIV");
    });
    it("rejects out-of-range and non-canonical forms", () => {
        expect(() => toRoman(0)).toThrow();
        expect(() => toRoman(4000)).toThrow();
        expect(() => fromRoman("IIII")).toThrow();
        expect(() => fromRoman("ABC")).toThrow();
    });
});

describe("morse + NATO", () => {
    it("round-trips morse", () => {
        expect(morseEncode("SOS")).toBe("... --- ...");
        expect(morseDecode("... --- ...")).toBe("SOS");
        expect(morseEncode("HELLO WORLD")).toBe(".... . .-.. .-.. --- / .-- --- .-. .-.. -..");
        expect(morseDecode(".... . .-.. .-.. --- / .-- --- .-. .-.. -..")).toBe("HELLO WORLD");
    });
    it("maps NATO phonetics", () => {
        expect(toNato("abc")).toBe("Alfa Bravo Charlie");
        expect(toNato("hello 9")).toContain("Hotel");
        expect(toNato("hello 9")).toContain("Nine");
    });
});

describe("color contrast", () => {
    it("matches known WCAG ratios", () => {
        expect(contrastRatio({r: 0, g: 0, b: 0}, {r: 255, g: 255, b: 255})).toBe(21);
        expect(contrastRatio({r: 255, g: 255, b: 255}, {r: 255, g: 255, b: 255})).toBe(1);
        // #777 on white ≈ 4.47:1
        expect(contrastRatio({r: 119, g: 119, b: 119}, {r: 255, g: 255, b: 255})).toBeCloseTo(4.47, 1);
        expect(wcagRating(21)).toContain("AAA");
        expect(wcagRating(3.1)).toBe("AA large text only");
        expect(wcagRating(1.5)).toBe("fail");
    });
});

describe("css generators", () => {
    it("builds gradients and shadows", () => {
        expect(cssLinearGradient(90, [{color: "#fff"}, {color: "#000", position: 100}])).toBe(
            "linear-gradient(90deg, #fff, #000 100%)"
        );
        expect(
            cssBoxShadow({x: 4, y: 6, blur: 10, spread: 0, color: "rgba(0,0,0,.3)", inset: false})
        ).toBe("4px 6px 10px 0px rgba(0,0,0,.3)");
        expect(cssBoxShadow({
            x: 0,
            y: 2,
            blur: 4,
            spread: 0,
            color: "red",
            inset: true
        }, 2)).toContain("inset 0px 2px 4px 0px red");
    });
    it("builds a placeholder SVG", () => {
        const svg = svgPlaceholder({width: 320, height: 200, text: "Hero"});
        expect(svg).toContain('width="320"');
        expect(svg).toContain(">Hero</text>");
        expect(svgPlaceholder({width: 40, height: 40})).toContain(">40×40</text>");
    });
});

describe("subnet calculator", () => {
    it("solves a /24", () => {
        const s = parseSubnet("192.168.1.130/24")!;
        expect(s.network).toBe("192.168.1.0");
        expect(s.broadcast).toBe("192.168.1.255");
        expect(s.firstHost).toBe("192.168.1.1");
        expect(s.lastHost).toBe("192.168.1.254");
        expect(s.hosts).toBe(254);
        expect(s.class).toBe("C");
        expect(s.private).toBe(true);
    });
    it("solves a /30 and /32", () => {
        expect(parseSubnet("10.0.0.0/30")!.hosts).toBe(2);
        expect(parseSubnet("8.8.8.8/32")!.hosts).toBe(1);
        expect(parseSubnet("8.8.8.8/32")!.broadcast).toBe("8.8.8.8");
    });
    it("rejects malformed input", () => {
        expect(parseSubnet("999.1.1.1/24")).toBeNull();
        expect(parseSubnet("abc")).toBeNull();
        expect(parseSubnet("1.2.3.4/40")).toBeNull();
    });
});

describe("jsonToTypes", () => {
    it("emits nested interfaces with arrays", () => {
        const out = jsonToTypes({user: {name: "Ada", tags: ["a", "b"], active: true}}, "Root");
        expect(out).toContain("export interface RootUser {");
        expect(out).toContain("name: string;");
        expect(out).toContain("tags: string[];");
        expect(out).toContain("active: boolean;");
    });
    it("quotes non-identifier keys", () => {
        const out = jsonToTypes({"created-at": "x"}, "Root");
        expect(out).toContain('"created-at": string;');
    });
});

describe("gitignore + dotenv", () => {
    it("merges templates without duplicates", () => {
        const out = buildGitignore(["node", "python"]);
        expect(out).toContain("# Node.js");
        expect(out).toContain("# Python");
        const nodeModules = out.match(/node_modules\//g);
        expect(nodeModules?.length).toBe(1);
        expect(buildGitignore([])).toBe("");
    });
    it("parses and formats dotenv", () => {
        const parsed = parseDotenv("# db\nDB_HOST=localhost # where\nexport SECRET=abc\n\nplain=x");
        expect(parsed.find((p) => p.key === "DB_HOST")?.value).toBe("localhost");
        expect(parsed.find((p) => p.key === "SECRET")?.value).toBe("abc");
        const out = formatDotenv("# db\nB=2\nA=1", {sort: true, uppercase: false, quote: false, groupBlank: false});
        expect(out).toBe("A=1\nB=2\n");
    });
});
