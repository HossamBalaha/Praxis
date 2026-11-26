/**
 * naming-styles.test.ts — unit tests for src/lib/naming-styles.ts.
 *
 * The naming-style engine renders canonical identifier word-lists in the
 * user's chosen style. These tests cover:
 * - applyNamingStyle for ALL five styles with identifiers that contain
 * spaces, hyphens, underscores, mixed case, acronym boundaries, digits,
 * and the empty string / separator-only edge cases
 * - styleForKind mapping each identifier kind to its settings field
 * - the DEFAULT_NAMING_STYLES / LEGACY_NAMING_STYLES bundles (they feed
 * the settings migration, so their exact values matter)
 * - NAMING_STYLES catalogue integrity: every style's documented example
 * must match what applyNamingStyle actually produces for "process data".
 */
import {describe, expect, it} from "vitest";
import {
    applyNamingStyle,
    DEFAULT_NAMING_STYLES,
    LEGACY_NAMING_STYLES,
    NAMING_STYLES,
    type NamingStyleSettings,
    styleForKind,
} from "@/lib/naming-styles";

describe("applyNamingStyle", () => {
    it("renders a spaced phrase in every style", () => {
        expect(applyNamingStyle("snake_case", "process data")).toBe("process_data");
        expect(applyNamingStyle("camelCase", "process data")).toBe("processData");
        expect(applyNamingStyle("PascalCase", "process data")).toBe("ProcessData");
        expect(applyNamingStyle("kebab-case", "process data")).toBe("process-data");
        expect(applyNamingStyle("UPPER_SNAKE", "process data")).toBe("PROCESS_DATA");
    });

    it("splits on hyphens and underscores (mixed separators)", () => {
        expect(applyNamingStyle("snake_case", "my-cool thing")).toBe("my_cool_thing");
        expect(applyNamingStyle("camelCase", "already_snake_case")).toBe("alreadySnakeCase");
        expect(applyNamingStyle("PascalCase", "kebab-case-name")).toBe("KebabCaseName");
        expect(applyNamingStyle("UPPER_SNAKE", "mix-ed_name here")).toBe("MIX_ED_NAME_HERE");
    });

    it("understands camelCase and PascalCase boundaries, incl. acronyms", () => {
        // "XMLHttpRequest" → words ["XML", "Http", "Request"]
        expect(applyNamingStyle("snake_case", "XMLHttpRequest")).toBe("xml_http_request");
        expect(applyNamingStyle("camelCase", "XMLHttpRequest")).toBe("xmlHttpRequest");
        expect(applyNamingStyle("PascalCase", "XMLHttpRequest")).toBe("XmlHttpRequest");
        expect(applyNamingStyle("kebab-case", "XMLHttpRequest")).toBe("xml-http-request");
        expect(applyNamingStyle("UPPER_SNAKE", "XMLHttpRequest")).toBe("XML_HTTP_REQUEST");
    });

    it("handles mixed-case hyphenated identifiers", () => {
        expect(applyNamingStyle("snake_case", "get-User-Data")).toBe("get_user_data");
        expect(applyNamingStyle("camelCase", "get-User-Data")).toBe("getUserData");
        expect(applyNamingStyle("PascalCase", "get-User-Data")).toBe("GetUserData");
    });

    it("normalizes already-styled names in the other direction", () => {
        expect(applyNamingStyle("camelCase", "FOO_BAR")).toBe("fooBar");
        expect(applyNamingStyle("snake_case", "FooBar")).toBe("foo_bar");
        expect(applyNamingStyle("PascalCase", "foo_bar")).toBe("FooBar");
        expect(applyNamingStyle("UPPER_SNAKE", "fooBarBaz")).toBe("FOO_BAR_BAZ");
    });

    it("keeps digits attached to their word", () => {
        expect(applyNamingStyle("camelCase", "version2 Update")).toBe("version2Update");
        expect(applyNamingStyle("PascalCase", "version2 Update")).toBe("Version2Update");
        expect(applyNamingStyle("snake_case", "top10 movies")).toBe("top10_movies");
    });

    it("passes single words through with the right casing", () => {
        expect(applyNamingStyle("snake_case", "name")).toBe("name");
        expect(applyNamingStyle("PascalCase", "name")).toBe("Name");
        expect(applyNamingStyle("camelCase", "Name")).toBe("name");
        expect(applyNamingStyle("UPPER_SNAKE", "name")).toBe("NAME");
        expect(applyNamingStyle("kebab-case", "Name")).toBe("name");
    });

    it("returns the input unchanged when it contains no words at all", () => {
        // words drops every segment → the original base is returned verbatim.
        expect(applyNamingStyle("snake_case", "")).toBe("");
        expect(applyNamingStyle("camelCase", "   ")).toBe("   ");
        expect(applyNamingStyle("PascalCase", "___")).toBe("___");
        expect(applyNamingStyle("kebab-case", "--")).toBe("--");
    });
});

describe("styleForKind", () => {
    const settings: NamingStyleSettings = {
        variables: "snake_case",
        functions: "camelCase",
        classes: "PascalCase",
        dictKeys: "UPPER_SNAKE",
        files: "kebab-case",
    };

    it("maps every identifier kind to its own settings field", () => {
        expect(styleForKind(settings, "variable")).toBe("snake_case");
        expect(styleForKind(settings, "function")).toBe("camelCase");
        expect(styleForKind(settings, "class")).toBe("PascalCase");
        expect(styleForKind(settings, "dictKey")).toBe("UPPER_SNAKE");
        expect(styleForKind(settings, "file")).toBe("kebab-case");
    });

    it("falls back to snake_case for an unknown kind (defensive default branch)", () => {
        expect(styleForKind(settings, "bogus" as never)).toBe("snake_case");
    });
});

describe("settings bundles", () => {
    it("Defaults: camelCase variables, PascalCase functions/classes/files", () => {
        expect(DEFAULT_NAMING_STYLES).toEqual({
            variables: "camelCase",
            functions: "PascalCase",
            classes: "PascalCase",
            dictKeys: "camelCase",
            files: "PascalCase",
        });
    });

    it("legacy defaults are snake_case everywhere except classes", () => {
        expect(LEGACY_NAMING_STYLES).toEqual({
            variables: "snake_case",
            functions: "snake_case",
            classes: "PascalCase",
            dictKeys: "snake_case",
            files: "snake_case",
        });
    });
});

describe("NAMING_STYLES catalogue", () => {
    it("lists all five styles with a value, label and example", () => {
        expect(NAMING_STYLES).toHaveLength(5);
        for (const s of NAMING_STYLES) {
            expect(typeof s.value).toBe("string");
            expect(s.value.length).toBeGreaterThan(0);
            expect(typeof s.label).toBe("string");
            expect(typeof s.example).toBe("string");
        }
        expect(NAMING_STYLES.map((s) => s.value)).toEqual(
            expect.arrayContaining([
                "snake_case",
                "camelCase",
                "PascalCase",
                "kebab-case",
                "UPPER_SNAKE",
            ])
        );
    });

    it("every style's advertised example matches its actual rendering of 'process data'", () => {
        for (const s of NAMING_STYLES) {
            expect(applyNamingStyle(s.value, "process data")).toBe(s.example);
        }
    });
});
