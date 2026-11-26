/**
 * shortcuts.test.ts — unit tests for src/lib/shortcuts.ts.
 *
 * The shortcuts module is the single source of truth for default key
 * bindings (SHORTCUT_GROUPS), persisted custom bindings (localStorage) and
 * event matching. Covered:
 *   - SHORTCUT_GROUPS integrity: non-empty, every item has id/keys/action,
 *     ids are unique (they double as localStorage keys)
 *   - loadCustomShortcuts/saveCustomShortcuts round-trip against a
 *     mocked window.localStorage (in-memory Map), incl. malformed JSON and
 *     non-object JSON degradation to {}
 *   - defaultShortcutKeys / getEffectiveShortcut: default vs custom
 *     override vs unknown id
 *   - keyEventToCombo / matchesKeyCombo with synthetic KeyboardEvent
 *     objects (a minimal stub is installed because the node test
 *     environment has no DOM KeyboardEvent global)
 *   - matchesShortcut end-to-end with a rebound shortcut
 *
 * NOTE: Node (and Bun) do not provide a global KeyboardEvent, so the tests
 * install a minimal stand-in via vi.stubGlobal with exactly the fields the
 * module reads (key, metaKey, ctrlKey, altKey, shiftKey).
 */
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    defaultShortcutKeys,
    getEffectiveShortcut,
    keyEventToCombo,
    loadCustomShortcuts,
    matchesKeyCombo,
    matchesShortcut,
    saveCustomShortcuts,
    SHORTCUT_GROUPS,
} from "@/lib/shortcuts";

/* ─── Test doubles ─────────────────────────────────────────────────── */

/** Minimal in-memory localStorage. */
function makeLocalStorage(): Storage {
    const store = new Map<string, string>();
    return {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
            return store.size;
        },
    };
}

/**
 * Minimal KeyboardEvent stand-in — the module only reads key/metaKey/
 * ctrlKey/altKey/shiftKey. Installed as the global so tests can write
 * `new KeyboardEvent("keydown", { key: "s", metaKey: true })`.
 */
class KeyboardEventStub {
    type: string;
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;

    constructor(
        type: string,
        init?: { key?: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }
    ) {
        this.type = type;
        this.key = init?.key ?? "";
        this.metaKey = init?.metaKey ?? false;
        this.ctrlKey = init?.ctrlKey ?? false;
        this.altKey = init?.altKey ?? false;
        this.shiftKey = init?.shiftKey ?? false;
    }
}

/** Build a synthetic keydown event from a partial init dict. */
function kbd(init: {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
}): KeyboardEvent {
    const full = {metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...init};
    return new KeyboardEvent("keydown", full) as unknown as KeyboardEvent;
}

let storage: Storage;

beforeEach(() => {
    storage = makeLocalStorage();
    vi.stubGlobal("window", {localStorage: storage});
    vi.stubGlobal("KeyboardEvent", KeyboardEventStub);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

/* ─── SHORTCUT_GROUPS integrity ────────────────────────────────────── */

describe("SHORTCUT_GROUPS", () => {
    it("is non-empty", () => {
        expect(SHORTCUT_GROUPS.length).toBeGreaterThan(0);
    });

    it("every item has a non-empty id, keys and action", () => {
        for (const group of SHORTCUT_GROUPS) {
            expect(typeof group.group).toBe("string");
            expect(group.items.length).toBeGreaterThan(0);
            for (const item of group.items) {
                expect(typeof item.id).toBe("string");
                expect(item.id.length).toBeGreaterThan(0);
                expect(typeof item.keys).toBe("string");
                expect(item.keys.length).toBeGreaterThan(0);
                expect(typeof item.action).toBe("string");
                expect(item.action.length).toBeGreaterThan(0);
            }
        }
    });

    it("has globally unique ids (ids are the localStorage keys for rebinding)", () => {
        const ids = SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => i.id));
        expect(new Set(ids).size).toBe(ids.length);
    });
});

/* ─── localStorage persistence ─────────────────────────────────────── */

describe("loadCustomShortcuts / saveCustomShortcuts", () => {
    it("returns {} when nothing is stored", () => {
        expect(loadCustomShortcuts()).toEqual({});
    });

    it("round-trips a custom bindings map through localStorage", () => {
        const map = {"file.save": "⌘⇧S", "run.runScript": "⌥R"};
        saveCustomShortcuts(map);
        expect(loadCustomShortcuts()).toEqual(map);
    });

    it("persists as JSON under a prefixed custom-shortcuts key", () => {
        saveCustomShortcuts({"file.save": "⌘⇧S"});
        const written = storage.getItem("praxis-custom-shortcuts");
        expect(written).not.toBeNull();
        expect(JSON.parse(written!)).toEqual({"file.save": "⌘⇧S"});
    });

    it("degrades to {} on malformed JSON", () => {
        storage.setItem("praxis-custom-shortcuts", "{not json");
        expect(loadCustomShortcuts()).toEqual({});
    });

    it("degrades to {} when the stored value is JSON but not an object", () => {
        storage.setItem("praxis-custom-shortcuts", "[1,2,3]");
        expect(loadCustomShortcuts()).toEqual({});
        storage.setItem("praxis-custom-shortcuts", '"a string"');
        expect(loadCustomShortcuts()).toEqual({});
    });
});

/* ─── default / effective lookup ───────────────────────────────────── */

describe("defaultShortcutKeys / getEffectiveShortcut", () => {
    it("returns the default binding for a known id", () => {
        expect(defaultShortcutKeys("file.save")).toBe("⌘S");
        expect(getEffectiveShortcut("file.save")).toBe("⌘S");
    });

    it("returns undefined / empty string for an unknown id", () => {
        expect(defaultShortcutKeys("nope.nope")).toBeUndefined();
        expect(getEffectiveShortcut("nope.nope")).toBe("");
    });

    it("a custom binding overrides the default", () => {
        saveCustomShortcuts({"file.save": "⌘⇧S"});
        expect(getEffectiveShortcut("file.save")).toBe("⌘⇧S");
    });

    it("an unbound id still resolves to its default while others are rebound", () => {
        saveCustomShortcuts({"file.save": "⌘⇧S"});
        expect(getEffectiveShortcut("file.settings")).toBe("⌘,");
    });

    it("a custom entry wins even for an id with no default (defensive)", () => {
        saveCustomShortcuts({"nope.nope": "⌘Q"});
        expect(getEffectiveShortcut("nope.nope")).toBe("⌘Q");
    });
});

/* ─── event → combo string ─────────────────────────────────────────── */

describe("keyEventToCombo", () => {
    it("renders ⌘ + uppercase single key for meta combos", () => {
        expect(keyEventToCombo(kbd({key: "s", metaKey: true}))).toBe("⌘S");
    });

    it("treats Ctrl the same as ⌘ (cross-platform display)", () => {
        expect(keyEventToCombo(kbd({key: "s", ctrlKey: true}))).toBe("⌘S");
    });

    it("stacks modifiers in ⌘⌥⇧ order before the key", () => {
        expect(keyEventToCombo(kbd({key: "p", metaKey: true, shiftKey: true}))).toBe("⌘⇧P");
        expect(keyEventToCombo(kbd({key: "f", metaKey: true, altKey: true}))).toBe("⌘⌥F");
        expect(
            keyEventToCombo(kbd({key: "F", metaKey: true, altKey: true, shiftKey: true}))
        ).toBe("⌘⌥⇧F");
    });

    it("maps special keys to their display symbols", () => {
        expect(keyEventToCombo(kbd({key: "Enter", metaKey: true}))).toBe("⌘↵");
        expect(keyEventToCombo(kbd({key: " "}))).toBe("Space");
        expect(keyEventToCombo(kbd({key: "Tab"}))).toBe("Tab");
        expect(keyEventToCombo(kbd({key: "ArrowUp", shiftKey: true}))).toBe("⇧↑");
        expect(keyEventToCombo(kbd({key: "Backspace", metaKey: true}))).toBe("⌘⌫");
        expect(keyEventToCombo(kbd({key: "Delete"}))).toBe("⌦");
    });

    it("passes multi-char keys like F11 / PageDown through unchanged", () => {
        expect(keyEventToCombo(kbd({key: "F11"}))).toBe("F11");
        expect(keyEventToCombo(kbd({key: "PageDown", metaKey: true}))).toBe("⌘PageDown");
    });

    it("returns 'Escape' verbatim (caller cancels recording)", () => {
        expect(keyEventToCombo(kbd({key: "Escape"}))).toBe("Escape");
    });

    it("returns null for bare modifier presses", () => {
        expect(keyEventToCombo(kbd({key: "Shift"}))).toBeNull();
        expect(keyEventToCombo(kbd({key: "Meta"}))).toBeNull();
        expect(keyEventToCombo(kbd({key: "Control"}))).toBeNull();
        expect(keyEventToCombo(kbd({key: "Alt"}))).toBeNull();
    });
});

/* ─── combo matching ───────────────────────────────────────────────── */

describe("matchesKeyCombo", () => {
    it("matches ⌘ combos for both Meta and Ctrl", () => {
        expect(matchesKeyCombo(kbd({key: "s", metaKey: true}), "⌘S")).toBe(true);
        expect(matchesKeyCombo(kbd({key: "s", ctrlKey: true}), "⌘S")).toBe(true);
    });

    it("compares single-letter keys case-insensitively", () => {
        expect(matchesKeyCombo(kbd({key: "s", metaKey: true}), "⌘S")).toBe(true);
        expect(matchesKeyCombo(kbd({key: "S", metaKey: true, shiftKey: true}), "⌘⇧s")).toBe(true);
    });

    it("rejects when a modifier is missing or extra", () => {
        expect(matchesKeyCombo(kbd({key: "f", metaKey: true}), "⌘⇧F")).toBe(false);
        expect(matchesKeyCombo(kbd({key: "f", metaKey: true, shiftKey: true}), "⌘F")).toBe(false);
        expect(matchesKeyCombo(kbd({key: "f"}), "⌘F")).toBe(false);
    });

    it("rejects a different main key", () => {
        expect(matchesKeyCombo(kbd({key: "s", metaKey: true}), "⌘T")).toBe(false);
    });

    it("maps display symbols back to event keys (↵, arrows, Space)", () => {
        expect(matchesKeyCombo(kbd({key: "Enter", metaKey: true}), "⌘↵")).toBe(true);
        expect(matchesKeyCombo(kbd({key: "Enter"}), "⌘↵")).toBe(false);
        expect(matchesKeyCombo(kbd({key: "ArrowDown"}), "↓")).toBe(true);
        expect(matchesKeyCombo(kbd({key: " "}), "Space")).toBe(true);
    });

    it("matches multi-char keys and ⌥/⇧-only combos", () => {
        expect(matchesKeyCombo(kbd({key: "F11"}), "F11")).toBe(true);
        expect(matchesKeyCombo(kbd({key: "F2", shiftKey: true}), "⇧F2")).toBe(true);
        expect(matchesKeyCombo(kbd({key: "F7", altKey: true}), "⌥F7")).toBe(true);
        expect(matchesKeyCombo(kbd({key: "F7"}), "⌥F7")).toBe(false);
    });
});

/* ─── end-to-end: effective binding + matching ─────────────────────── */

describe("matchesShortcut", () => {
    it("matches the default binding without any customization", () => {
        expect(matchesShortcut(kbd({key: "s", metaKey: true}), "file.save")).toBe(true);
        expect(matchesShortcut(kbd({key: "s", metaKey: true}), "run.runScript")).toBe(false);
    });

    it("follows a custom rebinding immediately", () => {
        saveCustomShortcuts({"file.save": "⌘⇧S"});
        // Old binding no longer matches…
        expect(matchesShortcut(kbd({key: "s", metaKey: true}), "file.save")).toBe(false);
        // …the new one does (Shift+s yields key "S").
        expect(matchesShortcut(kbd({key: "S", metaKey: true, shiftKey: true}), "file.save")).toBe(
            true
        );
    });
});
