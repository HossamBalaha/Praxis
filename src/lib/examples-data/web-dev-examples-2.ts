/**
 * web development examples, part 2 (the TypeScript +
 * Browser & DOM groups). Split from web-dev-examples.ts only for
 * editing convenience; examples.ts merges both arrays.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";
import {renderTokens} from "./_tokens";

const CAT = "Web Development";

const ex = (
    id: string, label: string, description: string, sub: string,
    baseName: string, extension: string, body: string,
) => mkExample("web", id, label, description, CAT, sub, baseName, extension, (s) => renderTokens(body, s));

export const WEB_DEV_2_EXAMPLES: FileExample[] = [
    ex("webdev-ex-036", "Enums and exhaustiveness", "enum, const-object enums, and the never-based exhaustiveness check.", "TypeScript", "ts_enums", ".ts",
        `// Enums — and the const-object alternative many teams prefer.

// A classic enum (numeric, auto-incrementing):
enum ⟦cl:LogLevel⟧ { ⟦vr:debug⟧, ⟦vr:info⟧, ⟦vr:warn⟧, ⟦vr:error⟧ }

// A string enum reads better in logs and JSON:
enum ⟦vr:RunStatus⟧ {
  ⟦vr:idle⟧ = "idle",
  ⟦vr:running⟧ = "running",
  ⟦vr:success⟧ = "success",
  ⟦vr:failed⟧ = "failed",
}

// The const-object pattern: plain values, no runtime enum code emitted:
const ⟦vr:Direction⟧ = {
  ⟦vr:north⟧: "N",
  ⟦vr:east⟧: "E",
  ⟦vr:south⟧: "S",
  ⟦vr:west⟧: "W",
} as const;
type ⟦vr:DirectionName⟧ = keyof typeof ⟦vr:Direction⟧;      // "north" | "east" | ...

// Exhaustiveness checking — the killer enum feature:
function ⟦fn:badge_for⟧(⟦vr:status⟧: ⟦vr:RunStatus⟧): string {
  switch (⟦vr:status⟧) {
    case ⟦vr:RunStatus⟧.⟦vr:idle⟧:    return "·";
    case ⟦vr:RunStatus⟧.⟦vr:running⟧: return "◐";
    case ⟦vr:RunStatus⟧.⟦vr:success⟧: return "✓";
    case ⟦vr:RunStatus⟧.⟦vr:failed⟧:  return "✗";
    default: {
      // If a new status is ever added, this line stops compiling:
      const ⟦vr:unreachable⟧: never = ⟦vr:status⟧;
      throw new Error(\`unhandled: \${⟦vr:unreachable⟧}\`);
    }
  }
}

console.log(⟦fn:badge_for⟧(⟦vr:RunStatus⟧.⟦vr:success⟧), ⟦cl:LogLevel⟧[⟦cl:LogLevel⟧.⟦vr:warn⟧]);
const ⟦vr:heading⟧: ⟦vr:DirectionName⟧ = "north";
console.log(⟦vr:heading⟧, "→", ⟦vr:Direction⟧[⟦vr:heading⟧]);

export { ⟦fn:badge_for⟧, ⟦vr:Direction⟧ };
`),

    ex("webdev-ex-037", "The Result type", "Errors as values: a Result<T, E> with map/flatMap — railway-oriented TypeScript.", "TypeScript", "ts_result", ".ts",
        `// Result<T, E> — errors as values, exceptions for the exceptional.

type ⟦cl:Result⟧<T, E> =
  | { ⟦vr:ok⟧: true; ⟦vr:value⟧: T }
  | { ⟦vr:ok⟧: false; ⟦vr:error⟧: E };

const ⟦vr:success⟧ = <T,>(⟦vr:value⟧: T): ⟦cl:Result⟧<T, never> => ({ ⟦vr:ok⟧: true, ⟦vr:value⟧ });
const ⟦vr:failure⟧ = <E,>(⟦vr:error⟧: E): ⟦cl:Result⟧<never, E> => ({ ⟦vr:ok⟧: false, ⟦vr:error⟧ });

// map: transform the SUCCESS lane, pass failures through untouched:
function ⟦fn:map_result⟧<T, U, E>(⟦vr:result⟧: ⟦cl:Result⟧<T, E>, ⟦vr:fn⟧: (⟦vr:value⟧: T) => U): ⟦cl:Result⟧<U, E> {
  return ⟦vr:result⟧.⟦vr:ok⟧ ? ⟦vr:success⟧(⟦vr:fn⟧(⟦vr:result⟧.⟦vr:value⟧)) : ⟦vr:result⟧;
}

// flatMap (andThen): chain fallible steps:
function ⟦fn:flat_map⟧<T, U, E>(⟦vr:result⟧: ⟦cl:Result⟧<T, E>, ⟦vr:fn⟧: (⟦vr:value⟧: T) => ⟦cl:Result⟧<U, E>): ⟦cl:Result⟧<U, E> {
  return ⟦vr:result⟧.⟦vr:ok⟧ ? ⟦vr:fn⟧(⟦vr:result⟧.⟦vr:value⟧) : ⟦vr:result⟧;
}

// The pipeline: parse -> validate -> compute, no try/catch anywhere:
const ⟦fn:parse_positive_int⟧ = (⟦vr:text⟧: string): ⟦cl:Result⟧<number, string> => {
  const ⟦vr:parsed⟧ = Number(⟦vr:text⟧);
  if (!Number.isInteger(⟦vr:parsed⟧) || ⟦vr:parsed⟧ <= 0) {
    return ⟦vr:failure⟧(\`'\${⟦vr:text⟧}' is not a positive integer\`);
  }
  return ⟦vr:success⟧(⟦vr:parsed⟧);
};

const ⟦fn:square⟧ = (⟦vr:n⟧: number): ⟦cl:Result⟧<number, string> =>
  ⟦vr:n⟧ > 1000 ? ⟦vr:failure⟧("too big to bother") : ⟦vr:success⟧(⟦vr:n⟧ * ⟦vr:n⟧);

for (const ⟦vr:input⟧ of ["7", "12", "-3", "abc"]) {
  const ⟦vr:outcome⟧ = ⟦fn:flat_map⟧(⟦fn:parse_positive_int⟧(⟦vr:input⟧), ⟦fn:square⟧);
  console.log(
    ⟦vr:outcome⟧.⟦vr:ok⟧
      ? \`\${⟦vr:input⟧} → \${⟦fn:map_result⟧(⟦vr:outcome⟧, (⟦vr:n⟧) => \`\${⟦vr:n⟧}²\`).⟦vr:value⟧}\`
      : \`\${⟦vr:input⟧} ✗ \${⟦vr:outcome⟧.⟦vr:error⟧}\`
  );
}

export { ⟦vr:success⟧, ⟦vr:failure⟧, ⟦fn:map_result⟧, ⟦fn:flat_map⟧ };
`),

    ex("webdev-ex-038", "Branded types", "Nominal typing for structural TypeScript — IDs that can't be mixed up.", "TypeScript", "branded_types", ".ts",
        `// Branded types — making two identical-looking types incompatible.

// The brand: an invisible phantom field.
type ⟦cl:UserId⟧ = string & { readonly ⟦vr:brand⟧: "⟦cl:UserId⟧" };
type ⟦cl:OrderId⟧ = string & { readonly ⟦vr:brand⟧: "⟦cl:OrderId⟧" };

// Smart constructors — the ONLY way to mint a branded value:
const ⟦fn:make_user_id⟧ = (⟦vr:raw⟧: string): ⟦cl:UserId⟧ => ⟦vr:raw⟧ as ⟦cl:UserId⟧;
const ⟦fn:make_order_id⟧ = (⟦vr:raw⟧: string): ⟦cl:OrderId⟧ => ⟦vr:raw⟧ as ⟦cl:OrderId⟧;

// The database layer refuses raw strings now:
function ⟦fn:load_user⟧(⟦vr:id⟧: ⟦cl:UserId⟧): { ⟦vr:name⟧: string } {
  return { ⟦vr:name⟧: \`user-\${⟦vr:id⟧}\` };
}
function ⟦fn:load_order⟧(⟦vr:id⟧: ⟦cl:OrderId⟧): { ⟦vr:total⟧: number } {
  return { ⟦vr:total⟧: 42 };
}

const ⟦vr:user_id⟧ = ⟦fn:make_user_id⟧("u-123");
const ⟦vr:order_id⟧ = ⟦fn:make_order_id⟧("o-456");

console.log(⟦fn:load_user⟧(⟦vr:user_id⟧).⟦vr:name⟧, ⟦fn:load_order⟧(⟦vr:order_id⟧).⟦vr:total⟧);

// ⟦fn:load_order⟧(⟦vr:user_id⟧);      // ✗ Compile error: UserId is not OrderId
// ⟦fn:load_user⟧("u-123");            // ✗ Compile error: plain string

// Validated numbers — the second classic use:
type ⟦cl:Celsius⟧ = number & { readonly ⟦vr:brand⟧: "⟦cl:Celsius⟧" };
function ⟦fn:to_celsius⟧(⟦vr:raw⟧: number): ⟦cl:Celsius⟧ {
  if (⟦vr:raw⟧ < -273.15) throw new RangeError("below absolute zero");
  return ⟦vr:raw⟧ as ⟦cl:Celsius⟧;
}
const ⟦fn:to_fahrenheit⟧ = (⟦vr:c⟧: ⟦cl:Celsius⟧): number => (⟦vr:c⟧ * 9) / 5 + 32;
console.log(⟦fn:to_fahrenheit⟧(⟦fn:to_celsius⟧(21)).toFixed(1), "°F — the invariant is enforced at the boundary");
`),

    ex("webdev-ex-039", "JSDoc-typed JavaScript", "Type safety in plain .js: JSDoc types + checkJs — migration without a rewrite.", "TypeScript", "jsdoc_types", ".js",
        `// JSDoc typing — full TypeScript checking in a .js file.
// Pair with jsconfig.json: { "compilerOptions": { "checkJs": true,
//   "noEmit": true, "strict": true } }

/**
 * A tide event at a station.
 * @typedef {object} ⟦cl:TideEvent⟧
 * @property {"high" | "low"} ⟦vr:type⟧
 * @property {string} ⟦vr:time⟧        ISO timestamp
 * @property {number} ⟦vr:height_m⟧
 */

/**
 * Parse tide events and keep only the tall ones.
 * @param {string} ⟦vr:csv⟧           raw CSV: "type,time,height_m"
 * @param {number} [⟦vr:min_height⟧=1] drop events below this height
 * @returns {⟦cl:TideEvent⟧[]}
 */
function ⟦fn:parse_tides⟧(⟦vr:csv⟧, ⟦vr:min_height⟧ = 1) {
  /** @type {⟦cl:TideEvent⟧[]} */
  const ⟦vr:events⟧ = [];
  for (const ⟦vr:line⟧ of ⟦vr:csv⟧.trim().split(/\\n/)) {
    const [⟦vr:type⟧, ⟦vr:time⟧, ⟦vr:height_raw⟧] = ⟦vr:line⟧.split(",");
    const ⟦vr:height_m⟧ = Number(⟦vr:height_raw⟧);
    if (⟦vr:height_m⟧ < ⟦vr:min_height⟧) continue;
    ⟦vr:events⟧.push({ ⟦vr:type⟧, ⟦vr:time⟧, ⟦vr:height_m⟧ });
  }
  return ⟦vr:events⟧;
}

/** @type {Map<string, ⟦cl:TideEvent⟧[]>} */
const ⟦vr:by_station⟧ = new Map();
⟦vr:by_station⟧.set("kijkduin", ⟦fn:parse_tides⟧("high,2026-11-14T03:12Z,2.31\\nlow,2026-11-14T09:40Z,0.55"));

// Cast-free generics through JSDoc:
/** @type {Array<{⟦vr:script⟧: string, ⟦vr:ok⟧: boolean}>} */
const ⟦vr:history⟧ = [];
⟦vr:history⟧.push({ ⟦vr:script⟧: "tides.py", ⟦vr:ok⟧: true });

console.log(⟦vr:by_station⟧.get("kijkduin"));
console.log(\`\${⟦vr:history⟧.length} ⟦vr:runs⟧ recorded — typed, in plain JS\`);
`),

    ex("webdev-ex-040", "Node script in TypeScript", "process.argv, env typing, fs/promises and clean exits — a real tsx-runnable tool.", "TypeScript", "ts_node_script", ".ts",
        `// A Node CLI in TypeScript (run with tsx or node ≥ 22.6).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Typed process access — argv and env are the boundaries:
const ⟦vr:args⟧ = process.argv.slice(2) as [⟦vr:in_file⟧: string, ⟦vr:out_file⟧: string, ...⟦vr:rest⟧: string[]];
const ⟦vr:env⟧ = process.env as Record<string, string | undefined>;

if (⟦vr:args⟧.length < 2) {
  console.error("usage: tsx ts_node_script.ts <in.csv> <out.json>");
  process.exit(2);                       // 2 = usage error
}

const [⟦vr:in_file⟧, ⟦vr:out_file⟧] = ⟦vr:args⟧;
const ⟦vr:min_height⟧ = Number(⟦vr:env⟧.⟦vr:MIN_HEIGHT⟧ ?? 1.0);

interface ⟦cl:TideEvent⟧ {
  ⟦vr:type⟧: "high" | "low";
  ⟦vr:time⟧: string;
  ⟦vr:height_m⟧: number;
}

function ⟦fn:parse_tides⟧(⟦vr:csv⟧: string, ⟦vr:min⟧: number): ⟦cl:TideEvent⟧[] {
  return ⟦vr:csv⟧
    .trim()
    .split(/\\n/)
    .map((⟦vr:line⟧) => {
      const [⟦vr:type⟧, ⟦vr:time⟧, ⟦vr:height_raw⟧] = ⟦vr:line⟧.split(",");
      return { ⟦vr:type⟧, ⟦vr:time⟧, ⟦vr:height_m⟧: Number(⟦vr:height_raw⟧) } as ⟦cl:TideEvent⟧;
    })
    .filter((⟦vr:event⟧) => ⟦vr:event⟧.⟦vr:height_m⟧ >= ⟦vr:min⟧);
}

try {
  const ⟦vr:csv⟧ = await readFile(⟦vr:in_file⟧, "utf-8");
  const ⟦vr:events⟧ = ⟦fn:parse_tides⟧(⟦vr:csv⟧, ⟦vr:min_height⟧);

  const ⟦vr:report⟧ = {
    ⟦vr:source⟧: path.basename(⟦vr:in_file⟧),
    ⟦vr:count⟧: ⟦vr:events⟧.length,
    ⟦vr:high_water⟧: ⟦vr:events⟧.filter((⟦vr:event⟧) => ⟦vr:event⟧.⟦vr:type⟧ === "high").length,
    ⟦vr:events⟧,
  };

  await writeFile(⟦vr:out_file⟧, JSON.stringify(⟦vr:report⟧, null, 2) + "\\n");
  console.log(\`✓ \${⟦vr:events⟧.length} ⟦vr:events⟧ (≥ \${⟦vr:min_height⟧}m) → \${⟦vr:out_file⟧}\`);
  process.exit(0);
} catch (⟦vr:err⟧) {
  console.error(\`✗ \${(⟦vr:err⟧ as NodeJS.ErrnoException).message}\`);
  process.exit(1);                       // 1 = runtime failure
}
`),

    ex("webdev-ex-041", "History and routing", "pushState, replaceState, popstate — a hash-free router in 30 lines.", "Browser & DOM", "history_routing", ".js",
        `// The History API — client-side routing without a framework.

const ⟦vr:routes⟧ = {
  "/":        () => "⟦vr:home⟧ ⟦vr:page⟧ — pick a folder to begin",
  "/runs":    () => "runs list ⟦vr:page⟧",
  "/settings": () => "settings ⟦vr:page⟧",
};

const ⟦fn:render_route⟧ = () => {
  const ⟦vr:path⟧ = location.pathname;
  const ⟦vr:handler⟧ = ⟦vr:routes⟧[⟦vr:path⟧] ?? (() => \`no ⟦vr:route⟧ for \${⟦vr:path⟧}\`);
  const ⟦vr:outlet⟧ = document.querySelector("#outlet");
  if (⟦vr:outlet⟧) ⟦vr:outlet⟧.textContent = ⟦vr:handler⟧();
  document.querySelectorAll("[data-link]").forEach((⟦vr:link⟧) => {
    if (⟦vr:link⟧.getAttribute("href") === ⟦vr:path⟧) ⟦vr:link⟧.setAttribute("aria-current", "⟦vr:page⟧");
    else ⟦vr:link⟧.removeAttribute("aria-current");
  });
};

// Intercept same-origin link clicks:
document.addEventListener("click", (⟦vr:event⟧) => {
  const ⟦vr:link⟧ = ⟦vr:event⟧.target.closest?.("a[href]");
  if (!⟦vr:link⟧ || ⟦vr:link⟧.target || ⟦vr:event⟧.metaKey || ⟦vr:event⟧.ctrlKey) return;
  if (!⟦vr:link⟧.href.startsWith(location.origin)) return;      // external
  ⟦vr:event⟧.preventDefault();
  history.pushState({}, "", ⟦vr:link⟧.href);                    // NO reload
  ⟦fn:render_route⟧();
});

// Back / forward buttons:
window.addEventListener("popstate", ⟦fn:render_route⟧);

// replaceState: canonicalize without polluting history:
if (location.pathname !== "/" && !⟦vr:routes⟧[location.pathname]) {
  history.replaceState({}, "", "/");
}
⟦fn:render_route⟧();
`),

    ex("webdev-ex-042", "Clipboard API", "Write and read the clipboard with permissions and a textarea fallback.", "Browser & DOM", "clipboard_api", ".js",
        `// The Clipboard API — with the legacy fallback nobody can delete yet.

// Writing is widely supported (user gesture required):
async function ⟦fn:copy_text⟧(⟦vr:text⟧) {
  try {
    await navigator.clipboard.writeText(⟦vr:text⟧);
    console.log(\`copied \${⟦vr:text⟧.length} chars\`);
    return true;
  } catch (⟦vr:err⟧) {
    console.warn("clipboard blocked:", ⟦vr:err⟧.message);
    return ⟦fn:copy_fallback⟧(⟦vr:text⟧);
  }
}

// Reading needs permission — ask, don't assume:
async function ⟦fn:read_clipboard⟧() {
  if (!navigator.clipboard?.read) return null;
  try {
    const ⟦vr:permission⟧ = await navigator.permissions.query({ name: "clipboard-read" });
    if (⟦vr:permission⟧.state === "denied") return null;
    return await navigator.clipboard.readText();
  } catch {
    return null;                       // Firefox: read needs a paste event
  }
}

// The execCommand fallback (deprecated but eternal):
function ⟦fn:copy_fallback⟧(⟦vr:text⟧) {
  const ⟦vr:scratch⟧ = document.createElement("textarea");
  ⟦vr:scratch⟧.value = ⟦vr:text⟧;
  ⟦vr:scratch⟧.⟦vr:style⟧.position = "fixed";
  ⟦vr:scratch⟧.⟦vr:style⟧.opacity = "0";
  document.body.append(⟦vr:scratch⟧);
  ⟦vr:scratch⟧.select();
  const ⟦vr:ok⟧ = document.execCommand("copy");
  ⟦vr:scratch⟧.remove();
  return ⟦vr:ok⟧;
}

// A "paste to search" field — the sanctioned read path:
document.addEventListener("paste", (⟦vr:event⟧) => {
  const ⟦vr:field⟧ = ⟦vr:event⟧.target.closest?.("[data-paste-search]");
  if (!⟦vr:field⟧) return;
  const ⟦vr:text⟧ = ⟦vr:event⟧.clipboardData.getData("text/plain").trim();
  if (⟦vr:text⟧) {
    ⟦vr:event⟧.preventDefault();
    ⟦vr:field⟧.value = ⟦vr:text⟧;
    console.log("searching for pasted:", ⟦vr:text⟧);
  }
});

if (typeof document === "undefined") console.log("browser-only");
else ⟦fn:copy_text⟧("tide table 2026-11-14");
`),

    ex("webdev-ex-043", "Drag and drop", "dragstart / dragover / drop with dataTransfer — a sortable list without libraries.", "Browser & DOM", "drag_drop", ".js",
        `// Drag & drop — reordering a list, plus dropping FILES.

const ⟦fn:setup_drag⟧ = () => {
  let ⟦vr:dragged⟧ = null;

  document.querySelectorAll("[draggable]").forEach((⟦vr:item⟧) => {
    ⟦vr:item⟧.addEventListener("dragstart", (⟦vr:event⟧) => {
      ⟦vr:dragged⟧ = ⟦vr:item⟧;
      ⟦vr:event⟧.dataTransfer.effectAllowed = "move";
      ⟦vr:event⟧.dataTransfer.setData("text/plain", ⟦vr:item⟧.dataset.⟦vr:id⟧ ?? "");
      ⟦vr:item⟧.classList.add("dragging");
    });

    ⟦vr:item⟧.addEventListener("dragend", () => {
      ⟦vr:item⟧?.classList.remove("dragging");
      ⟦vr:dragged⟧ = null;
      document.querySelectorAll(".drop-before").forEach((⟦vr:element⟧) => ⟦vr:element⟧.classList.remove("drop-before"));
    });

    ⟦vr:item⟧.addEventListener("dragover", (⟦vr:event⟧) => {
      ⟦vr:event⟧.preventDefault();               // REQUIRED or drop never fires
      ⟦vr:event⟧.dataTransfer.dropEffect = "move";
      if (⟦vr:item⟧ === ⟦vr:dragged⟧) return;
      const ⟦vr:rect⟧ = ⟦vr:item⟧.getBoundingClientRect();
      const ⟦vr:before⟧ = ⟦vr:event⟧.clientY < ⟦vr:rect⟧.top + ⟦vr:rect⟧.height / 2;
      ⟦vr:item⟧.classList.toggle("drop-before", ⟦vr:before⟧);
    });

    ⟦vr:item⟧.addEventListener("drop", (⟦vr:event⟧) => {
      ⟦vr:event⟧.preventDefault();
      if (!⟦vr:dragged⟧ || ⟦vr:item⟧ === ⟦vr:dragged⟧) return;
      const ⟦vr:parent⟧ = ⟦vr:item⟧.parentNode;
      const ⟦vr:rect⟧ = ⟦vr:item⟧.getBoundingClientRect();
      const ⟦vr:before⟧ = ⟦vr:event⟧.clientY < ⟦vr:rect⟧.top + ⟦vr:rect⟧.height / 2;
      ⟦vr:parent⟧?.insertBefore(⟦vr:dragged⟧, ⟦vr:before⟧ ? ⟦vr:item⟧ : ⟦vr:item⟧.nextSibling);
      console.log("reordered:", [...⟦vr:parent⟧?.children ?? []].map((⟦vr:child⟧) => ⟦vr:child⟧.dataset.⟦vr:id⟧));
    });
  });

  // FILE drops — dataTransfer.files on a target zone:
  const ⟦vr:drop_zone⟧ = document.querySelector("#dropzone");
  ⟦vr:drop_zone⟧?.addEventListener("dragover", (⟦vr:event⟧) => {
    ⟦vr:event⟧.preventDefault();
    ⟦vr:drop_zone⟧.classList.add("over");
  });
  ⟦vr:drop_zone⟧?.addEventListener("drop", async (⟦vr:event⟧) => {
    ⟦vr:event⟧.preventDefault();
    ⟦vr:drop_zone⟧.classList.remove("over");
    for (const ⟦vr:file⟧ of ⟦vr:event⟧.dataTransfer.files) {
      console.log(\`\${⟦vr:file⟧.name}: \${⟦vr:file⟧.type}, \${⟦vr:file⟧.size} bytes\`);
      if (⟦vr:file⟧.text) console.log((await ⟦vr:file⟧.text()).slice(0, 80));
    }
  });
};

if (typeof document === "undefined") console.log("browser-only — needs draggable elements");
else ⟦fn:setup_drag⟧();
`),

    ex("webdev-ex-044", "Custom elements", "A framework-free component: customElements.define, attributes and shadow DOM.", "Browser & DOM", "custom_elements", ".js",
        `// Custom elements — your own HTML tags, in ~40 lines.

class ⟦cl:TideCard⟧ extends HTMLElement {
  // Observed attributes trigger attributeChangedCallback:
  static get observedAttributes() {
    return ["⟦vr:station⟧", "⟦vr:height_m⟧"];
  }

  constructor() {
    super();
    // Shadow DOM: styles and markup stay INSIDE the component:
    const ⟦vr:shadow⟧ = this.attachShadow({ mode: "open" });
    ⟦vr:shadow⟧.innerHTML = \`
      <style>
        :host { display: block; font: 14px/1.5 system-ui, sans-serif; }
        .card { border: 1px solid #d5e0d9; border-radius: 10px; padding: 12px 14px;
                display: grid; gap: 4px; background: #f7faf8; }
        .⟦vr:station⟧-name { font-weight: 700; letter-spacing: .02em; }
        .⟦vr:height⟧-value { color: #2c6e5b; font-variant-numeric: tabular-nums; }
        .⟦vr:bar⟧-track { height: 6px; border-radius: 3px; background: #e1ebe5; overflow: hidden; }
        .⟦vr:bar⟧-track > div { height: 100%; background: #2c6e5b; transition: width .4s ease; }
      </style>
      <div class="card">
        <span class="⟦vr:station⟧-name"></span>
        <span class="⟦vr:height⟧-value"></span>
        <div class="⟦vr:bar⟧-track"><div></div></div>
        <slot></slot>
      </div>\`;
  }

  attributeChangedCallback(⟦vr:name⟧, ⟦vr:old_value⟧, ⟦vr:new_value⟧) {
    // React to attribute changes from ANY direction:
    const ⟦vr:station_el⟧ = this.shadowRoot.querySelector(".⟦vr:station⟧-name");
    const ⟦vr:height_el⟧ = this.shadowRoot.querySelector(".⟦vr:height⟧-value");
    const ⟦vr:bar_el⟧ = this.shadowRoot.querySelector(".⟦vr:bar⟧-track > div");
    if (⟦vr:name⟧ === "⟦vr:station⟧") ⟦vr:station_el⟧.textContent = ⟦vr:new_value⟧ ?? "";
    if (⟦vr:name⟧ === "⟦vr:height_m⟧") {
      const ⟦vr:height⟧ = Number(⟦vr:new_value⟧);
      ⟦vr:height_el⟧.textContent = \`\${⟦vr:height⟧.toFixed(2)} m\`;
      ⟦vr:bar_el⟧.⟦vr:style⟧.⟦vr:width⟧ = \`\${Math.min(100, (⟦vr:height⟧ / 3) * 100)}%\`;
    }
  }
}

// Register — then <tide-card station="Kijkduin" height-m="2.31"> just works:
if (typeof customElements !== "undefined") {
  customElements.define("tide-card", ⟦cl:TideCard⟧);
  console.log("<tide-card> registered — drop it into any HTML ⟦vr:page⟧");
} else {
  console.log("browser-only — customElements unavailable here");
}
`),

    ex("webdev-ex-045", "Page visibility and connectivity", "Pause work in hidden tabs, react to going offline — the polite background behaviors.", "Browser & DOM", "visibility_connectivity", ".js",
        `// Visibility + connectivity — being polite about the user's battery.

// 1. PAUSE polling when the tab is hidden:
const ⟦vr:polling⟧ = {
  ⟦vr:interval_ms⟧: 5000,
  ⟦vr:timer⟧: null,
  ⟦fn:start⟧() {
    if (this.⟦vr:timer⟧ || document.hidden) return;
    this.⟦vr:timer⟧ = setInterval(() => console.log("polling…"), this.⟦vr:interval_ms⟧);
    console.log("polling started");
  },
  ⟦fn:stop⟧() {
    clearInterval(this.⟦vr:timer⟧);
    this.⟦vr:timer⟧ = null;
    console.log("polling stopped");
  },
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    ⟦vr:polling⟧.⟦fn:stop⟧();                          // the tab is invisible
  } else {
    ⟦vr:polling⟧.⟦fn:start⟧();
    ⟦fn:refresh_now⟧();                                // catch up immediately
  }
});

const ⟦fn:refresh_now⟧ = () => console.log("refreshing on return");

// 2. Save state on hide — the mobile pattern:
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    sessionStorage.setItem("⟦vr:scroll_position⟧", String(scrollY));
  } else {
    const ⟦vr:saved⟧ = Number(sessionStorage.getItem("⟦vr:scroll_position⟧") ?? 0);
    console.log(\`restoring ⟦vr:scroll⟧ to \${⟦vr:saved⟧}\`);
    scrollTo({ top: ⟦vr:saved⟧ });
  }
});

// 3. Connectivity — queue work while offline:
const ⟦vr:outbox⟧ = [];
window.addEventListener("online", async () => {
  console.log(\`back online — flushing \${⟦vr:outbox⟧.length} queued ⟦vr:items⟧\`);
  while (⟦vr:outbox⟧.length) {
    const ⟦vr:item⟧ = ⟦vr:outbox⟧.shift();
    await new Promise((r) => setTimeout(r, 100));     // fetch(...)
    console.log("sent:", ⟦vr:item⟧);
  }
});
window.addEventListener("offline", () => {
  console.log("offline — new ⟦vr:items⟧ will queue");
  ⟦vr:outbox⟧.push("⟦vr:run_report⟧-001");
});

if (typeof document === "undefined") {
  console.log("browser-only — patterns for a live ⟦vr:page⟧");
} else {
  ⟦vr:polling⟧.⟦fn:start⟧();
  console.log("⟦vr:connection⟧:", navigator.onLine ? "online" : "offline");
}
`),
];
