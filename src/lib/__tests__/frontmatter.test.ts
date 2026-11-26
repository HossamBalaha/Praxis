import {describe, expect, it} from "vitest";
import {splitFrontMatter} from "@/lib/frontmatter";

describe("splitFrontMatter", () => {
    it("splits a plain leading block", () => {
        const src = '---\ntitle: "Sensor Report"\nauthor: "Praxis"\n---\n\n# Body\n';
        const out = splitFrontMatter(src);
        expect(out.entries).not.toBeNull();
        expect(out.entries?.map((e) => e.key)).toEqual(["title", "author"]);
        expect(out.body).toBe("# Body\n");
    });

    it("detects the fence after a BOM", () => {
        const src = '﻿---\ntitle: BOM\n---\nbody text\n';
        const out = splitFrontMatter(src);
        expect(out.entries?.[0]).toEqual({key: "title", value: "BOM"});
        expect(out.body).toBe("body text\n");
    });

    it("detects the fence after leading blank lines", () => {
        const src = '\n---\ntitle: "Sensor Report"\nauthor: "Praxis Example Suite"\ndate: "2026-01-01"\noutput: html_document\n---\n\n## Overview\n';
        const out = splitFrontMatter(src);
        expect(out.entries?.length).toBe(4);
        expect(out.entries?.[3]).toEqual({key: "output", value: "html_document"});
        expect(out.body).toContain("## Overview");
        expect(out.body).not.toContain("---");
    });

    it("returns the original text when there is no front matter", () => {
        const src = "# Just a heading\n\nBody.\n";
        const out = splitFrontMatter(src);
        expect(out.entries).toBeNull();
        expect(out.body).toBe(src);
    });

    it("does not treat a mid-document --- as a fence", () => {
        const src = "Intro\n\n---\n\nDivider\n";
        const out = splitFrontMatter(src);
        expect(out.entries).toBeNull();
    });
});
