/**
 * spell-language.test.ts — E20 multi-language spell dictionaries.
 *
 * Exercises the /api/spell route END-TO-END (the POST/GET handlers
 * against the real public/dict/*.txt files — no mocks): language
 * auto-detection from the stopword fingerprint, explicit `dict` and
 * `hint` overrides, per-language checking (real words pass, typos
 * flag, typos get SAME-LANGUAGE suggestions), markdown fence
 * stripping feeding detection, and the spellLanguage settings
 * default.
 *
 * Ordering note: "auto" suggestions reuse the language of the most
 * recent CHECK (module state on the route, exactly as in the dev
 * server) — the suggest cases that depend on it run their own check
 * first, so no cross-test coupling.
 */
import {describe, expect, it} from "vitest";
import {GET, POST} from "@/app/api/spell/route";
import {DEFAULT_SETTINGS} from "@/lib/settings";

interface CheckResponse {
    ok?: boolean;
    dict?: string;
    misspelled?: Array<{ word: string; line: number; col: number }>;
    suggestions?: string[];
}

async function spellPost(body: Record<string, unknown>): Promise<Response> {
    return POST(
        new Request("http://localhost/api/spell", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify(body),
        })
    );
}

async function check(body: Record<string, unknown>): Promise<CheckResponse> {
    const res = await spellPost({action: "check", ...body});
    expect(res.status).toBe(200);
    return (await res.json()) as CheckResponse;
}

/** The misspelled word forms of a check response. */
const words = (r: CheckResponse): string[] => (r.misspelled ?? []).map((m) => m.word);

// Natural prose per language — every real word verified present in
// its public/dict file; every typo verified absent.
const PROSE: Record<string, string> = {
    english:
        "The quick brown fox jumps over the lazy dog. This is a sample of what people would write when they have thoughts about their work, and there was very much to say about it.",
    spanish:
        "El perro de mi vecino es muy ruidoso. Los vecinos que viven en la casa que está al lado no pueden dormir porque el animal ladra durante toda la noche sin parar.",
    french:
        "Le chien de mon voisin est très bruyant. Les voisins qui habitent dans la maison qui est à côté ne peuvent pas dormir parce qu'il aboie pendant toute la nuit.",
    german:
        "Der Hund meines Nachbarn ist sehr laut. Die Nachbarn, die im Haus nebenan wohnen, können nachts nicht schlafen, weil das Tier ohne Pause bellt.",
    italian:
        "Il cane del mio vicino è molto rumoroso. I vicini che vivono nella casa accanto non riescono a dormire perché l'animale abbaia durante tutta la notte.",
    portuguese:
        "O cachorro do meu vizinho é muito barulhento. Os vizinhos que moram na casa ao lado não conseguem dormir porque o animal late durante toda a noite.",
    russian:
        "Собака моего соседа очень громкая. Соседи, которые живут рядом, не могут спать ночью, потому что животное шумит без остановки.",
};

// One real word (must pass) + one typo (must flag) per language.
const REAL: Record<string, string> = {
    english: "thoughts",
    spanish: "ruidoso",
    french: "bruyant",
    german: "nachbarn",
    italian: "rumoroso",
    portuguese: "barulhento",
    russian: "животное",
};
const TYPO: Record<string, string> = {
    english: "qick",
    spanish: "perrro",
    french: "chein",
    german: "huund",
    italian: "caane",
    portuguese: "cachorrro",
    russian: "собаака",
};

describe("spell language auto-detection", () => {
    for (const lang of Object.keys(PROSE)) {
        it(`detects ${lang} prose and checks it against the ${lang} dictionary`, async () => {
            const text = `${PROSE[lang]} ${TYPO[lang]}`;
            const res = await check({text});
            expect(res.dict).toBe(lang);
            // The typo flags…
            expect(words(res)).toContain(TYPO[lang]);
            // …the real vocabulary of the language does not.
            expect(words(res)).not.toContain(REAL[lang]);
            // Line/col still point at the typo (appended on line 1).
            const hit = (res.misspelled ?? []).find((m) => m.word === TYPO[lang]);
            expect(hit?.line).toBe(1);
            expect(hit?.col).toBeGreaterThan(0);
        });
    }

    it("falls back to english when there is not enough signal (< 3 stopword hits)", async () => {
        const res = await check({text: "Hola quetal amigo"});
        expect(res.dict).toBe("english");
    });

    it("detects from the prose only — markdown code fences are stripped first", async () => {
        const md = [
            "```python",
            "import somemodule",
            "def run(x):",
            "    return x + 1",
            "```",
            "",
            "El perro de mi vecino es muy ruidoso y los vecinos no pueden dormir.",
            "",
        ].join("\n");
        const res = await check({text: md, kind: "markdown"});
        expect(res.dict).toBe("spanish");
        // The fenced identifier is gone with the fence — never checked.
        expect(words(res)).not.toContain("somemodule");
        expect(words(res)).not.toContain("import");
    });

    it("keeps accented words whole (está, très, für, perché, são…)", async () => {
        // A regression guard for the tokenizer: one unicode-letter run,
        // not "est"/"á" fragments — "está" must be found in spanish.txt.
        const res = await check({
            text: "La reunión del miércoles está cancelada según el director.",
            dict: "spanish",
        });
        expect(res.dict).toBe("spanish");
        expect(words(res)).not.toContain("está");
        expect(words(res)).not.toContain("miércoles");
    });
});

describe("spell dictionary selection", () => {
    it("honors an explicit dict override (settings → POST body)", async () => {
        // English prose pinned to the Spanish dictionary → the English
        // words the Spanish list lacks ("jumps", "thoughts") flag.
        const res = await check({text: PROSE.english, dict: "spanish"});
        expect(res.dict).toBe("spanish");
        expect(words(res)).toContain("jumps");
    });

    it("honors a caller hint (name or ISO code) over detection", async () => {
        const res = await check({text: PROSE.english, hint: "fr"});
        expect(res.dict).toBe("french");
        const res2 = await check({text: PROSE.english, hint: "spanish"});
        expect(res2.dict).toBe("spanish");
    });

    it("ignores hints that are not languages (file kinds) — detection runs", async () => {
        const res = await check({text: PROSE.english, hint: "python"});
        expect(res.dict).toBe("english");
    });

    it("falls back to detection for unknown dict values", async () => {
        const res = await check({text: PROSE.portuguese, dict: "klingon"});
        expect(res.dict).toBe("portuguese");
    });
});

describe("spell suggestions follow the dictionary", () => {
    it("suggests same-language near-matches for an explicit dict", async () => {
        const res = await spellPost({
            action: "suggest",
            word: TYPO.spanish,
            limit: 3,
            dict: "spanish",
        });
        const data = (await res.json()) as CheckResponse;
        expect(data.dict).toBe("spanish");
        expect(data.suggestions).toContain("perro");
    });

    it("auto-suggests in the language of the surrounding text (last check)", async () => {
        // Check French prose first — the popover's "auto" suggestion for
        // a word from that buffer must come from the French dictionary.
        await check({text: PROSE.french});
        const res = await spellPost({action: "suggest", word: "maizon", limit: 3});
        const data = (await res.json()) as CheckResponse;
        expect(data.dict).toBe("french");
        expect(data.suggestions).toContain("maison");
    });

    it("routes a Cyrillic word to the Russian dictionary on auto", async () => {
        const res = await spellPost({action: "suggest", word: "собаака", limit: 3});
        const data = (await res.json()) as CheckResponse;
        expect(data.dict).toBe("russian");
        expect(data.suggestions).toContain("собака");
    });
});

describe("spell dictionary inventory", () => {
    it("GET lists the installed dictionaries", async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const data = (await res.json()) as { dicts?: string[] };
        expect(data.dicts).toEqual(
            expect.arrayContaining([
                "english",
                "spanish",
                "french",
                "german",
                "italian",
                "portuguese",
                "russian",
            ])
        );
    });

    it("spellLanguage defaults to auto (browser-localStorage settings merge)", () => {
        expect(DEFAULT_SETTINGS.spellLanguage).toBe("auto");
    });
});
