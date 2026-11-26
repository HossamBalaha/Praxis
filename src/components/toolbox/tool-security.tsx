"use client";

/**
 * tool-security.tsx — the "Security" toolbox category (base tools;
 * the registry's boosts keep the category ≥ 30 — see dev-toolbox.tsx).
 * WebCrypto digests / HMAC / AES-GCM / PBKDF2 (async — the factory
 * awaits them), plus the classic hand ciphers and check-digit
 * families. All offline; nothing leaves the tab.
 */

import {makeTextTool, type TextToolSpec} from "./tool-factory";

const te = new TextEncoder();
const hex = (buf: ArrayBuffer): string =>
    [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (buf: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0));
const fromHex = (s: string): Uint8Array => {
    const clean = s.trim().replace(/[\s:-]/g, "").replace(/^0x/i, "");
    if (clean.length % 2 !== 0) throw new Error("Hex string has an odd length.");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
};

async function digest(algo: string, data: Uint8Array): Promise<ArrayBuffer> {
    return await crypto.subtle.digest(algo, data as unknown as BufferSource);
}

const caesar = (text: string, shift: number): string =>
    text.replace(/[a-zA-Z]/g, (c) => {
        const base = c <= "Z" ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + shift % 26 + 26) % 26) + base);
    });
const vigenere = (text: string, key: string, decode: boolean): string => {
    const k = key.replace(/[^a-zA-Z]/g, "").toUpperCase();
    if (!k) throw new Error("Key must contain letters.");
    let ki = 0;
    return text.replace(/[a-zA-Z]/g, (c) => {
        const shift = k.charCodeAt(ki % k.length) - 65;
        ki++;
        return caesar(c, decode ? -shift : shift);
    });
};

export const SECURITY_TOOLS: TextToolSpec[] = [
    {
        id: "sha-digest",
        label: "SHA-1 / 256 / 384 / 512",
        description: "WebCrypto digests of the input — hex + base64 for each algorithm.",
        sample: "praxis",
        options: [{
            key: "algo",
            label: "Algorithm",
            kind: "select",
            choices: [["SHA-1", "SHA-1"], ["SHA-256", "SHA-256"], ["SHA-384", "SHA-384"], ["SHA-512", "SHA-512"]],
            default: "SHA-256"
        }],
        transform: async (input, o) => {
            const algo = String(o.algo || "SHA-256");
            const buf = await digest(algo, te.encode(input));
            return `${algo}\n  hex    ${hex(buf)}\n  base64 ${b64(buf)}`;
        },
        note: "Runs in the browser's native WebCrypto — no library, no network.",
    },
    {
        id: "hash-all",
        label: "All Digests At Once",
        description: "MD5 + CRC-32 + the whole SHA family in one table — the fingerprint sheet.",
        sample: "praxis",
        transform: async (input) => {
            const data = te.encode(input);
            const shaNames = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const;
            const rows = await Promise.all(
                shaNames.map(async (n) => ({n, h: hex(await digest(n, data))}))
            );
            const {md5} = await import("@/lib/md5");
            const {crc32} = await import("@/lib/toolbox-more");
            const out = [`md5      ${md5(input)}`, `crc32    ${crc32(input)}`];
            for (const r of rows) out.push(`${r.n.padEnd(8)} ${r.h}`);
            return out.join("\n");
        },
    },
    {
        id: "hmac-sha256",
        label: "HMAC (SHA-256 / 384 / 512)",
        description: "Keyed message authentication — first line is the key, the rest is the message.",
        sample: "secret-key\nhello world",
        options: [{
            key: "algo",
            label: "Algorithm",
            kind: "select",
            choices: [["SHA-256", "SHA-256"], ["SHA-384", "SHA-384"], ["SHA-512", "SHA-512"]],
            default: "SHA-256"
        }],
        transform: async (input, o) => {
            const nl = input.indexOf("\n");
            const key = (nl > 0 ? input.slice(0, nl) : "").trim();
            const msg = nl > 0 ? input.slice(nl + 1) : input;
            if (!key) return "Error: put the KEY on the first line, the message below it.";
            const algo = String(o.algo || "SHA-256");
            const cryptoKey = await crypto.subtle.importKey(
                "raw", te.encode(key) as unknown as BufferSource, {name: "HMAC", hash: algo},
                false, ["sign"]
            );
            const sig = await crypto.subtle.sign("HMAC", cryptoKey, te.encode(msg) as unknown as BufferSource);
            return `HMAC-${algo}\n  hex    ${hex(sig)}\n  base64 ${b64(sig)}`;
        },
    },
    {
        id: "aes-encrypt",
        label: "AES-GCM Encrypt",
        description: "Password → salt → PBKDF2 → AES-GCM. Output: one base64 blob (iv + salt + ciphertext).",
        sample: "password-123\nthe secret payload",
        transform: async (input) => {
            const nl = input.indexOf("\n");
            const password = (nl > 0 ? input.slice(0, nl) : "").trim();
            const plaintext = nl > 0 ? input.slice(nl + 1) : input;
            if (!password) return "Error: PASSWORD on the first line, the plaintext below.";
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const key = await crypto.subtle.importKey("raw", te.encode(password) as unknown as BufferSource, "PBKDF2", false, ["deriveKey"]);
            const aesKey = await crypto.subtle.deriveKey(
                {name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: 100_000, hash: "SHA-256"},
                key, {name: "AES-GCM", length: 256}, false, ["encrypt"]
            );
            const ct = await crypto.subtle.encrypt({
                name: "AES-GCM",
                iv: iv as unknown as BufferSource
            }, aesKey, te.encode(plaintext) as unknown as BufferSource);
            const blob = new Uint8Array(salt.length + iv.length + ct.byteLength);
            blob.set(salt, 0);
            blob.set(iv, salt.length);
            blob.set(new Uint8Array(ct), salt.length + iv.length);
            return b64(blob.buffer as ArrayBuffer);
        },
        note: "Decrypt with the AES-GCM Decrypt tool (same password). 100k PBKDF2 iterations, SHA-256.",
    },
    {
        id: "aes-decrypt",
        label: "AES-GCM Decrypt",
        description: "Reverse of the encrypt tool — password first line, the base64 blob below.",
        sample: "password-123\n<base64 blob from the encrypt tool>",
        transform: async (input) => {
            const nl = input.indexOf("\n");
            const password = (nl > 0 ? input.slice(0, nl) : "").trim();
            const blobB64 = (nl > 0 ? input.slice(nl + 1) : input).trim();
            if (!password || !blobB64) return "Error: PASSWORD on the first line, the base64 blob below.";
            const blob = fromB64(blobB64);
            if (blob.length < 29) return "Error: blob too short — expecting the tool's output (16 salt + 12 iv + ciphertext).";
            const salt = blob.slice(0, 16);
            const iv = blob.slice(16, 28);
            const ct = blob.slice(28);
            const key = await crypto.subtle.importKey("raw", te.encode(password) as unknown as BufferSource, "PBKDF2", false, ["deriveKey"]);
            const aesKey = await crypto.subtle.deriveKey(
                {name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: 100_000, hash: "SHA-256"},
                key, {name: "AES-GCM", length: 256}, false, ["decrypt"]
            );
            const pt = await crypto.subtle.decrypt({
                name: "AES-GCM",
                iv: iv as unknown as BufferSource
            }, aesKey, ct as unknown as BufferSource);
            return new TextDecoder().decode(pt);
        },
    },
    {
        id: "pbkdf2",
        label: "PBKDF2 Hash",
        description: "Password + salt → derived key bytes (hex) at a chosen length/iteration count.",
        sample: "password-123\nsodium chloride",
        options: [
            {
                key: "bits",
                label: "Length",
                kind: "select",
                choices: [["128", "128-bit"], ["256", "256-bit"], ["512", "512-bit"]],
                default: "256"
            },
            {
                key: "iters",
                label: "Iterations",
                kind: "select",
                choices: [["1000", "1k (fast)"], ["10000", "10k"], ["100000", "100k"]],
                default: "100000"
            },
        ],
        transform: async (input, o) => {
            const nl = input.indexOf("\n");
            const password = (nl > 0 ? input.slice(0, nl) : input).trim();
            const salt = nl > 0 ? input.slice(nl + 1).trim() : "";
            const bits = parseInt(String(o.bits), 10) || 256;
            const iters = parseInt(String(o.iters), 10) || 100000;
            const key = await crypto.subtle.importKey("raw", te.encode(password) as unknown as BufferSource, "PBKDF2", false, ["deriveBits"]);
            const bitsBuf = await crypto.subtle.deriveBits(
                {name: "PBKDF2", salt: te.encode(salt) as unknown as BufferSource, iterations: iters, hash: "SHA-256"},
                key, bits
            );
            return `PBKDF2-SHA256 · ${bits} bits · ${iters} iterations · salt "${salt}"\n${hex(bitsBuf)}`;
        },
    },
    {
        id: "random-bytes",
        label: "Random Bytes",
        description: "Cryptographically random bytes as hex / base64 / decimal list.",
        sample: "32",
        options: [{
            key: "count",
            label: "Bytes",
            kind: "select",
            choices: [["8", "8"], ["16", "16"], ["32", "32"], ["64", "64"]],
            default: "32"
        }],
        transform: (input, o) => {
            const n = Math.min(1024, Math.max(1, parseInt(String(o.count), 10) || parseInt(input.trim(), 10) || 32));
            const bytes = crypto.getRandomValues(new Uint8Array(n));
            return `hex     ${hex(bytes.buffer as ArrayBuffer)}\nbase64  ${b64(bytes.buffer as ArrayBuffer)}\ndecimal ${[...bytes].join(", ")}`;
        },
        note: "The input line can override the byte count (1–1024).",
    },
    {
        id: "random-pin",
        label: "Random PIN / Passcode",
        description: "Numeric PINs (leading zeros kept) at a chosen length and count.",
        sample: "6",
        options: [{
            key: "len",
            label: "Digits",
            kind: "select",
            choices: [["4", "4"], ["6", "6"], ["8", "8"], ["12", "12"]],
            default: "6"
        }],
        transform: (input, o) => {
            const len = Math.min(16, Math.max(3, parseInt(String(o.len), 10) || parseInt(input.trim(), 10) || 6));
            const out: string[] = [];
            for (let i = 0; i < 8; i++) {
                let pin = "";
                const bytes = crypto.getRandomValues(new Uint32Array(len));
                for (const b of bytes) pin += String(b % 10);
                out.push(pin);
            }
            return out.join("\n");
        },
    },
    {
        id: "passphrase",
        label: "Passphrase (Diceware-style)",
        description: "Word-based passphrases from a built-in 256-word list — memorable + long.",
        sample: "5",
        transform: (input) => {
            const words = ("able acid apex aqua arch arm art atom aunt away baby back bail bake barn base bath beam bean bear beat bell belt bend bike bird blow blue boat body bold bone book boot born boss bowl brew bull burn bush busy cage calf call camp card care cart case cash cast cave cell chat chef chin chip city clay clip club coal coat code coin cold comb cook cool cope cord core cork corn cost cozy creme crew crop cube cure curl dare dark dart dash dawn deal dear debt deck deep deer dent desk dial dice diet dirt dish dive dock does dome done doom door dose dove down draw drew drip drop drum dual duck dust duty each earn ease east echo edge else envy epic even exam exit face fact fade fail fair fake fall farm fast fate fear feed feel fern file fill film find fine firm fish fist five flag flat flaw fled flow foam fold folk fond food fork form fort four fowl free frog from fuel full fund gain game gate gaze gear gift girl give glad glen glow goal goat gold golf gone good gray grew grid grill grip grog grow gulf gull hail hair half hall halt hand hang hard harm hash haul have hawk haze head heal heap hear heat held hell helm help herb herd hero hide high hill hint hire hive hold hole holy home hood hoof hook horn hose host hour huge hunt hurt icon idea into iron item join joke joust just keen keep kelp kept kick kind king kiss kite knee knew knot know lace lack lady laid lake lamb lamp land lane last late lava lawn lazy lead leaf leak lean leap left lens less list live load loaf loan lock loft logo long look loop lord lose loss loud love luck lump lure lynx made mail main make mall many maple mare mark mash mask mast mate math meal mean meat meet melt memo mend menu mere mesh mile milk mill mind mine mint mist mode mold mole monk mood moon more moss most moth move much mule must myth nail name navy near neat neck need neon nest news next nice nine node none noon norm nose note noun oath obey odds okay omit once only onto open oval oven over pace pack pact page paid pail pain pair pale palm park part pass past path peak pear peer pile pine pink pipe plan play plot plug plum plus poem poet pole poll pond pony pool port pose post pour pray prey prim prod prop prow pull pump pure push quit quiz race raft rage raid rail rain rake ramp rank rare rate read real reap rear redo reef rein rely rent rest rice rich ride rift ripe rise risk road roar robe rock rode role roll roof room root rope rose ruby rude rule rush rust safe sage said sail sake sale salt same sand save scan seal seat seed seek seem seen self sell send sent shed ship shoe shop shot show shut sick side sigh sign silk sing sink site size skin skip slab slam slap sled slew slid slim slip slot slow snap snip snow snug soap sock soda sofa soft soil sold sole some song soon sore sort soul soup sour spin spot spun spur stag star stay stem step stir stop stow stub such suit sung sunk sure swap swan swim tail take tale talk tall tame tang tank tape task teal team tear tech tell tend tent term test text than that thaw thee them then they thin this thou thud thus tick tide tidy tied tile till tilt time tine tint tiny tips tire toad toll tomb tone tool torn tour town trap tray trek trim trio trip trod true tube tuck tuna tune turf turn twin type ugly undo unit upon urge used user vail vain vale vane vast veal veer veil verb very vest veto vial vibe vice view vile vine visa vise void volt vote wade waft wage wait wake walk wall want ward ware warm warn wash wasp watt wave wavy waxy weak wear weed week weep well went were west what when whim whip whom wick wide wife wild will wilt wind wine wing wipe wire wise wish with wolf wood wool word wore work worm wrap yard yarn yawn year yell yoke yolk your zeal zero zest zinc zone zoom").split(" ");
            const count = Math.min(20, Math.max(1, parseInt(input.trim(), 10) || 5));
            const out: string[] = [];
            for (let c = 0; c < 4; c++) {
                const phrase: string[] = [];
                const picks = crypto.getRandomValues(new Uint32Array(count));
                for (const p of picks) phrase.push(words[p % words.length]);
                out.push(phrase.join("-"));
            }
            return out.join("\n");
        },
        note: "Input: number of words per passphrase (default 5). 4 phrases at a time.",
    },
    {
        id: "entropy-check",
        label: "Password Entropy",
        description: "Character-pool entropy estimate + crack-time brackets for each line.",
        sample: "Tr0ub4dor&3\nthis-is-a-long-passphrase",
        transform: (input) =>
            input.split(/\r?\n/).filter((l) => l.trim() !== "").map((line) => {
                const pw = line.trim();
                let pool = 0;
                if (/[a-z]/.test(pw)) pool += 26;
                if (/[A-Z]/.test(pw)) pool += 26;
                if (/[0-9]/.test(pw)) pool += 10;
                if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
                const bits = pw.length * Math.log2(pool || 1);
                const guesses = Math.pow(2, bits);
                const secs = guesses / 1e10; // 10B guesses/sec offline attacker
                const fmt = (s: number): string => {
                    if (s < 1) return "instant";
                    if (s < 60) return `${round(s)} seconds`;
                    if (s < 3600) return `${round(s / 60)} minutes`;
                    if (s < 86400) return `${round(s / 3600)} hours`;
                    if (s < 3.15e7) return `${round(s / 86400)} days`;
                    if (s < 3.15e9) return `${round(s / 3.15e7)} years`;
                    if (s < 3.15e12) return `${round(s / 3.15e9)} thousand years`;
                    if (s < 3.15e15) return `${round(s / 3.15e12)} million years`;
                    return "longer than the universe's age";
                };
                const round = (x: number) => (x < 10 ? x.toFixed(1) : Math.round(x).toLocaleString());
                return `"${pw}" · ${pw.length} chars · pool ${pool}\n  entropy ≈ ${bits.toFixed(1)} bits\n  offline 10B/s → ${fmt(secs)}`;
            }).join("\n\n"),
        note: "Entropy assumes a RANDOM composition — patterns (words, repeats) lower the real strength far below this ceiling.",
    },
    {
        id: "rot13",
        label: "ROT13",
        description: "The self-inverse letter rotation — encode and decode are the same operation.",
        sample: "Praxis makes practice.",
        transform: (input) => caesar(input, 13),
    },
    {
        id: "caesar",
        label: "Caesar Shift",
        description: "Shift letters by N (any shift — encode with +N, decode with −N or the 'decode' toggle).",
        sample: "attack at dawn",
        options: [
            {
                key: "shift",
                label: "Shift",
                kind: "select",
                choices: [["1", "1"], ["3", "3"], ["5", "5"], ["7", "7"], ["11", "11"], ["13", "13"], ["19", "19"], ["25", "25"]],
                default: "3"
            },
            {key: "decode", label: "Decode", kind: "toggle"},
        ],
        transform: (input, o) => {
            let n = parseInt(String(o.shift), 10) || 3;
            if (o.decode === true) n = -n;
            return caesar(input, n);
        },
    },
    {
        id: "atbash",
        label: "Atbash",
        description: "The mirror alphabet (A↔Z, B↔Y …) — self-inverse.",
        sample: "praxis",
        transform: (input) =>
            input.replace(/[a-zA-Z]/g, (c) => {
                const base = c <= "Z" ? 65 : 97;
                return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
            }),
    },
    {
        id: "vigenere",
        label: "Vigenère",
        description: "The classic polyalphabetic cipher — key on the first line, message below.",
        sample: "LEMON\nATTACKATDAWN",
        options: [{key: "decode", label: "Decode", kind: "toggle"}],
        transform: (input, o) => {
            const nl = input.indexOf("\n");
            const key = (nl > 0 ? input.slice(0, nl) : "").trim();
            const msg = nl > 0 ? input.slice(nl + 1) : input;
            if (!key) return "Error: KEY on the first line, the message below.";
            return vigenere(msg, key, o.decode === true);
        },
    },
    {
        id: "xor-cipher",
        label: "XOR Cipher",
        description: "Byte-wise XOR with a repeating key — output as hex (decode accepts the hex back).",
        sample: "secretkey\nmeet me at midnight",
        options: [{key: "decode", label: "Input is hex (decode)", kind: "toggle"}],
        transform: (input, o) => {
            const nl = input.indexOf("\n");
            const key = (nl > 0 ? input.slice(0, nl) : "").trim();
            const body = nl > 0 ? input.slice(nl + 1) : input;
            if (!key) return "Error: KEY on the first line, the message below.";
            if (o.decode === true) {
                const bytes = fromHex(body);
                const out = [...bytes].map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length))).join("");
                return out;
            }
            const bytes = [...te.encode(body)].map((b, i) => b ^ key.charCodeAt(i % key.length));
            return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
        },
    },
    {
        id: "base58",
        label: "Base58 Encode / Decode",
        description: "The Bitcoin alphabet (no 0/O/I/l) — encode text, or decode an existing string.",
        sample: "Hello Praxis",
        options: [{key: "decode", label: "Decode", kind: "toggle"}],
        transform: (input, o) => {
            const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
            if (o.decode === true) {
                const clean = input.trim();
                for (const c of clean) {
                    if (!ALPHA.includes(c)) throw new Error(`Invalid base58 character '${c}'.`);
                }
                let lead = 0;
                for (const c of clean) {
                    if (c === "1") lead++; else break;
                }
                let value = BigInt(0);
                for (const c of clean) value = value * BigInt(58) + BigInt(ALPHA.indexOf(c));
                let hexStr = value.toString(16);
                if (hexStr.length % 2) hexStr = "0" + hexStr;
                const bytes = fromHex(hexStr);
                const out = new Uint8Array(lead + bytes.length);
                out.set(bytes, lead);
                return new TextDecoder().decode(out);
            }
            const bytes = te.encode(input);
            let lead = 0;
            for (const b of bytes) {
                if (b === 0) lead++; else break;
            }
            let value = BigInt(0);
            for (const b of bytes) value = (value << BigInt(8)) + BigInt(b);
            let out = "";
            while (value > BigInt(0)) {
                out = ALPHA[Number(value % BigInt(58))] + out;
                value /= BigInt(58);
            }
            return "1".repeat(lead) + out;
        },
        note: "BigInt-powered — handles long payloads. Leading zeros become 1s (the Base58 convention).",
    },
    {
        id: "luhn-generate",
        label: "Luhn Check Digit",
        description: "Complete a number with its Luhn check digit, or verify full numbers.",
        sample: "7992739871\n453201511L3",
        transform: (input) =>
            input.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
                const s = line.trim();
                const digits = s.replace(/\D/g, "");
                if (digits.length < 2) return `${s} → too few digits`;
                const sum = (d: string, offs: number): number => {
                    let total = 0;
                    for (let i = d.length - 1, k = 0; i >= 0; i--, k++) {
                        let v = d.charCodeAt(i) - 48;
                        if (k >= offs) {
                            v *= 2;
                            if (v > 9) v -= 9;
                        }
                        total += v;
                    }
                    return total;
                };
                if (/L/i.test(s)) {
                    const partial = digits;
                    const needed = (10 - (sum(partial, 0) % 10)) % 10;
                    return `${s} → complete: ${partial}${needed}`;
                }
                const s10 = sum(digits, 1);
                return `${s} → ${s10 % 10 === 0 ? "VALID (Luhn passes)" : `INVALID (check digit should be ${(10 - (s10 - (digits.charCodeAt(digits.length - 1) - 48)) % 10) % 10})`}`;
            }).join("\n"),
        note: "Put an L where the check digit belongs to compute it (e.g. 7992739871L).",
    },
    {
        id: "isbn-ean",
        label: "ISBN-10 / ISBN-13 / EAN",
        description: "Validate or complete the book / retail bar-code families.",
        sample: "978030640615\n978-0-306-40615-7",
        transform: (input) =>
            input.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
                const s = line.trim().replace(/[\s-]/g, "");
                if (/^\d{12}$/.test(s)) {
                    const sum = [...s].reduce((a, c, i) => a + (i % 2 === 0 ? Number(c) : Number(c) * 3), 0);
                    const check = (10 - (sum % 10)) % 10;
                    return `${line.trim()} → ISBN-13/EAN complete: ${s}${check}`;
                }
                if (/^\d{9}$/.test(s)) {
                    let sum = 0;
                    for (let i = 0; i < 9; i++) sum += (10 - i) * (s.charCodeAt(i) - 48);
                    const rem = (11 - (sum % 11)) % 11;
                    const check = rem === 10 ? "X" : String(rem);
                    return `${line.trim()} → ISBN-10 complete: ${s}${check}`;
                }
                if (/^\d{13}$/.test(s)) {
                    const sum = [...s.slice(0, 12)].reduce((a, c, i) => a + (i % 2 === 0 ? Number(c) : Number(c) * 3), 0);
                    const expect = (10 - (sum % 10)) % 10;
                    const ok = Number(s[12]) === expect;
                    return `${line.trim()} → ${ok ? "VALID ISBN-13/EAN" : `INVALID (check digit should be ${expect})`}`;
                }
                if (/^\d{9}[\dX]$/.test(s)) {
                    let sum = 0;
                    for (let i = 0; i < 10; i++) sum += (10 - i) * (s[i] === "X" ? 10 : s.charCodeAt(i) - 48);
                    return `${line.trim()} → ${sum % 11 === 0 ? "VALID ISBN-10" : "INVALID (mod 11 fails)"}`;
                }
                return `${line.trim()} → not a 9/12/13-digit form`;
            }).join("\n"),
    },
    {
        id: "iban-check",
        label: "IBAN Validator",
        description: "Mod-97 check on the international bank account number (spaces tolerated).",
        sample: "GB82WEST12345698765432",
        transform: (input) =>
            input.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
                const iban = line.trim().replace(/\s+/g, "").toUpperCase();
                if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return `${line.trim()} → wrong shape (2 letters + 2 check digits + account)`;
                const rearranged = iban.slice(4) + iban.slice(0, 4);
                const numeric = [...rearranged].map((c) => {
                    const code = c.charCodeAt(0);
                    if (code >= 48 && code <= 57) return c;
                    if (code >= 65 && code <= 90) return String(code - 55);
                    return "";
                }).join("");
                let rem = 0;
                for (const d of numeric) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
                return `${line.trim()} → ${rem === 1 ? "VALID (mod 97 = 1)" : `INVALID (mod 97 = ${rem}, need 1)`} · country ${iban.slice(0, 2)}`;
            }).join("\n"),
        note: "Structure + checksum only — it cannot know whether the account exists.",
    },
    {
        id: "uuid-v4-gen",
        label: "UUID v4 / v7 Generator",
        description: "Fresh RFC 4122 UUIDs — v4 random or v7 time-ordered.",
        sample: "5",
        options: [{
            key: "kind",
            label: "Version",
            kind: "select",
            choices: [["v4", "v4 (random)"], ["v7", "v7 (time-ordered)"]],
            default: "v4"
        }],
        transform: (input, o) => {
            const count = Math.min(50, Math.max(1, parseInt(input.trim(), 10) || 5));
            const out: string[] = [];
            for (let i = 0; i < count; i++) {
                if (o.kind === "v7") {
                    const ts = Date.now();
                    const bytes = crypto.getRandomValues(new Uint8Array(16));
                    bytes[0] = (ts / 2 ** 40) & 0xff;
                    bytes[1] = (ts / 2 ** 32) & 0xff;
                    bytes[2] = (ts / 2 ** 24) & 0xff;
                    bytes[3] = (ts / 2 ** 16) & 0xff;
                    bytes[4] = ts & 0xff;
                    bytes[6] = (bytes[6] & 0x0f) | 0x70;
                    bytes[8] = (bytes[8] & 0x3f) | 0x80;
                    const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
                    out.push(`${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`);
                } else out.push(crypto.randomUUID());
            }
            return out.join("\n");
        },
    },
    {
        id: "nanoid-gen",
        label: "NanoID-Style Generator",
        description: "URL-safe IDs from a custom alphabet with a computed collision ceiling.",
        sample: "10",
        options: [{
            key: "len",
            label: "Length",
            kind: "select",
            choices: [["8", "8"], ["10", "10"], ["16", "16"], ["21", "21"], ["32", "32"]],
            default: "10"
        }],
        transform: (input, o) => {
            const ALPHA = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict";
            const len = Math.min(64, Math.max(4, parseInt(String(o.len), 10) || parseInt(input.trim(), 10) || 10));
            const out: string[] = [];
            for (let i = 0; i < 5; i++) {
                const bytes = crypto.getRandomValues(new Uint8Array(len));
                out.push([...bytes].map((b) => ALPHA[b % ALPHA.length]).join(""));
            }
            const bits = len * Math.log2(ALPHA.length);
            return `${out.join("\n")}\n\nalphabet ${ALPHA.length} chars · ${bits.toFixed(0)} bits of entropy per ID`;
        },
    },
    {
        id: "totp",
        label: "TOTP Code (RFC 6238)",
        description: "Time-based one-time password from a base32 secret — the authenticator math, verifiable offline.",
        sample: "JBSWY3DPEHPK3PXP",
        options: [{
            key: "step",
            label: "Period",
            kind: "select",
            choices: [["30", "30 s"], ["60", "60 s"]],
            default: "30"
        }],
        transform: async (input, o) => {
            const b32 = input.trim().replace(/\s+/g, "").toUpperCase();
            if (!/^[A-Z2-7]+=?$/.test(b32)) return "Error: the secret must be base32 (A–Z, 2–7).";
            const step = parseInt(String(o.step), 10) || 30;
            let bits = "";
            for (const c of b32.replace(/=+$/, "")) bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5, "0");
            const bytes = new Uint8Array(Math.floor(bits.length / 8));
            for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
            const counter = Math.floor(Date.now() / 1000 / step);
            const ctr = new Uint8Array(8);
            let v = BigInt(counter);
            for (let i = 7; i >= 0; i--) {
                ctr[i] = Number(v & BigInt(0xff));
                v >>= BigInt(8);
            }
            const key = await crypto.subtle.importKey("raw", bytes as unknown as BufferSource, {
                name: "HMAC",
                hash: "SHA-1"
            }, false, ["sign"]);
            const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, ctr as unknown as BufferSource));
            const offset = sig[sig.length - 1] & 0x0f;
            const code = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3];
            const remaining = step - (Math.floor(Date.now() / 1000) % step);
            return `code ${String(code % 1_000_000).padStart(6, "0")} · period ${step}s · expires in ${remaining}s (computed at page load)`;
        },
        note: "The code is computed once per input render — real authenticators re-derive every period.",
    },
    {
        id: "hotp",
        label: "HOTP Code (RFC 4226)",
        description: "Counter-based one-time password — the same algorithm with your own counter.",
        sample: "JBSWY3DPEHPK3PXP\n0",
        transform: async (input) => {
            const [secretLine, counterLine] = input.split(/\r?\n/);
            const b32 = (secretLine ?? "").trim().replace(/\s+/g, "").toUpperCase();
            if (!/^[A-Z2-7]+=?$/.test(b32)) return "Error: line 1 = base32 secret (A–Z, 2–7), line 2 = counter.";
            const counter = BigInt(Math.max(0, parseInt((counterLine ?? "0").trim(), 10) || 0));
            let bits = "";
            for (const c of b32.replace(/=+$/, "")) bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5, "0");
            const bytes = new Uint8Array(Math.floor(bits.length / 8));
            for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
            const ctr = new Uint8Array(8);
            let v = counter;
            for (let i = 7; i >= 0; i--) {
                ctr[i] = Number(v & BigInt(0xff));
                v >>= BigInt(8);
            }
            const key = await crypto.subtle.importKey("raw", bytes as unknown as BufferSource, {
                name: "HMAC",
                hash: "SHA-1"
            }, false, ["sign"]);
            const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, ctr as unknown as BufferSource));
            const offset = sig[sig.length - 1] & 0x0f;
            const code = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3];
            return `counter ${counter} → ${String(code % 1_000_000).padStart(6, "0")}`;
        },
    },
    {
        id: "pepper-hash",
        label: "Salted Hash Pair",
        description: "password + salt → md5/sha rows — build fixture data for hash-comparison tests.",
        sample: "hunter2\nsodium",
        transform: async (input) => {
            const [pw, saltRaw] = input.split(/\r?\n/);
            const password = (pw ?? "").trim();
            const salt = (saltRaw ?? "pepper").trim();
            const salted = `${password}:${salt}`;
            const {md5} = await import("@/lib/md5");
            const rows: string[] = [`md5(salt:pw)   ${md5(salted)}`, `md5(pw:salt)   ${md5(`${salt}${password}`)}`];
            for (const algo of ["SHA-1", "SHA-256", "SHA-512"] as const) {
                rows.push(`${algo}(salt:pw) ${hex(await digest(algo, te.encode(salted)))}`);
            }
            return `password "${password}" · salt "${salt}"\n${rows.join("\n")}`;
        },
    },
    {
        id: "hex-dump-pretty",
        label: "Hex Dump (offsets)",
        description: "Canonical 16-per-row hex dump with ASCII gutter — the classic debugger view.",
        sample: "The quick brown fox",
        transform: (input) => {
            const bytes = te.encode(input);
            const rows: string[] = [];
            for (let i = 0; i < bytes.length; i += 16) {
                const slice = [...bytes.slice(i, i + 16)];
                const hexPart = slice.map((b) => b.toString(16).padStart(2, "0")).join(" ").padEnd(16 * 3 - 1);
                const ascii = slice.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
                rows.push(`${i.toString(16).padStart(8, "0")}  ${hexPart}  |${ascii}|`);
            }
            return `${bytes.length} bytes\n${rows.join("\n")}`;
        },
    },

    {
        id: "csp-builder",
        label: "Content-Security-Policy Builder",
        description: "Turn a `directive value…` line list into the canonical header (or meta tag).",
        sample: "default-src 'self'\nscript-src 'self' 'unsafe-inline'\nimg-src * data:",
        options: [{
            key: "form",
            label: "Output",
            kind: "select",
            choices: [["header", "Header"], ["meta", "<meta>"]],
            default: "header"
        }],
        transform: (input, o) => {
            const parts = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            if (parts.length === 0) return "Error: one directive per line (e.g. `script-src 'self'`).";
            const policy = parts.join("; ");
            return o.form === "meta"
                ? `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/"/g, "&quot;")}">`
                : `Content-Security-Policy: ${policy}`;
        },
    },
    {
        id: "jwt-claims",
        label: "JWT Claims Reader",
        description: "Decode the payload of a JWT (signature NOT verified — it's a reader, not a validator).",
        sample: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc",
        transform: (input) => {
            const token = input.trim().split(/\s+/).pop() ?? "";
            const parts = token.split(".");
            if (parts.length < 2) return "Error: paste the full three-part token.";
            const claims = JSON.parse(new TextDecoder().decode(fromB64(parts[1].replace(/-/g, "+").replace(/_/g, "/"))));
            const header = JSON.parse(new TextDecoder().decode(fromB64(parts[0].replace(/-/g, "+").replace(/_/g, "/"))));
            return `header\n${JSON.stringify(header, null, 2)}\nclaims\n${JSON.stringify(claims, null, 2)}\nsignature: ${parts[2] ?? "(none)"} — NOT verified.`;
        },
    },
    {
        id: "secret-redact",
        label: "Redact Secrets",
        description: "Mask password / token / key value assignments in logs and configs before sharing.",
        sample: "DB_PASSWORD=hunter2\ntoken: eyJhbGciOi...\npassword=abc123",
        options: [{key: "keep", label: "Keep last 4 chars", kind: "toggle"}],
        transform: (input, o) => {
            const mask = (v: string) => (o.keep === true && v.length > 4 ? `${"•".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : "•".repeat(Math.min(12, Math.max(6, v.length))));
            return input
                .replace(/((?:password|passwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credentials?|auth)\s*[:=]\s*)(["']?)([^\s"']{4,})\2/gi,
                    (whole, pre, quote, value) => `${pre}${quote}${mask(value)}${quote}`)
                .replace(/(Bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi, (whole, pre, tok) => `${pre}${mask(tok)}`);
        },
        note: "Matches key words in 10+ spellings; never matches the key NAME itself, only the value.",
    },
];

/** Registry entries: one component per spec (the factory renders it). */
export const SECURITY_TOOL_ENTRIES = SECURITY_TOOLS.map((spec) => ({spec, component: makeTextTool(spec)}));
