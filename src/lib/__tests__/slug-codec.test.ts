/**
 * slug-codec.test.ts — unit tests for src/lib/slug-codec.ts.
 *
 * The decode must reproduce exactly what lib/scripts.ts `slugify`
 * produces (base64url of the UTF-8 bytes of the RELATIVE path) —
 * including nested paths, spaces, and non-ASCII names, because the
 * write route's `fileName` is the decoded RELATIVE path (the FTS
 * display name is only the basename, which would write nested files
 * to the folder root).
 *
 * The expected slugs below were generated with
 * Buffer.from(x, "utf-8").toString("base64url") — the server's own
 * encoder — so a regression in this codec fails loudly.
 */
import {describe, expect, it} from "vitest";
import {decodeSlug} from "@/lib/slug-codec";

/** The server-side encoder (only for generating test fixtures — the
 *  module under test must NOT import it, that's the whole point). */
function slugifyServer(name: string): string {
    return Buffer.from(name, "utf-8").toString("base64url");
}

describe("decodeSlug", () => {
    it("decodes simple file names", () => {
        expect(decodeSlug(slugifyServer("TwoSum.py"))).toBe("TwoSum.py");
        expect(decodeSlug(slugifyServer("notes.md"))).toBe("notes.md");
    });

    it("decodes names with spaces and punctuation", () => {
        expect(decodeSlug(slugifyServer("Brier Score.py"))).toBe("Brier Score.py");
        expect(decodeSlug(slugifyServer("Script With Spaces In Folder.py"))).toBe(
            "Script With Spaces In Folder.py"
        );
    });

    it("decodes nested forward-slash relative paths", () => {
        expect(decodeSlug(slugifyServer("LevelOne/LevelTwo/LevelTwoScript.py"))).toBe(
            "LevelOne/LevelTwo/LevelTwoScript.py"
        );
        expect(decodeSlug(slugifyServer("Folder With Spaces/Script With Spaces In Folder.py"))).toBe(
            "Folder With Spaces/Script With Spaces In Folder.py"
        );
    });

    it("decodes non-ASCII names (UTF-8 survives the trip)", () => {
        expect(decodeSlug(slugifyServer("Ünicode-Über.py"))).toBe("Ünicode-Über.py");
        expect(decodeSlug(slugifyServer("数据/分析.py"))).toBe("数据/分析.py");
    });

    it("degrades gracefully on malformed input", () => {
        expect(decodeSlug("")).toBe("");
        // Illegal base64 characters → "" (callers treat that as skip).
        expect(decodeSlug("!!!not-base64!!!")).toBe("");
    });

    it("matches the server-side deslugify exactly across a fixture set", () => {
        const fixtures = [
            "README.md",
            "sub/dir/file.py",
            "a/b/c/d/e/deep.py",
            "Math & Stats.py",
            "çàï-ö.py",
        ];
        for (const name of fixtures) {
            const slug = slugifyServer(name);
            expect(decodeSlug(slug)).toBe(Buffer.from(slug, "base64url").toString("utf-8"));
        }
    });
});
