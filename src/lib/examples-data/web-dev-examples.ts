/**
 * 50 WEB DEVELOPMENT templates (the "web develop" half of
 * the user's examples request): modern JavaScript, TypeScript and
 * browser/DOM programming. .js / .ts files run in Praxis through
 * Node.js / tsx the moment either is installed (the runtime chip in
 * the viewer header says which is missing).
 *
 * JavaScript / TypeScript bodies use the naming tokens (⟦fn:…⟧
 * ⟦vr:…⟧ ⟦cl:…⟧ ⟦ky:…⟧) so Settings → Editor → Naming style restyles
 * identifiers at creation time, exactly like the Python library.
 */
import type {FileExample} from "@/lib/examples";
import {mkExample} from "./_helpers";
import {renderTokens} from "./_tokens";
// part 2 (TypeScript + Browser & DOM) lives beside this file.
import {WEB_DEV_2_EXAMPLES} from "./web-dev-examples-2";

const CAT = "Web Development";

const ex = (
    id: string, label: string, description: string, sub: string,
    baseName: string, extension: string, body: string,
) => mkExample("web", id, label, description, CAT, sub, baseName, extension, (s) => renderTokens(body, s));

export const WEB_DEV_EXAMPLES: FileExample[] = [
    ...WEB_DEV_2_EXAMPLES,
    ex("webdev-ex-001", "Hello, console", "console.log with format substitutions and a table — the debugging daily driver.", "JavaScript", "hello_console", ".js",
        `// Hello, console — more than just log.
const ⟦vr:app_name⟧ = "Praxis";

console.log("Hello from %s!", ⟦vr:app_name⟧);        // %s substitution
console.info("an info-level note");
console.warn("this one is yellow");
console.error("this one is red (and counts as an error)");

// Multiple values print spaced, objects expand:
const ⟦vr:session⟧ = { user: "ada", minutes: 12, tools: ["run", "format"] };
console.log("session:", ⟦vr:session⟧);

// console.table lays out arrays of objects:
const ⟦vr:runs⟧ = [
  { script: "a.py", ms: 412, ok: true },
  { script: "b.py", ms: 188, ok: true },
  { script: "c.py", ms: 6310, ok: false },
];
console.table(⟦vr:runs⟧);

// Timing a block:
console.time("heavy-step");
let ⟦vr:total⟧ = 0;
for (let ⟦vr:i⟧ = 0; ⟦vr:i⟧ < 1e6; ⟦vr:i⟧++) ⟦vr:total⟧ += ⟦vr:i⟧;
console.timeEnd("heavy-step");
console.log("total =", ⟦vr:total⟧);
`),

    ex("webdev-ex-002", "Variables and types", "let / const, typeof, template literals and the null-vs-undefined distinction.", "JavaScript", "variables_types", ".js",
        `// Variables, types and template literals.

const ⟦vr:limit⟧ = 100;            // const: never reassigned
let ⟦vr:count⟧ = 0;                // let: will change
// var ⟦vr:legacy⟧ = "avoid me";   // function-scoped, hoisted quirks

⟦vr:count⟧ += 42;
console.log(⟦vr:count⟧, typeof ⟦vr:count⟧);          // 42 number

// typeof for every primitive:
console.log(typeof "text", typeof 42, typeof 3.14, typeof true, typeof undefined);
console.log(typeof null, "← the famous typeof bug");
console.log(typeof (() => 1), typeof {}, typeof []);

// null vs undefined:
let ⟦vr:empty⟧;                    // declared, unassigned -> undefined
const ⟦vr:absent⟧ = null;          // intentionally empty
console.log(⟦vr:empty⟧ === undefined, ⟦vr:absent⟧ === null);

// Template literals: interpolation + multiline.
const ⟦vr:user⟧ = { name: "Grace", items: 3 };
const ⟦vr:badge⟧ = \`\${⟦vr:user⟧.name} has \${⟦vr:user⟧.items} item\${⟦vr:user⟧.items === 1 ? "" : "s"}\`;
console.log(⟦vr:badge⟧);

// Numeric separators + BigInt for the big stuff:
console.log(1_000_000, 2n ** 64n);
`),

    ex("webdev-ex-003", "Arrays", "map / filter / reduce / find / some / flat — the array toolkit without a single loop.", "JavaScript", "arrays_toolkit", ".js",
        `// The array toolkit — thinking in transformations.

const ⟦vr:readings⟧ = [12, 47, 8, 93, 31, 55, 8, 66];

// map: transform each element:
const ⟦vr:in_celsius⟧ = ⟦vr:readings⟧.map((r) => ((r - 32) * 5) / 9);

// filter: keep the matching ones:
const ⟦vr:high⟧ = ⟦vr:readings⟧.filter((r) => r > 30);

// reduce: collapse to one value:
const ⟦vr:mean⟧ = ⟦vr:readings⟧.reduce((sum, r) => sum + r, 0) / ⟦vr:readings⟧.length;

// find / findIndex: the FIRST match:
const ⟦vr:first_big⟧ = ⟦vr:readings⟧.find((r) => r > 60);
const ⟦vr:first_big_at⟧ = ⟦vr:readings⟧.findIndex((r) => r > 60);

// some / every: boolean questions:
console.log("any above 90:", ⟦vr:readings⟧.some((r) => r > 90));
console.log("all positive:", ⟦vr:readings⟧.every((r) => r > 0));

// Chaining reads like a pipeline:
const ⟦vr:report⟧ = ⟦vr:readings⟧
  .filter((r) => r > 10)
  .map((r) => r * 2)
  .reduce((sum, r) => sum + r, 0);

console.log({ ⟦vr:high⟧, ⟦vr:mean⟧, ⟦vr:first_big⟧, ⟦vr:first_big_at⟧, ⟦vr:report⟧ });

// flat + flatMap for nested structures:
const ⟦vr:matrix⟧ = [[1, 2], [3, [4, 5]]];
console.log(⟦vr:matrix⟧.flat(2));                       // [1,2,3,4,5]
console.log([[1], [2, 3]].flatMap((x) => x));          // [1,2,3]
`),

    ex("webdev-ex-004", "Objects", "Shorthand, computed keys, destructuring, spread and Object.entries round-trips.", "JavaScript", "objects_deep", ".js",
        `// Objects — construction, destructuring, iteration.

const ⟦vr:name⟧ = "Tide Watch";
const ⟦vr:station⟧ = {
  ⟦vr:name⟧,                       // shorthand property
  ["lat" + "Lng"]: [51.9, 4.4],    // computed key
  depth: 18,
  tags: ["coastal", "tidal"],
};

// Destructuring with defaults + rename:
const { depth: ⟦vr:depth_m⟧, owner = "unknown", ⟦vr:name⟧: ⟦vr:station_name⟧ } = ⟦vr:station⟧;
console.log(⟦vr:station_name⟧, ⟦vr:depth_m⟧, owner);

// Spread: copies and merges (shallow!):
const ⟦vr:updated⟧ = { ...⟦vr:station⟧, depth: 21, checked: new Date().toISOString() };
console.log(⟦vr:updated⟧.depth, ⟦vr:updated⟧.tags === ⟦vr:station⟧.tags, "same array ref (shallow)");

// rest in destructuring collects the remainder:
const { tags, ...⟦vr:without_tags⟧ } = ⟦vr:station⟧;
console.log(⟦vr:without_tags⟧);

// Object.entries / keys / values — the iteration trio:
for (const [⟦vr:key⟧, ⟦vr:value⟧] of Object.entries(⟦vr:station⟧)) {
  console.log(\`\${⟦vr:key⟧.padEnd(9)} = \${JSON.stringify(⟦vr:value⟧)}\`);
}

// fromEntries closes the loop (object -> entries -> object):
const ⟦vr:doubled⟧ = Object.fromEntries(
  Object.entries({ a: 1, b: 2 }).map(([k, v]) => [k, v * 2])
);
console.log(⟦vr:doubled⟧);
`),

    ex("webdev-ex-005", "Functions and arrows", "Declarations, expressions, arrows, defaults, rest args and the this-free life.", "JavaScript", "functions", ".js",
        `// Functions — every shape, and when each fits.

// Function declaration (hoisted):
⟦fn:add⟧(2, 3);
function ⟦fn:add⟧(a, b) { return a + b; }

// Function expression (not hoisted):
const ⟦fn:multiply⟧ = function (a, b) { return a * b; };

// Arrow: concise, and \`this\` stays lexical:
const ⟦fn:square⟧ = (x) => x * x;
const ⟦fn:mean⟧ = (⟦vr:nums⟧) => ⟦vr:nums⟧.reduce((s, n) => s + n, 0) / ⟦vr:nums⟧.length;

// Default parameters:
const ⟦fn:greet⟧ = (⟦vr:who⟧ = "world", ⟦vr:punct⟧ = "!") => \`Hello \${⟦vr:who⟧}\${⟦vr:punct⟧}\`;
console.log(⟦fn:greet⟧(), ⟦fn:greet⟧("Praxis", "."));

// Rest parameters: any number of args:
const ⟦fn:sum_all⟧ = (...⟦vr:values⟧) => ⟦vr:values⟧.reduce((s, v) => s + v, 0);
console.log(⟦fn:sum_all⟧(1, 2, 3, 4));

// Higher-order: functions making functions.
const ⟦fn:multiplier⟧ = (factor) => (x) => x * factor;
const ⟦fn:times3⟧ = ⟦fn:multiplier⟧(3);
console.log(⟦fn:times3⟧(14));

// Recursive with a guard:
const ⟦fn:countdown⟧ = (n) => (n <= 0 ? "liftoff" : \`\${n}… \${⟦fn:countdown⟧(n - 1)}\`);
console.log(⟦fn:countdown⟧(5));

console.log([⟦fn:add⟧(1, 2), ⟦fn:multiply⟧(3, 4), ⟦fn:square⟧(5), ⟦fn:mean⟧([2, 4, 9])]);
`),

    ex("webdev-ex-006", "Classes", "class with fields, getters, statics, private (#) members and inheritance.", "JavaScript", "classes", ".js",
        `// Classes — fields, getters, static, private, extends.

class ⟦cl:Counter⟧ {
  static ⟦ky:instances⟧ = 0;                  // shared on the class
  #⟦vr:value⟧ = 0;                            // truly private field

  constructor(⟦vr:label⟧) {
    this.⟦vr:label⟧ = ⟦vr:label⟧;
    ⟦cl:Counter⟧.⟦ky:instances⟧++;
  }

  ⟦fn:increment⟧(step = 1) {
    this.#⟦vr:value⟧ += step;
    return this;                              // chainable
  }

  get ⟦vr:value⟧() {                          // computed property
    return this.#⟦vr:value⟧;
  }

  ⟦fn:describe⟧() {
    return \`\${this.⟦vr:label⟧}: \${this.#⟦vr:value⟧}\`;
  }
}

class ⟦cl:TimedCounter⟧ extends ⟦cl:Counter⟧ {
  #⟦vr:last_tick⟧ = null;

  ⟦fn:increment⟧(step = 1) {
    this.#⟦vr:last_tick⟧ = new Date().toISOString();
    return super.⟦fn:increment⟧(step);
  }

  ⟦fn:describe⟧() {
    return \`\${super.⟦fn:describe⟧} (last tick \${this.#⟦vr:last_tick⟧ ?? "never"})\`;
  }
}

const ⟦vr:hits⟧ = new ⟦cl:TimedCounter⟧("hits");
⟦vr:hits⟧.⟦fn:increment⟧().⟦fn:increment⟧(5);
console.log(⟦vr:hits⟧.⟦fn:describe⟧());
console.log("value getter:", ⟦vr:hits⟧.⟦vr:value⟧);
console.log("instances made:", ⟦cl:Counter⟧.⟦ky:instances⟧);
// console.log(⟦vr:hits⟧.#⟦vr:value⟧);  // SyntaxError — private!
`),

    ex("webdev-ex-007", "Destructuring patterns", "Swap variables, pluck from nested structures, default whole objects, destructure in parameters.", "JavaScript", "destructuring", ".js",
        `// Destructuring — the pattern-matching JavaScript actually has.

// 1. The classic swap, no temp:
let ⟦vr:x⟧ = 1, ⟦vr:y⟧ = 2;
[⟦vr:x⟧, ⟦vr:y⟧] = [⟦vr:y⟧, ⟦vr:x⟧];
console.log(⟦vr:x⟧, ⟦vr:y⟧);                  // 2 1

// 2. Skip elements, collect the rest:
const ⟦vr:results⟧ = ["ok", "ok", "slow", "fail", "ok"];
const [first, , third, ...⟦vr:rest⟧] = ⟦vr:results⟧;
console.log({ first, third, ⟦vr:rest⟧ });

// 3. Nested objects:
const ⟦vr:api_response⟧ = {
  data: { user: { ⟦vr:name⟧: "Ada", roles: ["admin", "dev"] } },
  meta: { page: 1, total: 1 },
};
const {
  data: { user: { ⟦vr:name⟧, roles: [⟦vr:primary_role⟧] } },
  meta: { total },
} = ⟦vr:api_response⟧;
console.log(⟦vr:name⟧, ⟦vr:primary_role⟧, "of", total);

// 4. Defaults for the WHOLE parameter object:
const ⟦fn:draw_chart⟧ = ({ ⟦vr:width⟧ = 400, ⟦vr:height⟧ = 300, ⟦vr:theme⟧ = "light", ⟦vr:title⟧ = "" } = {}) =>
  \`\${⟦vr:title⟧ || "untitled"} @ \${⟦vr:width⟧}x\${⟦vr:height⟧} (\${⟦vr:theme⟧})\`;
console.log(⟦fn:draw_chart⟧({ ⟦vr:title⟧: "Tides" }));
console.log(⟦fn:draw_chart⟧());

// 5. For-of with index-free iteration over entries:
for (const [⟦vr:index⟧, ⟦vr:value⟧] of ["a", "b", "c"].entries()) {
  console.log(⟦vr:index⟧, "→", ⟦vr:value⟧);
}
`),

    ex("webdev-ex-008", "Spread and rest", "Clone arrays/objects, merge configs, push-and-spread — the three dots in both roles.", "JavaScript", "spread_rest", ".js",
        `// ...spread (expand) and ...rest (collect).

// Clone (one level):
const ⟦vr:base⟧ = [1, 2, 3];
const ⟦vr:copy⟧ = [...⟦vr:base⟧];
⟦vr:copy⟧.push(4);
console.log(⟦vr:base⟧, ⟦vr:copy⟧);            // base untouched

// Concatenate + insert in the middle:
const ⟦vr:mixed⟧ = [0, ...⟦vr:base⟧, 5, ...⟦vr:copy⟧];

// Object merging — later wins:
const ⟦vr:defaults⟧ = { ⟦vr:theme⟧: "light", ⟦vr:timeout⟧: 30, ⟦vr:retries⟧: 2 };
const ⟦vr:overrides⟧ = { ⟦vr:theme⟧: "dark", ⟦vr:timeout⟧: 60 };
const ⟦vr:config⟧ = { ...⟦vr:defaults⟧, ...⟦vr:overrides⟧, ⟦vr:source⟧: "file" };
console.log(⟦vr:config⟧);

// Function calls: spread an array as arguments:
const ⟦fn:area⟧ = (w, h) => w * h;
const ⟦vr:dimensions⟧ = [640, 480];
console.log(⟦fn:area⟧(...⟦vr:dimensions⟧));

// Math.max is the canonical use:
console.log(Math.max(...⟦vr:mixed⟧));

// REST — gather the remaining params:
const ⟦fn:tag⟧ = (⟦vr:kind⟧, ...⟦vr:items⟧) => \`\${⟦vr:kind⟧}[\${⟦vr:items⟧.join(", ")}]\`;
console.log(⟦fn:tag⟧("todo", "write tests", "ship"));

// ...and gather remaining object keys:
const { ⟦vr:id⟧, ...⟦vr:public_fields⟧ } = { ⟦vr:id⟧: 7, ⟦vr:name⟧: "row", ⟦vr:ok⟧: true };
console.log("stripped ⟦vr:id⟧:", { ⟦vr:id⟧, ⟦vr:public_fields⟧ });
`),

    ex("webdev-ex-009", "Iterators and generators", "for…of, Symbol.iterator, function* and yield — lazy sequences in a dozen lines.", "JavaScript", "generators", ".js",
        `// Iterators and generators — lazy sequences.

// A custom iterable: range(1, 6) works in for..of:
function ⟦fn:range⟧(⟦vr:start⟧, ⟦vr:stop⟧, ⟦vr:step⟧ = 1) {
  return {
    [Symbol.iterator]() {
      let ⟦vr:current⟧ = ⟦vr:start⟧;
      return {
        next: () => {
          if (⟦vr:current⟧ >= ⟦vr:stop⟧) return { done: true };
          const ⟦vr:value⟧ = ⟦vr:current⟧;
          ⟦vr:current⟧ += ⟦vr:step⟧;
          return { ⟦vr:value⟧, done: false };
        },
      };
    },
  };
}
console.log("range:", [...⟦fn:range⟧(1, 6)]);

// The generator equivalent — 4 lines instead of 14:
function* ⟦fn:fibonacci⟧(⟦vr:count⟧) {
  let [a, b] = [0, 1];
  for (let ⟦vr:i⟧ = 0; ⟦vr:i⟧ < ⟦vr:count⟧; ⟦vr:i⟧++) {
    yield a;
    [a, b] = [b, a + b];
  }
}

console.log("fib:", [...⟦fn:fibonacci⟧(10)]);

// Generators compose lazily — nothing runs until consumed:
function* ⟦fn:take⟧(n, ⟦vr:source⟧) {
  let ⟦vr:left⟧ = n;
  for (const ⟦vr:element⟧ of ⟦vr:source⟧) {
    if (⟦vr:left⟧-- <= 0) return;
    yield ⟦vr:element⟧;
  }
}

// Infinite generator + take = an idiomatic pipeline:
function* ⟦vr:natural_numbers⟧() {
  for (let ⟦vr:n⟧ = 1; ; ⟦vr:n⟧++) yield ⟦vr:n⟧;
}
const ⟦vr:first_five_squares⟧ = [...⟦fn:take⟧(5, ⟦fn:fibonacci⟧(1000))].map((n) => n * n);
console.log("lazy squares:", ⟦vr:first_five_squares⟧);

// for..of over a Map keeps entries together:
const ⟦vr:units⟧ = new Map([["m", 1], ["km", 1000], ["mi", 1609]]);
for (const [⟦vr:unit⟧, ⟦vr:factor⟧] of ⟦vr:units⟧) console.log(⟦vr:unit⟧, ⟦vr:factor⟧);
`),

    ex("webdev-ex-010", "Promises", "Promise construction, chaining with values, error propagation, all vs race vs allSettled.", "JavaScript", "promises", ".js",
        `// Promises — the async primitive underneath async/await.

const ⟦fn:fetch_json⟧ = (⟦vr:url⟧, ⟦vr:delay_ms⟧ = 200) =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      if (⟦vr:url⟧.startsWith("/api/")) resolve({ ⟦vr:url⟧, ⟦vr:bytes⟧: 128 });
      else reject(new Error(\`bad url: \${⟦vr:url⟧}\`));
    }, ⟦vr:delay_ms⟧);
  });

// Chaining: each .then returns a NEW promise carrying the return value:
⟦fn:fetch_json⟧("/api/tides")
  .then((⟦vr:data⟧) => { console.log("got", ⟦vr:data⟧); return ⟦vr:data⟧.⟦vr:bytes⟧; })
  .then((⟦vr:bytes⟧) => console.log("bytes:", ⟦vr:bytes⟧))
  .catch((⟦vr:err⟧) => console.error("chain failed:", ⟦vr:err⟧.message))
  .finally(() => console.log("chain settled"));

// all: waits for every success; one failure rejects the whole thing.
Promise.all([⟦fn:fetch_json⟧("/api/a"), ⟦fn:fetch_json⟧("/api/b")])
  .then((⟦vr:all⟧) => console.log("all:", ⟦vr:all⟧));

// allSettled: every outcome, failures included:
Promise.allSettled([⟦fn:fetch_json⟧("/api/a"), ⟦fn:fetch_json⟧("nope.example")])
  .then((⟦vr:results⟧) => ⟦vr:results⟧.forEach((⟦vr:result⟧) =>
    console.log(⟦vr:result⟧.status, ⟦vr:result⟧.status === "fulfilled" ? ⟦vr:result⟧.value.⟦vr:url⟧ : ⟦vr:result⟧.reason.message)
  ));

// race: first to settle wins (great for timeouts):
Promise.race([
  ⟦fn:fetch_json⟧("/api/slow", 5000),
  new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 300)),
]).catch((⟦vr:err⟧) => console.log("race says:", ⟦vr:err⟧.message));
`),

    ex("webdev-ex-011", "async / await", "The ergonomic promise syntax: sequential awaits, parallel Promise.all, try/catch and loops.", "JavaScript", "async_await", ".js",
        `// async / await — promises in readable clothes.

const ⟦fn:wait⟧ = (⟦vr:ms⟧, ⟦vr:value⟧) =>
  new Promise((resolve) => setTimeout(() => resolve(⟦vr:value⟧), ⟦vr:ms⟧));

// Sequential: each step sees the previous result:
async function ⟦fn:pipeline⟧() {
  const ⟦vr:a⟧ = await ⟦fn:wait⟧(100, "step-1");
  const ⟦vr:b⟧ = await ⟦fn:wait⟧(100, \`\${⟦vr:a⟧} + step-2\`);
  return ⟦fn:wait⟧(100, \`\${⟦vr:b⟧} + step-3\`);
}

// Parallel: launch everything, THEN await:
async function ⟦fn:parallel⟧() {
  const ⟦vr:t0⟧ = Date.now();
  const [⟦vr:x⟧, ⟦vr:y⟧, ⟦vr:z⟧] = await Promise.all([
    ⟦fn:wait⟧(120, "x"), ⟦fn:wait⟧(120, "y"), ⟦fn:wait⟧(120, "z"),
  ]);
  console.log(\`parallel took \${Date.now() - ⟦vr:t0⟧}ms (not 360)\`, [⟦vr:x⟧, ⟦vr:y⟧, ⟦vr:z⟧]);
}

// Errors are plain try/catch again:
async function ⟦fn:risky⟧(⟦vr:ok⟧) {
  if (!⟦vr:ok⟧) throw new Error("risky said no");
  return "fine";
}

async function ⟦fn:main⟧() {
  console.log(await ⟦fn:pipeline⟧());
  await ⟦fn:parallel⟧();
  try {
    await ⟦fn:risky⟧(false);
  } catch (⟦vr:err⟧) {
    console.log("caught:", ⟦vr:err⟧.message);
  }

  // Sequential over an array needs a plain for..of (forEach won't await):
  for (const ⟦vr:n⟧ of [1, 2, 3]) {
    const ⟦vr:doubled⟧ = await ⟦fn:wait⟧(30, ⟦vr:n⟧ * 2);
    console.log("loop:", ⟦vr:doubled⟧);
  }
}

⟦fn:main⟧();
`),

    ex("webdev-ex-012", "Error handling", "Custom Error subclasses, cause chaining, rethrowing and the finally cleanup pattern.", "JavaScript", "error_handling", ".js",
        `// Error handling — beyond try/catch/throw.

// Custom error types make catch blocks specific:
class ⟦cl:ValidationError⟧ extends Error {
  constructor(⟦vr:field⟧, ⟦vr:message⟧) {
    super(\`\${⟦vr:field⟧}: \${⟦vr:message⟧}\`);
    this.name = "⟦cl:ValidationError⟧";
    this.⟦vr:field⟧ = ⟦vr:field⟧;
  }
}

const ⟦fn:validate_user⟧ = (⟦vr:user⟧) => {
  if (!⟦vr:user⟧.⟦vr:name⟧) throw new ⟦cl:ValidationError⟧("name", "required");
  if (⟦vr:user⟧.⟦vr:age⟧ < 0) throw new ⟦cl:ValidationError⟧("age", "must be positive");
  return true;
};

try {
  ⟦fn:validate_user⟧({ ⟦vr:name⟧: "", ⟦vr:age⟧: 30 });
} catch (⟦vr:err⟧) {
  if (⟦vr:err⟧ instanceof ⟦cl:ValidationError⟧) {
    console.log(\`field '\${⟦vr:err⟧.⟦vr:field⟧}' failed: \${⟦vr:err⟧.⟦vr:message⟧}\`);
  } else {
    throw ⟦vr:err⟧;                           // not ours — rethrow
  }
}

// \`cause\` chains the WHY without losing the original:
function ⟦fn:load_config⟧() {
  try {
    return JSON.parse("{ broken");
  } catch (⟦vr:parse_err⟧) {
    throw new Error("config invalid", { cause: ⟦vr:parse_err⟧ });
  }
}

try {
  ⟦fn:load_config⟧();
} catch (⟦vr:err⟧) {
  console.log("top:", ⟦vr:err⟧.message);
  console.log("cause:", ⟦vr:err⟧.cause.message);
}

// finally runs no matter what — cleanup lives there:
const ⟦fn:with_resource⟧ = (⟦vr:fn⟧) => {
  const ⟦vr:resource⟧ = { open: true, close() { this.open = false; } };
  try {
    return ⟦vr:fn⟧(⟦vr:resource⟧);
  } finally {
    ⟦vr:resource⟧.close();                    // always
  }
};
console.log(⟦fn:with_resource⟧((⟦vr:resource⟧) => ⟦vr:resource⟧.open));
`),

    ex("webdev-ex-013", "Modules", "import / export, default vs named, dynamic import and an inline mini-module pattern.", "JavaScript", "modules", ".js",
        `// Modules — named exports, default exports, dynamic import.

// ── In math-utils.js you would write: ─────────────────────────
//   export const ⟦vr:pi⟧ = Math.PI;
//   export function ⟦fn:circle_area⟧(r) { return ⟦vr:pi⟧ * r * r; }
//   export default function ⟦fn:mean⟧(⟦vr:nums⟧) { ... }
// ── and in index.js: ──────────────────────────────────────────
//   import ⟦fn:mean⟧, { ⟦vr:pi⟧, ⟦fn:circle_area⟧ } from "./math-utils.js";
//   import * as ⟦vr:math_utils⟧ from "./math-utils.js";

// Node supports the same syntax natively (ESM) — demo with built-ins:
import { appendFile } from "node:fs/promises";
import path from "node:path";

// Named imports from built-in modules + default imports:
console.log("path ext of notes.txt:", path.extname("notes.txt"));
console.log("fs/promises imported:", typeof appendFile);

// ── The namespace import pattern: ─────────────────────────────
import * as ⟦vr:node_util⟧ from "node:util";
console.log("util has inspect:", typeof ⟦vr:node_util⟧.inspect);

// ── Dynamic import: load a module ON DEMAND (async) ──────────
// (This is how heavy optional dependencies stay out of startup.)
const ⟦vr:start⟧ = Date.now();
const ⟦vr:os_module⟧ = await import("node:os");
console.log(\`os loaded in \${Date.now() - ⟦vr:start⟧}ms; cpus: \${⟦vr:os_module⟧.cpus().length}\`);

// Bare-specifier note: with package.json "type": "module", .js files
// ARE ESM. CommonJS (require) still exists in .cjs files only.
export const ⟦vr:demo_note⟧ = "split code = lazy startup";
`),

    ex("webdev-ex-014", "Fetch and JSON", "A resilient fetch wrapper: timeout, error status, JSON parsing and retries with backoff.", "JavaScript", "fetch_json", ".js",
        `// A small, real fetch wrapper (runnable with Node 18+'s built-in fetch).

const ⟦fn:fetch_json⟧ = async (⟦vr:url⟧, { ⟦vr:timeout_ms⟧ = 5000, ⟦vr:retries⟧ = 2 } = {}) => {
  for (let ⟦vr:attempt⟧ = 0; ⟦vr:attempt⟧ <= ⟦vr:retries⟧; ⟦vr:attempt⟧++) {
    const ⟦vr:controller⟧ = new AbortController();
    const ⟦vr:timer⟧ = setTimeout(() => ⟦vr:controller⟧.abort(), ⟦vr:timeout_ms⟧);
    try {
      const ⟦vr:response⟧ = await fetch(⟦vr:url⟧, { signal: ⟦vr:controller⟧.signal });
      if (!⟦vr:response⟧.ok) {
        // 4xx = our fault, don't retry; 5xx = their fault, maybe retry:
        if (⟦vr:response⟧.⟦vr:status⟧ < 500 || ⟦vr:attempt⟧ === ⟦vr:retries⟧) {
          throw new Error(\`HTTP \${⟦vr:response⟧.⟦vr:status⟧} \${⟦vr:response⟧.statusText}\`);
        }
        continue;
      }
      return await ⟦vr:response⟧.json();
    } catch (⟦vr:err⟧) {
      if (⟦vr:err⟧.name === "AbortError") console.log("attempt timed out");
      else if (⟦vr:attempt⟧ === ⟦vr:retries⟧) throw ⟦vr:err⟧;
    } finally {
      clearTimeout(⟦vr:timer⟧);
    }
    // exponential backoff before the next attempt:
    await new Promise((r) => setTimeout(r, 250 * 2 ** ⟦vr:attempt⟧));
  }
};

// POST with a JSON body — the other half of the wrapper:
const ⟦fn:post_json⟧ = (⟦vr:url⟧, ⟦vr:payload⟧) =>
  fetch(⟦vr:url⟧, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(⟦vr:payload⟧),
  }).then((⟦vr:response⟧) => {
    if (!⟦vr:response⟧.ok) throw new Error(\`HTTP \${⟦vr:response⟧.⟦vr:status⟧}\`);
    return ⟦vr:response⟧.json();
  });

// A real request (offline-safe demo):
try {
  const ⟦vr:cat_fact⟧ = await ⟦fn:fetch_json⟧("https://api.example-fast-fail/facts", { ⟦vr:retries⟧: 0, ⟦vr:timeout_ms⟧: 800 });
  console.log(⟦vr:cat_fact⟧);
} catch (⟦vr:err⟧) {
  console.log("wrapper surfaced a clean error:", ⟦vr:err⟧.message);
}
console.log("post_json is", typeof ⟦fn:post_json⟧, "— ready for your API");
`),

    ex("webdev-ex-015", "Dates and times", "The Intl goldmine + a date math kit — formatting without any library.", "JavaScript", "dates_times", ".js",
        `// Dates — Intl does the heavy lifting, no libraries needed.

const ⟦vr:launch⟧ = new Date("2026-11-14T09:30:00+01:00");

// The formatter workhorse:
const ⟦vr:date_fmt⟧ = new Intl.DateTimeFormat("en-GB", {
  weekday: "short", day: "numeric", month: "short",
  year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Berlin",
});
console.log(⟦vr:date_fmt⟧.format(⟦vr:launch⟧));

// Relative time ("in 3 days" / "2 days ago"):
const ⟦vr:relative⟧ = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const ⟦vr:days⟧ = (⟦vr:launch⟧ - Date.now()) / 86_400_000;
console.log(⟦vr:relative⟧.format(Math.round(⟦vr:days⟧), "day"));

// Duration pieces by hand (the units are all milliseconds):
const ⟦fn:days_between⟧ = (a, b) => Math.round(Math.abs(b - a) / 86_400_000);
console.log("days between:", ⟦fn:days_between⟧(new Date("2026-01-01"), ⟦vr:launch⟧));

// Adding time safely via components:
const ⟦vr:plus_week⟧ = new Date(⟦vr:launch⟧);
⟦vr:plus_week⟧.setDate(⟦vr:plus_week⟧.getDate() + 7);

// ISO strings for APIs and logs:
console.log("iso:", ⟦vr:launch⟧.toISOString());
console.log("date only:", ⟦vr:launch⟧.toISOString().slice(0, 10));

// A tiny stopwatch:
const ⟦fn:timed⟧ = async (⟦vr:label⟧, ⟦vr:fn⟧) => {
  const ⟦vr:t0⟧ = performance.now();
  const ⟦vr:result⟧ = await ⟦vr:fn⟧();
  console.log(\`\${⟦vr:label⟧}: \${(performance.now() - ⟦vr:t0⟧).toFixed(1)}ms\`);
  return ⟦vr:result⟧;
};
await ⟦fn:timed⟧("nap", () => new Promise((r) => setTimeout(r, 50)));
`),

    ex("webdev-ex-016", "JSON round-trips", "parse/stringify with revivers, pretty printing, and the footguns (undefined, dates, cycles).", "JavaScript", "json_roundtrip", ".js",
        `// JSON — the good, the bad and the reviver.

const ⟦vr:record⟧ = {
  ⟦vr:script⟧: "tides.py",
  ⟦vr:ok⟧: true,
  ⟦vr:duration_ms⟧: 412.5,
  ⟦vr:started⟧: new Date("2026-11-14T09:30:00Z"),
  ⟦vr:notes⟧: undefined,          // disappears in JSON!
};

// stringify: pretty-print with indent, drop functions/undefined:
const ⟦vr:as_json⟧ = JSON.stringify(⟦vr:record⟧, null, 2);
console.log(⟦vr:as_json⟧);

// The round trip loses the Date (it becomes a string):
const ⟦vr:parsed⟧ = JSON.parse(⟦vr:as_json⟧);
console.log("⟦vr:started⟧ is now:", typeof ⟦vr:parsed⟧.⟦vr:started⟧);

// A reviver rebuilds rich values DURING parse:
const ⟦vr:revived⟧ = JSON.parse(⟦vr:as_json⟧, (⟦vr:key⟧, ⟦vr:value⟧) => {
  if (typeof ⟦vr:value⟧ === "string" && /^\\d{4}-\\d{2}-\\d{2}T/.test(⟦vr:value⟧)) {
    return new Date(⟦vr:value⟧);
  }
  return ⟦vr:value⟧;
});
console.log("revived date:", ⟦vr:revived⟧.⟦vr:started⟧ instanceof Date);

// A replacer can SELECT or TRANSFORM keys during stringify:
const ⟦vr:public_view⟧ = JSON.stringify(⟦vr:record⟧, (⟦vr:key⟧, ⟦vr:value⟧) =>
  ⟦vr:key⟧ === "⟦vr:script⟧" ? "REDACTED" : ⟦vr:value⟧);
console.log(⟦vr:public_view⟧);

// The classic crash: circular references.
const ⟦vr:cyclic⟧ = { ⟦vr:name⟧: "loop" };
⟦vr:cyclic⟧.⟦vr:self⟧ = ⟦vr:cyclic⟧;
try {
  JSON.stringify(⟦vr:cyclic⟧);
} catch (⟦vr:err⟧) {
  console.log("cycle:", ⟦vr:err⟧.message);
}
`),

    ex("webdev-ex-017", "LocalStorage wrapper", "Namespaced get/set with TTL, JSON encoding and a safe API surface.", "JavaScript", "local_storage", ".js",
        `// A localStorage wrapper with TTL + JSON, safe to import anywhere.

const ⟦vr:namespace⟧ = "praxis-demo";

const ⟦vr:store⟧ = {
  ⟦fn:set⟧(⟦vr:key⟧, ⟦vr:value⟧, ⟦vr:ttl_ms⟧ = undefined) {
    const ⟦vr:entry⟧ = {
      ⟦vr:value⟧,
      ⟦vr:written_at⟧: Date.now(),
      ⟦vr:expires_at⟧: ⟦vr:ttl_ms⟧ ? Date.now() + ⟦vr:ttl_ms⟧ : null,
    };
    try {
      localStorage.setItem(\`\${⟦vr:namespace⟧}:\${⟦vr:key⟧}\`, JSON.stringify(⟦vr:entry⟧));
      return true;
    } catch {
      return false;                        // quota or private mode
    }
  },

  ⟦fn:get⟧(⟦vr:key⟧, ⟦vr:fallback⟧ = null) {
    try {
      const ⟦vr:raw⟧ = localStorage.getItem(\`\${⟦vr:namespace⟧}:\${⟦vr:key⟧}\`);
      if (⟦vr:raw⟧ === null) return ⟦vr:fallback⟧;
      const ⟦vr:entry⟧ = JSON.parse(⟦vr:raw⟧);
      if (⟦vr:entry⟧.⟦vr:expires_at⟧ && Date.now() > ⟦vr:entry⟧.⟦vr:expires_at⟧) {
        ⟦vr:store⟧.⟦fn:remove⟧(⟦vr:key⟧);
        return ⟦vr:fallback⟧;              // expired
      }
      return ⟦vr:entry⟧.⟦vr:value⟧;
    } catch {
      return ⟦vr:fallback⟧;                // corrupt entry -> fallback
    }
  },

  ⟦fn:remove⟧(⟦vr:key⟧) {
    localStorage.removeItem(\`\${⟦vr:namespace⟧}:\${⟦vr:key⟧}\`);
  },

  ⟦fn:keys⟧() {
    return Object.keys(localStorage)
      .filter((⟦vr:key⟧) => ⟦vr:key⟧.startsWith(\`\${⟦vr:namespace⟧}:\`))
      .map((⟦vr:key⟧) => ⟦vr:key⟧.slice(⟦vr:namespace⟧.length + 1));
  },
};

// Only run when localStorage exists (Node has none by default):
if (typeof localStorage === "undefined") {
  console.log("no localStorage in this runtime — wrapper stays a no-op");
} else {
  ⟦vr:store⟧.⟦fn:set⟧("⟦vr:theme⟧", { ⟦vr:mode⟧: "dark", ⟦vr:accent⟧: "moss" });
  ⟦vr:store⟧.⟦fn:set⟧("⟦vr:session⟧", { ⟦vr:page⟧: 2 }, 60_000);   // 1 minute TTL
  console.log(⟦vr:store⟧.⟦fn:get⟧("⟦vr:theme⟧"));
  console.log("keys:", ⟦vr:store⟧.⟦fn:keys⟧());
}
`),

    ex("webdev-ex-018", "Events and pub/sub", "EventTarget-based pub/sub, custom events with detail, and once-style subscriptions.", "JavaScript", "events_pubsub", ".js",
        `// A typed-ish pub/sub bus built on EventTarget (works in Node & browser).

class ⟦cl:Bus⟧ extends EventTarget {
  ⟦fn:publish⟧(⟦vr:topic⟧, ⟦vr:detail⟧) {
    this.dispatchEvent(new CustomEvent(⟦vr:topic⟧, { detail: ⟦vr:detail⟧ }));
  }

  ⟦fn:subscribe⟧(⟦vr:topic⟧, ⟦vr:handler⟧) {
    const ⟦vr:listener⟧ = (⟦vr:event⟧) => ⟦vr:handler⟧(⟦vr:event⟧.detail);
    this.addEventListener(⟦vr:topic⟧, ⟦vr:listener⟧);
    return () => this.removeEventListener(⟦vr:topic⟧, ⟦vr:listener⟧);  // unsubscribe fn
  }

  ⟦fn:subscribe_once⟧(⟦vr:topic⟧, ⟦vr:handler⟧) {
    const ⟦vr:listener⟧ = (⟦vr:event⟧) => {
      this.removeEventListener(⟦vr:topic⟧, ⟦vr:listener⟧);
      ⟦vr:handler⟧(⟦vr:event⟧.detail);
    };
    this.addEventListener(⟦vr:topic⟧, ⟦vr:listener⟧);
  }
}

const ⟦vr:bus⟧ = new ⟦cl:Bus⟧();

// A run-status dashboard in twelve lines:
const ⟦vr:log_runs⟧ = [];
const ⟦fn:stop_run_logging⟧ = ⟦vr:bus⟧.⟦fn:subscribe⟧("run:finished", ({ ⟦vr:script⟧, ⟦vr:ok⟧, ⟦vr:ms⟧ }) => {
  ⟦vr:log_runs⟧.push(\`\${⟦vr:script⟧} \${⟦vr:ok⟧ ? "✓" : "✗"} \${⟦vr:ms⟧}ms\`);
  console.log("history:", ⟦vr:log_runs⟧);
});

⟦vr:bus⟧.⟦fn:subscribe_once⟧("run:finished", () => console.log("(first run of the session!)"));

⟦vr:bus⟧.⟦fn:publish⟧("run:finished", { ⟦vr:script⟧: "tides.py", ⟦vr:ok⟧: true, ⟦vr:ms⟧: 412 });
⟦vr:bus⟧.⟦fn:publish⟧("run:finished", { ⟦vr:script⟧: "forecast.py", ⟦vr:ok⟧: false, ⟦vr:ms⟧: 88 });

⟦fn:stop_run_logging⟧();                    // detach one subscriber
⟦vr:bus⟧.⟦fn:publish⟧("run:finished", { ⟦vr:script⟧: "quiet.py", ⟦vr:ok⟧: true, ⟦vr:ms⟧: 5 });
console.log("last publish reached nobody — listener was detached");
`),

    ex("webdev-ex-019", "Debounce and throttle", "The two rate limiters everyone needs — with a trailing call and a leading edge.", "JavaScript", "debounce_throttle", ".js",
        `// debounce + throttle — tame the event storm.

// debounce: run only after \`wait\` ms of QUIET (search-as-you-type):
function ⟦fn:debounce⟧(⟦vr:fn⟧, ⟦vr:wait_ms⟧ = 300) {
  let ⟦vr:timer⟧ = null;
  return (...⟦vr:args⟧) => {
    clearTimeout(⟦vr:timer⟧);
    ⟦vr:timer⟧ = setTimeout(() => ⟦vr:fn⟧(...⟦vr:args⟧), ⟦vr:wait_ms⟧);
  };
}

// throttle: run at most once per \`interval\` (scroll / mousemove):
function ⟦fn:throttle⟧(⟦vr:fn⟧, ⟦vr:interval_ms⟧ = 200) {
  let ⟦vr:last_run⟧ = 0;
  return (...⟦vr:args⟧) => {
    const ⟦vr:now⟧ = Date.now();
    if (⟦vr:now⟧ - ⟦vr:last_run⟧ >= ⟦vr:interval_ms⟧) {
      ⟦vr:last_run⟧ = ⟦vr:now⟧;
      ⟦vr:fn⟧(...⟦vr:args⟧);
    }
  };
}

// A quick simulation of a typing burst:
const ⟦vr:keystrokes⟧ = ["t", "ti", "tid", "tide", "tides"];
const ⟦fn:search⟧ = ⟦fn:debounce⟧((⟦vr:query⟧) => {
  console.log("searching for:", ⟦vr:query⟧);      // fires ONCE, at the end
}, 120);

let ⟦vr:scroll_events⟧ = 0;
const ⟦fn:on_scroll⟧ = ⟦fn:throttle⟧(() => {
  console.log("  paint for event #", ⟦vr:scroll_events⟧);
}, 60);

for (const ⟦vr:query⟧ of ⟦vr:keystrokes⟧) ⟦fn:search⟧(⟦vr:query⟧);
console.log("— five keystrokes, one search —");

for (let ⟦vr:i⟧ = 0; ⟦vr:i⟧ < 5; ⟦vr:i⟧++) {
  ⟦vr:scroll_events⟧++;
  ⟦fn:on_scroll⟧();
}
console.log("— five scroll events, ~one paint per interval —");
`),

    ex("webdev-ex-020", "Map, Set and WeakMap", "The modern collections: ordered Maps, unique Sets and GC-friendly WeakMaps.", "JavaScript", "map_set_weak", ".js",
        `// Map / Set / WeakMap — beyond plain objects.

// Map: any key type, insertion order, size for free.
const ⟦vr:field_units⟧ = new Map([
  ["temperature", "°C"],
  ["pressure", "kPa"],
  [42, "the answer"],
]);
⟦vr:field_units⟧.set("depth", "m");
console.log(⟦vr:field_units⟧.size, ⟦vr:field_units⟧.get("pressure"));
console.log([...⟦vr:field_units⟧.keys()], "insertion order preserved");

// A frequency counter in one pass:
const ⟦vr:words⟧ = "the quick brown fox jumps over the lazy dog the end".split(" ");
const ⟦vr:counts⟧ = new Map();
for (const ⟦vr:word⟧ of ⟦vr:words⟧) ⟦vr:counts⟧.set(⟦vr:word⟧, (⟦vr:counts⟧.get(⟦vr:word⟧) ?? 0) + 1);
console.log("'the' appears", ⟦vr:counts⟧.get("the"), "times");

// Set: uniqueness + fast membership.
const ⟦vr:seen⟧ = new Set();
const ⟦vr:visitors⟧ = ["ada", "grace", "ada", "alan", "grace"];
for (const ⟦vr:visitor⟧ of ⟦vr:visitors⟧) ⟦vr:seen⟧.add(⟦vr:visitor⟧);
console.log([...⟦vr:seen⟧], ⟦vr:seen⟧.has("alan"));

// Set math: union / intersection / difference:
const ⟦vr:a⟧ = new Set([1, 2, 3, 4]);
const ⟦vr:b⟧ = new Set([3, 4, 5]);
console.log("union:", ⟦vr:a⟧.union(⟦vr:b⟧));
console.log("intersection:", ⟦vr:a⟧.intersection(⟦vr:b⟧));
console.log("a - b:", ⟦vr:a⟧.difference(⟦vr:b⟧));

// WeakMap: metadata attached to objects WITHOUT keeping them alive.
const ⟦vr:cache⟧ = new WeakMap();
const ⟦fn:with_meta⟧ = (⟦vr:object⟧) => {
  if (!⟦vr:cache⟧.has(⟦vr:object⟧)) ⟦vr:cache⟧.set(⟦vr:object⟧, { ⟦vr:hits⟧: 0 });
  const ⟦vr:meta⟧ = ⟦vr:cache⟧.get(⟦vr:object⟧);
  ⟦vr:meta⟧.⟦vr:hits⟧++;
  return ⟦vr:meta⟧;
};
const ⟦vr:chart⟧ = { ⟦vr:title⟧: "tides" };
⟦fn:with_meta⟧(⟦vr:chart⟧); ⟦fn:with_meta⟧(⟦vr:chart⟧);
console.log("chart meta:", ⟦fn:with_meta⟧(⟦vr:chart⟧));
`),

    ex("webdev-ex-021", "Regular expressions", "Named groups, lookbehind, flags and the test/exec/match/replace tour.", "JavaScript", "regex_cookbook", ".js",
        `// Regular expressions — the modern bits you actually use.

// Named groups make patterns self-documenting:
const ⟦vr:log_line⟧ = "2026-11-14T09:30:12Z WARN disk usage 91% on /data";
const ⟦vr:log_pattern⟧ = /^(?<⟦vr:timestamp⟧>\\S+)\\s+(?<⟦vr:level⟧>\\w+)\\s+(?<⟦vr:message⟧>.*)$/;
const { ⟦vr:timestamp⟧, ⟦vr:level⟧, ⟦vr:message⟧ } = ⟦vr:log_line⟧.match(⟦vr:log_pattern⟧).groups;
console.log({ ⟦vr:level⟧, ⟦vr:message⟧ });

// Parsing with exec in a loop — every match, one at a time:
const ⟦vr:kv_pattern⟧ = /(\\w+)=("[^"]*"|\\S+)/g;
const ⟦vr:query⟧ = 'page=2 sort="relevance" lang=en';
let ⟦vr:match⟧;
while ((⟦vr:match⟧ = ⟦vr:kv_pattern⟧.exec(⟦vr:query⟧)) !== null) {
  console.log(⟦vr:match⟧[1], "=", ⟦vr:match⟧[2]);
}

// replace with a function — per-match logic:
const ⟦vr:template⟧ = "Hello NAME, your ticket NAME-42 is ready";
const ⟦vr:filled⟧ = ⟦vr:template⟧.replace(/NAME/g, () => "Ada");
console.log(⟦vr:filled⟧);

// Lookbehind: only match what FOLLOWS something:
console.log("€10 $20 £30".match(/(?<=[$£€])\\d+/g));

// Flags tour:
console.log("abc".replace(/b/, "X"));          // first only
console.log("abc".replace(/b/g, "X"));         // global
console.log("ABC".replace(/b/i, "X"));         // case-insensitive
console.log("a\\nb".match(/^b/m)?.[0]);        // multiline anchors

// Safe splitting on commas that aren't inside quotes:
const ⟦vr:csv_row⟧ = 'a,"b,c",d';
console.log(⟦vr:csv_row⟧.match(/("([^"]|"")*"|[^,]+)/g));
`),

    ex("webdev-ex-022", "Sorting and comparators", "localeCompare, multi-key sorts, numeric collation and a stable-by-construction chain.", "JavaScript", "sorting", ".js",
        `// Sorting — beyond the default string sort.

const ⟦vr:files⟧ = [
  { ⟦vr:name⟧: "report10.md", ⟦vr:bytes⟧: 2400, ⟦vr:modified⟧: "2026-11-02" },
  { ⟦vr:name⟧: "report2.md",  ⟦vr:bytes⟧: 900,  ⟦vr:modified⟧: "2026-11-13" },
  { ⟦vr:name⟧: "Chart.md",    ⟦vr:bytes⟧: 15200, ⟦vr:modified⟧: "2026-10-28" },
  { ⟦vr:name⟧: "a.md",        ⟦vr:bytes⟧: 2400,  ⟦vr:modified⟧: "2026-11-13" },
];

// ⚠ The default sort is lexicographic: "10" < "2"!
console.log(["report10", "report2"].sort());

// localeCompare with numeric:true fixes "natural" order:
console.log(["report10", "report2", "report1"].sort((a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
));

// Multi-key comparator: primary asc, secondary desc, tertiary asc:
const ⟦fn:by_three_keys⟧ = (⟦vr:a⟧, ⟦vr:b⟧) =>
  ⟦vr:a⟧.⟦vr:modified⟧.localeCompare(⟦vr:b⟧.⟦vr:modified⟧) ||
  ⟦vr:b⟧.⟦vr:bytes⟧ - ⟦vr:a⟧.⟦vr:bytes⟧ ||
  ⟦vr:a⟧.⟦vr:name⟧.localeCompare(⟦vr:b⟧.⟦vr:name⟧, undefined, { numeric: true });

console.log(⟦vr:files⟧.slice().sort(⟦fn:by_three_keys⟧).map((⟦vr:file⟧) => ⟦vr:file⟧.⟦vr:name⟧));

// toSorted / toReversed: the COPY versions (ES2023) leave the original alone:
const ⟦vr:original⟧ = [3, 1, 2];
const ⟦vr:sorted⟧ = ⟦vr:original⟧.toSorted((a, b) => a - b);
console.log(⟦vr:original⟧, ⟦vr:sorted⟧);

// Sorting objects by a computed key:
const ⟦vr:by_kb⟧ = ⟦vr:files⟧.toSorted((⟦vr:a⟧, ⟦vr:b⟧) => ⟦vr:a⟧.⟦vr:bytes⟧ - ⟦vr:b⟧.⟦vr:bytes⟧);
console.log(⟦vr:by_kb⟧.map((⟦vr:file⟧) => \`\${⟦vr:file⟧.⟦vr:name⟧} (\${(⟦vr:file⟧.⟦vr:bytes⟧ / 1000).toFixed(1)} kB)\`));
`),

    ex("webdev-ex-023", "Closures and currying", "Function factories, private state via closure, memoize and a small curry helper.", "JavaScript", "closures", ".js",
        `// Closures — functions that remember.

// 1. Private state without classes:
function ⟦fn:make_counter⟧() {
  let ⟦vr:count⟧ = 0;                        // invisible from outside
  return {
    ⟦fn:increment⟧: () => ++⟦vr:count⟧,
    ⟦fn:value⟧: () => ⟦vr:count⟧,
  };
}
const ⟦vr:counter⟧ = ⟦fn:make_counter⟧();
⟦vr:counter⟧.⟦fn:increment⟧(); ⟦vr:counter⟧.⟦fn:increment⟧();
console.log(⟦vr:counter⟧.⟦fn:value⟧());       // 2 — and \`count\` is unreachable

// 2. Memoize: the closure IS the cache:
function ⟦fn:memoize⟧(⟦vr:fn⟧) {
  const ⟦vr:cache⟧ = new Map();
  return (⟦vr:argument⟧) => {
    if (⟦vr:cache⟧.has(⟦vr:argument⟧)) return ⟦vr:cache⟧.get(⟦vr:argument⟧);
    const ⟦vr:result⟧ = ⟦vr:fn⟧(⟦vr:argument⟧);
    ⟦vr:cache⟧.set(⟦vr:argument⟧, ⟦vr:result⟧);
    return ⟦vr:result⟧;
  };
}
const ⟦fn:slow_fib⟧ = (n) => (n < 2 ? n : ⟦fn:slow_fib⟧(n - 1) + ⟦fn:slow_fib⟧(n - 2));
const ⟦fn:fast_fib⟧ = ⟦fn:memoize⟧((n) => (n < 2 ? n : ⟦fn:fast_fib⟧(n - 1) + ⟦fn:fast_fib⟧(n - 2)));
console.time("memoized fib(25)");
console.log(⟦fn:fast_fib⟧(25));
console.timeEnd("memoized fib(25)");

// 3. Curry: fix arguments one at a time:
const ⟦fn:curry⟧ = (⟦vr:fn⟧) =>
  function ⟦vr:curried⟧(...⟦vr:args⟧) {
    return ⟦vr:args⟧.length >= ⟦vr:fn⟧.length
      ? ⟦vr:fn⟧(...⟦vr:args⟧)
      : (...⟦vr:more⟧) => ⟦vr:curried⟧(...⟦vr:args⟧, ...⟦vr:more⟧);
  };
const ⟦fn:volume⟧ = (l, w, h) => l * w * h;
const ⟦fn:container⟧ = ⟦fn:curry⟧(⟦fn:volume⟧)(640)(480);
console.log("container volume:", ⟦fn:container⟧(220));

// 4. The module pattern — the pre-ES6 classic, still everywhere:
const ⟦vr:units⟧ = (() => {
  const ⟦vr:factors⟧ = { m: 1, km: 1000, mi: 1609.34 };
  return {
    ⟦fn:convert⟧: (⟦vr:value⟧, from, to) => (⟦vr:value⟧ * ⟦vr:factors⟧[from]) / ⟦vr:factors⟧[to],
  };
})();
console.log(⟦vr:units⟧.⟦fn:convert⟧(26.2, "mi", "km"), "km in a marathon");
`),

    ex("webdev-ex-024", "Queue and concurrency pool", "A promise pool that runs N tasks concurrently and drains a queue — batching done right.", "JavaScript", "async_pool", ".js",
        `// An async worker pool — N at a time, ordered results.

async function ⟦fn:run_pool⟧(⟦vr:tasks⟧, ⟦vr:concurrency⟧ = 3) {
  const ⟦vr:results⟧ = new Array(⟦vr:tasks⟧.length);
  let ⟦vr:next_index⟧ = 0;

  const ⟦vr:worker⟧ = async () => {
    while (⟦vr:next_index⟧ < ⟦vr:tasks⟧.length) {
      const ⟦vr:index⟧ = ⟦vr:next_index⟧++;          // claim a slot
      ⟦vr:results⟧[⟦vr:index⟧] = await ⟦vr:tasks⟧[⟦vr:index⟧]();
    }
  };

  await Promise.all(
    Array.from({ length: ⟦vr:concurrency⟧ }, ⟦vr:worker⟧)
  );
  return ⟦vr:results⟧;
}

// Simulated downloads with uneven durations:
const ⟦fn:download⟧ = (⟦vr:file⟧, ⟦vr:ms⟧) => async () => {
  await new Promise((r) => setTimeout(r, ⟦vr:ms⟧));
  return \`\${⟦vr:file⟧} done in \${⟦vr:ms⟧}ms\`;
};

const ⟦vr:downloads⟧ = [
  ⟦fn:download⟧("tides.csv", 300),
  ⟦fn:download⟧("wind.csv", 120),
  ⟦fn:download⟧("salinity.csv", 200),
  ⟦fn:download⟧("notes.md", 80),
  ⟦fn:download⟧("map.png", 150),
];

const ⟦vr:t0⟧ = performance.now();
const ⟦vr:outcomes⟧ = await ⟦fn:run_pool⟧(⟦vr:downloads⟧, 2);
console.log(\`pool of 5 at concurrency 2 took \${Math.round(performance.now() - ⟦vr:t0⟧)}ms (not 850)\`);
⟦vr:outcomes⟧.forEach((⟦vr:line⟧) => console.log(" ", ⟦vr:line⟧));

// Sequential for comparison — when ORDER matters more than speed:
const ⟦vr:sequential⟧ = [];
for (const ⟦vr:task⟧ of ⟦vr:downloads⟧.slice(0, 3)) ⟦vr:sequential⟧.push(await ⟦vr:task⟧());
console.log("sequential:", ⟦vr:sequential⟧);
`),

    ex("webdev-ex-025", "CLI script with args", "A real command-line tool shape: argv parsing, --help, exit codes and stdout discipline.", "JavaScript", "cli_tool", ".js",
        `// A tiny CLI: wordfreq [options] file
// Run with: node cli_tool.js --top 3 --ignore the

import { readFileSync } from "node:fs";

// ── arg parsing (no dependencies): ─────────────────────────────
const ⟦vr:args⟧ = process.argv.slice(2);
const ⟦vr:options⟧ = { top: 10, ignore: new Set(["the", "a", "of", "and", "in", "to"]), file: null };

for (let ⟦vr:i⟧ = 0; ⟦vr:i⟧ < ⟦vr:args⟧.length; ⟦vr:i⟧++) {
  const ⟦vr:arg⟧ = ⟦vr:args⟧[⟦vr:i⟧];
  if (⟦vr:arg⟧ === "--top") ⟦vr:options⟧.top = Number(⟦vr:args⟧[++⟦vr:i⟧]);
  else if (⟦vr:arg⟧ === "--ignore") ⟦vr:options⟧.ignore.add(⟦vr:args⟧[++⟦vr:i⟧].toLowerCase());
  else if (⟦vr:arg⟧ === "-h" || ⟦vr:arg⟧ === "--help") ⟦vr:options⟧.⟦vr:help⟧ = true;
  else if (⟦vr:arg⟧.startsWith("-")) ⟦vr:options⟧.⟦vr:unknown⟧ = ⟦vr:arg⟧;
  else ⟦vr:options⟧.file = ⟦vr:arg⟧;
}

if (⟦vr:options⟧.⟦vr:help⟧ || ⟦vr:options⟧.⟦vr:unknown⟧ || !⟦vr:options⟧.file) {
  console.log(\`Usage: node \${process.argv[1].split("/").pop()} [--top N] [--ignore WORD] <file>

Options:
  --top N       show the N most frequent words (default 10)
  --ignore WORD drop one more stopword (repeatable)
  -h, --help    show this help\`);
  process.exit(⟦vr:options⟧.⟦vr:unknown⟧ ? 2 : 0);
}

// ── the actual work: ───────────────────────────────────────────
let ⟦vr:text⟧;
try {
  ⟦vr:text⟧ = readFileSync(⟦vr:options⟧.file, "utf-8");
} catch (⟦vr:err⟧) {
  console.error(\`wordfreq: cannot read '\${⟦vr:options⟧.file}': \${⟦vr:err⟧.message}\`);
  process.exit(1);                       // 1 = runtime failure, 2 = usage
}

const ⟦vr:counts⟧ = new Map();
for (const ⟦vr:word⟧ of ⟦vr:text⟧.toLowerCase().match(/[a-z']+/g) ?? []) {
  if (⟦vr:options⟧.ignore.has(⟦vr:word⟧)) continue;
  ⟦vr:counts⟧.set(⟦vr:word⟧, (⟦vr:counts⟧.get(⟦vr:word⟧) ?? 0) + 1);
}

const ⟦vr:top_words⟧ = [...⟦vr:counts⟧.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, ⟦vr:options⟧.top);

console.log(\`top \${⟦vr:top_words⟧.length} of \${⟦vr:counts⟧.size} unique words in \${⟦vr:options⟧.file}\`);
for (const [⟦vr:word⟧, ⟦vr:count⟧] of ⟦vr:top_words⟧) {
  console.log(\`\${String(⟦vr:count⟧).padStart(5)}  \${"█".repeat(Math.min(30, ⟦vr:count⟧))} \${⟦vr:word⟧}\`);
}
`),

    ex("webdev-ex-026", "TypeScript basics", "Annotations, inference, arrays/tuples and literal types — the first ten minutes of TS.", "TypeScript", "ts_basics", ".ts",
        `// TypeScript basics — types that follow the data.

// Explicit annotations where inference can't help:
const ⟦vr:station_name⟧: string = "Kijkduin";
const ⟦vr:depth_m⟧: number = 18.4;
const ⟦vr:is_active⟧: boolean = true;

// Inference works — don't over-annotate:
const ⟦vr:readings⟧ = [12.1, 14.8, 11.9];        // number[]
const ⟦vr:label⟧ = \`buoy \${⟦vr:station_name⟧}\`;   // string

// Tuples: fixed length, per-slot types:
const ⟦vr:measurement⟧: [Date, number, string] = [new Date(), 21.7, "°C"];
const [⟦vr:at⟧, ⟦vr:temp⟧, ⟦vr:unit⟧] = ⟦vr:measurement⟧;

// Objects with optional + readonly:
interface ⟦cl:Buoy⟧ {
  readonly ⟦vr:id⟧: number;
  ⟦vr:name⟧: string;
  ⟦vr:depth_m⟧?: number;                 // optional
  ⟦vr:tags⟧: string[];
}

const ⟦vr:buoy⟧: ⟦cl:Buoy⟧ = { ⟦vr:id⟧: 7, ⟦vr:name⟧: "Kijkduin", ⟦vr:tags⟧: ["coastal"] };
// ⟦vr:buoy⟧.⟦vr:id⟧ = 9;                // Error: readonly

// Literal unions — enums without enums:
type ⟦vr:Direction⟧ = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
const ⟦vr:wind_from⟧: ⟦vr:Direction⟧ = "SW";
// const ⟦vr:bad⟧: ⟦vr:Direction⟧ = "up"; // Error: not assignable

// Functions: parameter + return types:
const ⟦fn:mean⟧ = (⟦vr:values⟧: number[]): number =>
  ⟦vr:values⟧.reduce((s, v) => s + v, 0) / ⟦vr:values⟧.length;

const ⟦fn:heading_label⟧ = (⟦vr:direction⟧: ⟦vr:Direction⟧): string => {
  const ⟦vr:full_names⟧: Record<⟦vr:Direction⟧, string> = {
    N: "north", NE: "northeast", E: "east", SE: "southeast",
    S: "south", SW: "southwest", W: "west", NW: "northwest",
  };
  return ⟦vr:full_names⟧[⟦vr:direction⟧];
};

console.log(\`\${⟦vr:buoy⟧.⟦vr:name⟧}: \${⟦vr:temp⟧}\${⟦vr:unit⟧} at \${⟦vr:depth_m⟧ ?? "?"}m\`);
console.log(\`mean: \${⟦fn:mean⟧(⟦vr:readings⟧).toFixed(2)}, wind from the \${⟦fn:heading_label⟧(⟦vr:wind_from⟧)}\`);

export { ⟦fn:mean⟧, ⟦fn:heading_label⟧ };
`),

    ex("webdev-ex-027", "Interfaces vs types", "The practical differences: declaration merging, unions, intersections, extension.", "TypeScript", "interfaces_types", ".ts",
        `// interface vs type — when each wins.

// interface: object SHAPES, and it MERGES across declarations
// (great for augmenting library types):
interface ⟦cl:RunResult⟧ {
  ⟦vr:ok⟧: boolean;
  ⟦vr:exit_code⟧: number;
}
interface ⟦cl:RunResult⟧ {          // merges with the one above
  ⟦vr:stdout⟧: string;
}

// type: everything else — unions, tuples, mapped, conditional:
type ⟦vr:Status⟧ = "idle" | "running" | "done" | "failed";
type ⟦vr:Point⟧ = [x: number, y: number];
type ⟦vr:Id⟧ = number | \`\${string}-\${string}\`;    // template literal type

// Extension: interface uses extends, type uses intersections:
interface ⟦cl:TimedRun⟧ extends ⟦cl:RunResult⟧ {
  ⟦vr:duration_ms⟧: number;
}
type ⟦vr:TimedAlt⟧ = ⟦cl:RunResult⟧ & { ⟦vr:duration_ms⟧: number };

// Discriminated unions — the killer pattern:
type ⟦vr:Event⟧ =
  | { ⟦vr:kind⟧: "started"; ⟦vr:script⟧: string }
  | { ⟦vr:kind⟧: "stdout";   ⟦vr:chunk⟧: string }
  | { ⟦vr:kind⟧: "ended";    ⟦vr:ok⟧: boolean; ⟦vr:duration_ms⟧: number };

function ⟦fn:render_event⟧(⟦vr:event⟧: ⟦vr:Event⟧): string {
  switch (⟦vr:event⟧.⟦vr:kind⟧) {
    case "started": return \`▶ \${⟦vr:event⟧.⟦vr:script⟧}\`;
    case "stdout":  return ⟦vr:event⟧.⟦vr:chunk⟧.trimEnd();
    case "ended":   return \`\${⟦vr:event⟧.⟦vr:ok⟧ ? "✓" : "✗"} in \${⟦vr:event⟧.⟦vr:duration_ms⟧}ms\`;
  }
}

const ⟦vr:timeline⟧: ⟦vr:Event⟧[] = [
  { ⟦vr:kind⟧: "started", ⟦vr:script⟧: "tides.py" },
  { ⟦vr:kind⟧: "stdout", ⟦vr:chunk⟧: "high water 03:12\\n" },
  { ⟦vr:kind⟧: "ended", ⟦vr:ok⟧: true, ⟦vr:duration_ms⟧: 412 },
];
⟦vr:timeline⟧.map(⟦fn:render_event⟧).forEach((⟦vr:line⟧) => console.log(⟦vr:line⟧));

const ⟦vr:timed⟧: ⟦cl:TimedRun⟧ = { ⟦vr:ok⟧: true, ⟦vr:exit_code⟧: 0, ⟦vr:stdout⟧: "", ⟦vr:duration_ms⟧: 412 };
export { ⟦fn:render_event⟧, ⟦vr:timed⟧ };
`),

    ex("webdev-ex-028", "Generics", "Type parameters that flow: identity, typed collections, constraints and inference at work.", "TypeScript", "ts_generics", ".ts",
        `// Generics — write it once, type it for every use.

// Identity is the hello-world, but factories are the real use:
function ⟦fn:make_result⟧<T>(⟦vr:value⟧: T, ⟦vr:ok⟧ = true): { ⟦vr:value⟧: T; ⟦vr:ok⟧: boolean } {
  return { ⟦vr:value⟧, ⟦vr:ok⟧ };
}
const ⟦vr:answer⟧ = ⟦fn:make_result⟧(42);          // { value: number; ok: boolean }
const ⟦vr:label_result⟧ = ⟦fn:make_result⟧("done"); // T inferred as string

// A typed LRU cache — K and V stay linked through every line:
class ⟦cl:LruCache⟧<K, V> {
  private ⟦vr:map⟧ = new Map<K, V>();
  constructor(private ⟦vr:capacity⟧: number) {}

  ⟦fn:set⟧(⟦vr:key⟧: K, ⟦vr:value⟧: V): void {
    this.⟦vr:map⟧.delete(⟦vr:key⟧);            // refresh recency
    this.⟦vr:map⟧.set(⟦vr:key⟧, ⟦vr:value⟧);
    if (this.⟦vr:map⟧.size > this.⟦vr:capacity⟧) {
      const ⟦vr:oldest⟧ = this.⟦vr:map⟧.keys().next().value as K;
      this.⟦vr:map⟧.delete(⟦vr:oldest⟧);
    }
  }

  ⟦fn:get⟧(⟦vr:key⟧: K): V | undefined {
    const ⟦vr:value⟧ = this.⟦vr:map⟧.get(⟦vr:key⟧);
    if (⟦vr:value⟧ !== undefined) this.⟦fn:set⟧(⟦vr:key⟧, ⟦vr:value⟧);
    return ⟦vr:value⟧;
  }
}

const ⟦vr:cache⟧ = new ⟦cl:LruCache⟧<string, number>(2);
⟦vr:cache⟧.⟦fn:set⟧("⟦vr:tides⟧", 12); ⟦vr:cache⟧.⟦fn:set⟧("⟦vr:wind⟧", 8); ⟦vr:cache⟧.⟦fn:set⟧("⟦vr:salinity⟧", 31);
console.log(⟦vr:cache⟧.⟦fn:get⟧("⟦vr:tides⟧"));     // undefined — evicted
console.log(⟦vr:cache⟧.⟦fn:get⟧("⟦vr:salinity⟧"));  // 31

// Constraints (extends) + keyof — the pick function:
function ⟦fn:pick⟧<T, K extends keyof T>(⟦vr:object⟧: T, ...⟦vr:keys⟧: K[]): Pick<T, K> {
  const ⟦vr:subset⟧ = {} as Pick<T, K>;
  for (const ⟦vr:key⟧ of ⟦vr:keys⟧) ⟦vr:subset⟧[⟦vr:key⟧] = ⟦vr:object⟧[⟦vr:key⟧];
  return ⟦vr:subset⟧;
}

const ⟦vr:station⟧ = { ⟦vr:name⟧: "Kijkduin", ⟦vr:depth_m⟧: 18, ⟦vr:tags⟧: ["coastal"] };
const ⟦vr:brief⟧ = ⟦fn:pick⟧(⟦vr:station⟧, "⟦vr:name⟧", "⟦vr:depth_m⟧");
console.log(⟦vr:brief⟧, ⟦vr:answer⟧, ⟦vr:label_result⟧);

export { ⟦cl:LruCache⟧, ⟦fn:pick⟧ };
`),

    ex("webdev-ex-029", "Type narrowing", "typeof, instanceof, in, discriminants and type predicates — making unknown types safe.", "TypeScript", "type_narrowing", ".ts",
        `// Narrowing — how TS turns wide types into precise ones.

// typeof guards for primitives:
function ⟦fn:format_value⟧(⟦vr:value⟧: string | number): string {
  return typeof ⟦vr:value⟧ === "number"
    ? ⟦vr:value⟧.toFixed(2)
    : ⟦vr:value⟧.toUpperCase();
}
console.log(⟦fn:format_value⟧(3.14159), ⟦fn:format_value⟧("kPa"));

// instanceof for classes + built-ins:
const ⟦fn:describe_error⟧ = (⟦vr:err⟧: Error | string): string =>
  ⟦vr:err⟧ instanceof Error ? ⟦vr:err⟧.message : \`raw: \${⟦vr:err⟧}\`;
console.log(⟦fn:describe_error⟧(new Error("timeout")), ⟦fn:describe_error⟧("plain"));

// \`in\` checks for object shapes:
type ⟦vr:TextFile⟧ = { ⟦vr:path⟧: string; ⟦vr:lines⟧: string[] };
type ⟦vr:BinaryFile⟧ = { ⟦vr:path⟧: string; ⟦vr:bytes⟧: number };
const ⟦fn:file_size⟧ = (⟦vr:file⟧: ⟦vr:TextFile⟧ | ⟦vr:BinaryFile⟧): number =>
  "⟦vr:lines⟧" in ⟦vr:file⟧ ? ⟦vr:file⟧.⟦vr:lines⟧.join("\\n").length : ⟦vr:file⟧.⟦vr:bytes⟧;

// Discriminated union — the cleanest narrowing there is:
type ⟦vr:Shape⟧ =
  | { ⟦vr:kind⟧: "circle";   ⟦vr:radius⟧: number }
  | { ⟦vr:kind⟧: "rect";     ⟦vr:width⟧: number; ⟦vr:height⟧: number }
  | { ⟦vr:kind⟧: "triangle"; ⟦vr:base⟧: number; ⟦vr:height⟧: number };

function ⟦fn:area⟧(⟦vr:shape⟧: ⟦vr:Shape⟧): number {
  switch (⟦vr:shape⟧.⟦vr:kind⟧) {
    case "circle":   return Math.PI * ⟦vr:shape⟧.⟦vr:radius⟧ ** 2;
    case "rect":     return ⟦vr:shape⟧.⟦vr:width⟧ * ⟦vr:shape⟧.⟦vr:height⟧;
    case "triangle": return 0.5 * ⟦vr:shape⟧.⟦vr:base⟧ * ⟦vr:shape⟧.⟦vr:height⟧;
  }
}

// Type predicates (\`is\`) — custom guards that narrow:
function ⟦fn:is_shape⟧(⟦vr:value⟧: unknown): ⟦vr:value⟧ is ⟦vr:Shape⟧ {
  return (
    typeof ⟦vr:value⟧ === "object" && ⟦vr:value⟧ !== null && "⟦vr:kind⟧" in ⟦vr:value⟧ &&
    ["circle", "rect", "triangle"].includes((⟦vr:value⟧ as ⟦vr:Shape⟧).⟦vr:kind⟧)
  );
}

const ⟦vr:drawn⟧: unknown[] = [
  { ⟦vr:kind⟧: "circle", ⟦vr:radius⟧: 2 },
  "not a shape",
  { ⟦vr:kind⟧: "rect", ⟦vr:width⟧: 3, ⟦vr:height⟧: 4 },
];
for (const ⟦vr:item⟧ of ⟦vr:drawn⟧) {
  if (⟦fn:is_shape⟧(⟦vr:item⟧)) console.log(\`⟦vr:shape⟧ ⟦vr:area⟧ = \${⟦fn:area⟧(⟦vr:item⟧).toFixed(2)}\`);
  else console.log("skipped:", String(⟦vr:item⟧));
}

export { ⟦fn:area⟧, ⟦fn:format_value⟧ };
`),

    ex("webdev-ex-030", "Utility types", "Partial, Required, Pick, Omit, Record, ReturnType — the built-in type transformers.", "TypeScript", "utility_types", ".ts",
        `// Utility types — the built-in transformer toolkit.

interface ⟦cl:Station⟧ {
  ⟦vr:id⟧: number;
  ⟦vr:name⟧: string;
  ⟦vr:depth_m⟧: number;
  ⟦vr:tags⟧?: string[];
  ⟦vr:installed_at⟧?: Date;
}

// Partial: every field optional — the UPDATE shape:
type ⟦cl:StationPatch⟧ = Partial<⟦cl:Station⟧>;
const ⟦fn:patch_station⟧ = (⟦vr:base⟧: ⟦cl:Station⟧, ⟦vr:patch⟧: ⟦cl:StationPatch⟧): ⟦cl:Station⟧ =>
  ({ ...⟦vr:base⟧, ...⟦vr:patch⟧ });

// Required: the inverse — everything must be present:
type ⟦cl:CompleteStation⟧ = Required<⟦cl:Station⟧>;

// Pick / Omit: slice a type by fields:
type ⟦cl:StationLabel⟧ = Pick<⟦cl:Station⟧, "⟦vr:id⟧" | "⟦vr:name⟧">;
type ⟦cl:StationTelemetry⟧ = Omit<⟦cl:Station⟧, "⟦vr:tags⟧" | "⟦vr:installed_at⟧">;

// Record: a typed dictionary — keys constrained, values typed:
type ⟦vr:Metric⟧ = "temperature" | "salinity" | "pressure";
const ⟦vr:units⟧: Record<⟦vr:Metric⟧, string> = {
  temperature: "°C",
  salinity: "PSU",
  pressure: "kPa",
};

// ReturnType / Parameters: steal types from functions:
const ⟦fn:read_telemetry⟧ = (⟦vr:station⟧: ⟦cl:Station⟧, ⟦vr:samples⟧: number) =>
  ({ ⟦vr:station⟧: ⟦vr:station⟧.⟦vr:name⟧, ⟦vr:samples⟧, ⟦vr:mean⟧: 12.4 });

type ⟦vr:Telemetry⟧ = ReturnType<typeof ⟦fn:read_telemetry⟧>;
type ⟦vr:ReadArgs⟧ = Parameters<typeof ⟦fn:read_telemetry⟧>;

// Readonly at the top level — configs frozen by type:
const ⟦vr:config⟧: Readonly<Record<string, number>> = { ⟦vr:timeout⟧: 30, ⟦vr:retries⟧: 2 };

const ⟦vr:station⟧: ⟦cl:Station⟧ = { ⟦vr:id⟧: 7, ⟦vr:name⟧: "Kijkduin", ⟦vr:depth_m⟧: 18 };
console.log(⟦fn:patch_station⟧(⟦vr:station⟧, { ⟦vr:depth_m⟧: 21, ⟦vr:tags⟧: ["coastal"] }));
console.log(⟦vr:units⟧.salinity, ⟦vr:config⟧.⟦vr:retries⟧);
console.log(⟦fn:read_telemetry⟧(⟦vr:station⟧, 42));

export { ⟦fn:patch_station⟧, ⟦vr:units⟧ };
`),

    ex("webdev-ex-031", "Async TypeScript", "Typed promises, async generators, Awaited and typed fetch-style responses.", "TypeScript", "ts_async", ".ts",
        `// Async + types — Promise<T> everywhere it matters.

interface ⟦cl:Reading⟧ { ⟦vr:timestamp⟧: string; ⟦vr:temp_c⟧: number }

// A typed delay — the atom of every async test:
const ⟦fn:wait⟧ = (⟦vr:ms⟧: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ⟦vr:ms⟧));

// Async functions infer Promise<T> — annotate the RESOLVED type:
async function ⟦fn:fetch_readings⟧(⟦vr:station⟧: string): Promise<⟦cl:Reading⟧[]> {
  await ⟦fn:wait⟧(60);
  return [
    { ⟦vr:timestamp⟧: "09:00", ⟦vr:temp_c⟧: 12.1 },
    { ⟦vr:timestamp⟧: "10:00", ⟦vr:temp_c⟧: 13.6 },
    { ⟦vr:timestamp⟧: "11:00", ⟦vr:temp_c⟧: 15.0 },
  ];
}

// Promise.all keeps the tuple shape — T1[], T2[] stay separate:
const ⟦fn:load_all⟧ = async (): Promise<[⟦cl:Reading⟧[], string[]]> => {
  const [⟦vr:readings⟧, ⟦vr:notes⟧] = await Promise.all([
    ⟦fn:fetch_readings⟧("kijkduin"),
    (async () => ["gusty", "clear"])(),
  ]);
  return [⟦vr:readings⟧, ⟦vr:notes⟧];
}

// Awaited unwraps: Awaited<Promise<T>> == T.
type ⟦vr:DefinitelyReadings⟧ = Awaited<ReturnType<typeof ⟦fn:fetch_readings⟧>>;

// An async generator with typed yields:
async function* ⟦fn:countdown⟧(⟦vr:from⟧: number): AsyncGenerator<string> {
  for (let ⟦vr:n⟧ = ⟦vr:from⟧; ⟦vr:n⟧ > 0; ⟦vr:n⟧--) {
    await ⟦fn:wait⟧(30);
    yield \`T-\${⟦vr:n⟧}\`;
  }
  return "liftoff";
}

// A typed result type — errors as VALUES, not exceptions:
type ⟦vr:Result⟧<T> = { ⟦vr:ok⟧: true; ⟦vr:value⟧: T } | { ⟦vr:ok⟧: false; ⟦vr:error⟧: string };
async function ⟦fn:safe_call⟧<T>(⟦vr:fn⟧: () => Promise<T>): Promise<⟦vr:Result⟧<T>> {
  try {
    return { ⟦vr:ok⟧: true, ⟦vr:value⟧: await ⟦vr:fn⟧() };
  } catch (⟦vr:err⟧) {
    return { ⟦vr:ok⟧: false, ⟦vr:error⟧: String(⟦vr:err⟧) };
  }
}

const [⟦vr:all_readings⟧, ⟦vr:weather_notes⟧] = await ⟦fn:load_all⟧();
console.log(\`\${⟦vr:all_readings⟧.length} ⟦vr:readings⟧, notes: \${⟦vr:weather_notes⟧.join("/")}\`);
for await (const ⟦vr:tick⟧ of ⟦fn:countdown⟧(3)) console.log(⟦vr:tick⟧);
console.log(await ⟦fn:safe_call⟧(() => ⟦fn:fetch_readings⟧("x")));

export { ⟦fn:fetch_readings⟧, ⟦fn:safe_call⟧ };
`),

    ex("webdev-ex-032", "unknown vs any", "Escaping any — unknown forces you to check, any makes you forget.", "TypeScript", "unknown_any", ".ts",
        `// unknown vs any — the most important type decision.

// any: opts OUT of checking (a bug magnet):
const ⟦vr:any_value⟧: any = JSON.parse('{"⟦vr:depth⟧": 18}');
// console.log(⟦vr:any_value⟧.depth.toFixed(2));   // compiles, crashes at runtime (number vs string)

// unknown: the honest "I don't know yet" — you MUST narrow:
const ⟦vr:parsed⟧: unknown = JSON.parse('{"⟦vr:depth⟧": 18, "⟦vr:name⟧": "kijkduin"}');

function ⟦fn:is_station_json⟧(⟦vr:value⟧: unknown): ⟦vr:value⟧ is { ⟦vr:depth⟧: number; ⟦vr:name⟧: string } {
  if (typeof ⟦vr:value⟧ !== "object" || ⟦vr:value⟧ === null) return false;
  const ⟦vr:record⟧ = ⟦vr:value⟧ as Record<string, unknown>;
  return typeof ⟦vr:record⟧["⟦vr:depth⟧"] === "number" && typeof ⟦vr:record⟧["⟦vr:name⟧"] === "string";
}

if (⟦fn:is_station_json⟧(⟦vr:parsed⟧)) {
  console.log(\`\${⟦vr:parsed⟧.⟦vr:name⟧} at \${⟦vr:parsed⟧.⟦vr:depth⟧}m\`);  // fully typed here
} else {
  console.log("payload didn't match the shape");
}

// Safe JSON.parse — the wrapper every project should have:
function ⟦fn:safe_json_parse⟧<T>(⟦vr:text⟧: string, ⟦vr:guard⟧: (⟦vr:value⟧: unknown) => ⟦vr:value⟧ is T): T | null {
  try {
    const ⟦vr:value⟧: unknown = JSON.parse(⟦vr:text⟧);
    return ⟦vr:guard⟧(⟦vr:value⟧) ? ⟦vr:value⟧ : null;
  } catch {
    return null;
  }
}

const ⟦vr:station⟧ = ⟦fn:safe_json_parse⟧('{"⟦vr:name⟧":"scheveningen","⟦vr:depth⟧":9}', ⟦fn:is_station_json⟧);
const ⟦vr:rejected⟧ = ⟦fn:safe_json_parse⟧('{"⟦vr:name⟧":42}', ⟦fn:is_station_json⟧);
console.log(⟦vr:station⟧, ⟦vr:rejected⟧);

// Where unknown shines: boundary values (JSON, fetch, user input).
// Where any is (barely) acceptable: migrating old JS — and even then,
// \`@ts-expect-error\` on the single offending line beats a wide any.
export { ⟦fn:safe_json_parse⟧, ⟦fn:is_station_json⟧ };
`),

    ex("webdev-ex-033", "Mapped and conditional types", "Type-level programming: remap keys, derive variants, exclude and extract.", "TypeScript", "mapped_types", ".ts",
        `// Mapped + conditional types — types computed from types.

interface ⟦cl:StationConfig⟧ {
  ⟦vr:host⟧: string;
  ⟦vr:port⟧: number;
  ⟦vr:retries⟧: number;
  ⟦vr:verbose⟧: boolean;
}

// 1. Mapped type: transform every value type.
type ⟦vr:Frozen⟧<T> = { readonly [K in keyof T]: T[K] };
type ⟦vr:Optional⟧<T> = { [K in keyof T]?: T[K] };
type ⟦vr:Stringified⟧<T> = { [K in keyof T]: string };

// 2. Key remapping (as clauses) — rename or filter keys:
type ⟦vr:Getters⟧<T> = { [K in keyof T as \`get_\${string & K}\`]: () => T[K] };
type ⟦vr:OnlyNumbers⟧<T> = { [K in keyof T as T[K] extends number ? K : never]: T[K] };

type ⟦vr:NumericConfig⟧ = ⟦vr:OnlyNumbers⟧<⟦cl:StationConfig⟧>;   // { port, retries }

// 3. Conditional types — pick a type by predicate:
type ⟦vr:Unwrap⟧<T> = T extends Promise<infer U> ? U : T;
type ⟦vr:Element⟧<T> = T extends (infer E)[] ? E : never;

type ⟦vr:A⟧ = ⟦vr:Unwrap⟧<Promise<number>>;        // number
type ⟦vr:B⟧ = ⟦vr:Element⟧<string[]>;             // string

// 4. Exclude / Extract on unions:
type ⟦vr:Fields⟧ = keyof ⟦cl:StationConfig⟧;               // "host" | "port" | ...
type ⟦vr:BooleansOnly⟧ = Extract<⟦vr:Fields⟧, { [K in ⟦vr:Fields⟧]: ⟦cl:StationConfig⟧[K] extends boolean ? K : never }[⟦vr:Fields⟧]>;

// 5. The reaction state pattern — one union drives everything:
type ⟦vr:RequestState⟧<T> =
  | { ⟦vr:status⟧: "idle" }
  | { ⟦vr:status⟧: "loading" }
  | { ⟦vr:status⟧: "success"; ⟦vr:data⟧: T }
  | { ⟦vr:status⟧: "error"; ⟦vr:message⟧: string };

type ⟦vr:ReadingsState⟧ = ⟦vr:RequestState⟧<number[]>;

const ⟦fn:render_state⟧ = (⟦vr:state⟧: ⟦vr:ReadingsState⟧): string => {
  switch (⟦vr:state⟧.⟦vr:status⟧) {
    case "idle":    return "—";
    case "loading": return "loading…";
    case "success": return \`\${⟦vr:state⟧.⟦vr:data⟧.length} ⟦vr:readings⟧\`;
    case "error":   return \`! \${⟦vr:state⟧.⟦vr:message⟧}\`;
  }
};

console.log(⟦fn:render_state⟧({ ⟦vr:status⟧: "success", ⟦vr:data⟧: [1, 2, 3] }));
const ⟦vr:numeric⟧: ⟦vr:NumericConfig⟧ = { ⟦vr:port⟧: 5432, ⟦vr:retries⟧: 2 };
console.log(⟦vr:numeric⟧);

export { ⟦fn:render_state⟧ };
`),

    ex("webdev-ex-034", "Classes with access modifiers", "implements, private/protected, abstract methods and accessor pairs.", "TypeScript", "ts_classes", ".ts",
        `// Classes — the TypeScript extras that matter.

interface ⟦cl:Serializable⟧ {
  ⟦fn:to_json⟧(): string;
}

abstract class ⟦cl:Sensor⟧ implements ⟦cl:Serializable⟧ {
  // modifier menu: public (default) / private / protected / readonly
  constructor(
    public readonly ⟦vr:id⟧: string,
    protected ⟦vr:unit⟧: string,
    private ⟦vr:offset⟧: number = 0,
  ) {}

  // abstract: every subclass MUST provide it:
  protected abstract ⟦fn:raw_read⟧(): number;

  ⟦fn:read⟧(): number {
    return this.⟦fn:raw_read⟧() + this.⟦vr:offset⟧;
  }

  // accessor pair — computed property with a backing field:
  private ⟦vr:_cached⟧: number | null = null;
  get ⟦vr:last_value⟧(): number {
    if (this.⟦vr:_cached⟧ === null) this.⟦vr:_cached⟧ = this.⟦fn:read⟧();
    return this.⟦vr:_cached⟧;
  }
  ⟦fn:reset_cache⟧(): void { this.⟦vr:_cached⟧ = null; }

  ⟦fn:to_json⟧(): string {
    return JSON.stringify({ ⟦vr:id⟧: this.⟦vr:id⟧, ⟦vr:unit⟧: this.⟦vr:unit⟧, ⟦vr:value⟧: this.⟦fn:read⟧() });
  }
}

class ⟦cl:Thermometer⟧ extends ⟦cl:Sensor⟧ {
  constructor(⟦vr:id⟧: string, private ⟦vr:base_c⟧: number) {
    super(⟦vr:id⟧, "°C", -0.5);            // calibration offset
  }
  protected ⟦fn:raw_read⟧(): number {
    return this.⟦vr:base_c⟧ + Math.random() * 0.4;
  }
}

class ⟦cl:Barometer⟧ extends ⟦cl:Sensor⟧ {
  constructor(⟦vr:id⟧: string, private ⟦vr:base_kpa⟧: number) {
    super(⟦vr:id⟧, "kPa");
  }
  protected ⟦fn:raw_read⟧(): number {
    return this.⟦vr:base_kpa⟧ - Math.random() * 0.2;
  }
}

const ⟦vr:sensors⟧: ⟦cl:Sensor⟧[] = [new ⟦cl:Thermometer⟧("t-1", 12), new ⟦cl:Barometer⟧("b-1", 1013)];
for (const ⟦vr:sensor⟧ of ⟦vr:sensors⟧) {
  console.log(\`\${⟦vr:sensor⟧.⟦vr:id⟧}: \${⟦vr:sensor⟧.⟦fn:read⟧().toFixed(2)} → \${⟦vr:sensor⟧.⟦fn:to_json⟧()}\`);
  // ⟦vr:sensor⟧.⟦vr:offset⟧          // Error: private
  // ⟦vr:sensor⟧.⟦fn:raw_read⟧      // Error: protected
}

export { ⟦cl:Thermometer⟧, ⟦cl:Barometer⟧ };
`),

    ex("webdev-ex-035", "TypeScript with DOM", "Strict DOM typing: querySelector generics, event targets, dataset and null checks.", "TypeScript", "ts_dom", ".ts",
        `// DOM typing — null checks and generics that keep the browser honest.
// (Open this next to an HTML page that has the matching elements.)

interface ⟦cl:ReadingRow⟧ {
  ⟦vr:timestamp⟧: string;
  ⟦vr:temp_c⟧: number;
}

declare const document: Document;   // in a browser this is global already

// 1. querySelector returns Element | null — narrow with a class check:
function ⟦fn:require_element⟧<T extends HTMLElement>(⟦vr:selector⟧: string): T {
  const ⟦vr:element⟧ = document.querySelector<T>(⟦vr:selector⟧);
  if (!⟦vr:element⟧) throw new Error(\`missing element \${⟦vr:selector⟧}\`);
  return ⟦vr:element⟧;
}

// 2. Events: currentTarget is the listener owner (typed!), target is wider:
function ⟦fn:wire_up⟧(⟦vr:readings⟧: ⟦cl:ReadingRow⟧[]): void {
  const ⟦vr:table_body⟧ = ⟦fn:require_element⟧<HTMLTableSectionElement>("#readings tbody");
  const ⟦vr:export_button⟧ = ⟦fn:require_element⟧<HTMLButtonElement>("#export");

  for (const ⟦vr:reading⟧ of ⟦vr:readings⟧) {
    const ⟦vr:row⟧ = ⟦vr:table_body⟧.insertRow();
    ⟦vr:row⟧.insertCell().textContent = ⟦vr:reading⟧.⟦vr:timestamp⟧;
    const ⟦vr:temp_cell⟧ = ⟦vr:row⟧.insertCell();
    ⟦vr:temp_cell⟧.textContent = ⟦vr:reading⟧.⟦vr:temp_c⟧.toFixed(1);
    ⟦vr:temp_cell⟧.dataset.⟦vr:unit⟧ = "celsius";      // dataset is typed string
  }

  ⟦vr:export_button⟧.addEventListener("click", (⟦vr:event⟧) => {
    ⟦vr:event⟧.preventDefault();
    const ⟦vr:button⟧ = ⟦vr:event⟧.currentTarget as HTMLButtonElement;  // typed back
    ⟦vr:button⟧.disabled = true;
    console.log("exporting…");
  });

  // 3. Keyboard events carry their own subtype:
  document.addEventListener("keydown", (⟦vr:event⟧: KeyboardEvent) => {
    if (⟦vr:event⟧.key === "e" && (⟦vr:event⟧.metaKey || ⟦vr:event⟧.ctrlKey)) {
      ⟦vr:event⟧.preventDefault();
      console.log("export shortcut");
    }
  });
}

// 4. The JSON round trip through the DOM (data-* attributes):
const ⟦fn:restore_state⟧ = (): ⟦cl:ReadingRow⟧[] => {
  const ⟦vr:container⟧ = document.querySelector<HTMLElement>("[data-readings]");
  const ⟦vr:raw⟧: unknown = JSON.parse(⟦vr:container⟧?.dataset.readings ?? "[]");
  return Array.isArray(⟦vr:raw⟧) ? (⟦vr:raw⟧ as ⟦cl:ReadingRow⟧[]) : [];
};

// console.log(⟦fn:wire_up⟧([{ timestamp: "09:00", temp_c: 12.1 }]));
export { ⟦fn:wire_up⟧, ⟦fn:restore_state⟧ };
`),

    ex("webdev-dom-ex-036", "Querying the DOM", "querySelector + closest + matches — finding things without a framework.", "Browser & DOM", "dom_query", ".js",
        `// DOM querying — modern, minimal, no jQuery.

// (In the browser — demo against a structure like:
//  <ul class="todo-list">
//    <li class="todo done" data-id="1"><input type="checkbox"> water plants</li>
//    <li class="todo" data-id="2"><input type="checkbox"> ship release</li>
//  </ul>)

const ⟦fn:setup_dom_query⟧ = () => {
  // querySelector: first match, null-safe chaining:
  const ⟦vr:first_todo⟧ = document.querySelector(".todo");
  const ⟦vr:checkbox⟧ = document.querySelector<HTMLInputElement>(".todo input[type=checkbox]");
  console.log(⟦vr:first_todo⟧?.textContent?.trim(), ⟦vr:checkbox⟧?.checked);

  // querySelectorAll: a real NodeList — forEach built in:
  document.querySelectorAll(".todo").forEach((⟦vr:element⟧) => {
    console.log(⟦vr:element⟧.dataset.⟦vr:id⟧, ⟦vr:element⟧.className);
  });

  // closest: climb to the ancestor that matters (event delegation's engine):
  const ⟦vr:todo_item⟧ = document.querySelector(".todo input")?.closest(".todo");
  console.log("closest .todo:", ⟦vr:todo_item⟧?.dataset.⟦vr:id⟧);

  // matches: does THIS element fit the selector?
  if (⟦vr:todo_item⟧?.matches(".todo.done")) {
    console.log("already done");
  }

  // The delegation pattern — ONE listener for the whole list:
  const ⟦vr:list⟧ = document.querySelector(".todo-list");
  ⟦vr:list⟧?.addEventListener("click", (⟦vr:event⟧) => {
    const ⟦vr:target_todo⟧ = (⟦vr:event⟧.target as HTMLElement).closest(".todo");
    if (⟦vr:target_todo⟧ && ⟦vr:target_todo⟧.matches(".todo")) {
      ⟦vr:target_todo⟧.classList.toggle("done");
      console.log("toggled", ⟦vr:target_todo⟧.dataset.⟦vr:id⟧);
    }
  });
};

if (typeof document !== "undefined") ⟦fn:setup_dom_query⟧();
else console.log("no DOM in this runtime — patterns still apply in the browser");
`),

    ex("webdev-dom-ex-037", "Building DOM nodes", "createElement, templates via innerHTML, and document fragments for batch inserts.", "Browser & DOM", "dom_build", ".js",
        `// Building DOM — three ways, from verbose to fast.

const ⟦vr:readings⟧ = [
  { ⟦vr:timestamp⟧: "09:00", ⟦vr:temp_c⟧: 12.1 },
  { ⟦vr:timestamp⟧: "10:00", ⟦vr:temp_c⟧: 13.6 },
  { ⟦vr:timestamp⟧: "11:00", ⟦vr:temp_c⟧: 15.0 },
];

// 1. createElement — verbose, but type-safe and XSS-proof:
function ⟦fn:row_from_scratch⟧(⟦vr:reading⟧) {
  const ⟦vr:row⟧ = document.createElement("tr");
  const ⟦vr:time_cell⟧ = document.createElement("td");
  ⟦vr:time_cell⟧.textContent = ⟦vr:reading⟧.⟦vr:timestamp⟧;    // textContent, never innerHTML, for DATA
  const ⟦vr:temp_cell⟧ = document.createElement("td");
  ⟦vr:temp_cell⟧.textContent = ⟦vr:reading⟧.⟦vr:temp_c⟧.toFixed(1);
  ⟦vr:row⟧.append(⟦vr:time_cell⟧, ⟦vr:temp_cell⟧);            // append takes many
  return ⟦vr:row⟧;
}

// 2. <template> — the framework-free component:
function ⟦fn:row_from_template⟧(⟦vr:template⟧, ⟦vr:reading⟧) {
  const ⟦vr:fragment⟧ = ⟦vr:template⟧.content.cloneNode(true);
  const ⟦vr:row⟧ = ⟦vr:fragment⟧.querySelector("tr");
  ⟦vr:row⟧.querySelector("[data-field=time]").textContent = ⟦vr:reading⟧.⟦vr:timestamp⟧;
  ⟦vr:row⟧.querySelector("[data-field=temp]").textContent = ⟦vr:reading⟧.⟦vr:temp_c⟧.toFixed(1);
  return ⟦vr:fragment⟧;
}

// 3. DocumentFragment — batch inserts cause ONE reflow:
function ⟦fn:render_readings⟧(⟦vr:table_body⟧) {
  const ⟦vr:fragment⟧ = new DocumentFragment();
  for (const ⟦vr:reading⟧ of ⟦vr:readings⟧) ⟦vr:fragment⟧.append(⟦fn:row_from_scratch⟧(⟦vr:reading⟧));
  ⟦vr:table_body⟧.replaceChildren(⟦vr:fragment⟧);    // wipes + inserts atomically
}

if (typeof document === "undefined") {
  console.log("no DOM here — run this file from an HTML page to see the table");
} else {
  const ⟦vr:table⟧ = document.createElement("table");
  const ⟦vr:tbody⟧ = ⟦vr:table⟧.appendChild(document.createElement("tbody"));
  ⟦fn:render_readings⟧(⟦vr:tbody⟧);
  document.body.append(⟦vr:table⟧);
  console.log(\`rendered \${⟦vr:readings⟧.length} ⟦vr:rows⟧ with one reflow\`);
}
`),

    ex("webdev-dom-ex-038", "Form validation", "Constraint Validation API: checkValidity, setCustomValidity and live feedback.", "Browser & DOM", "form_validation", ".js",
        `// Form validation — the browser does most of it for free.

const ⟦fn:wire_validation⟧ = () => {
  const ⟦vr:form⟧ = document.querySelector("form");

  // The Constraint Validation API — the attributes do the work:
  ⟦vr:form⟧?.addEventListener("submit", (⟦vr:event⟧) => {
    ⟦vr:event⟧.preventDefault();
    if (!⟦vr:form⟧.checkValidity()) {
      ⟦vr:form⟧.reportValidity();              // native bubbles + focus
      return;
    }
    const ⟦vr:data⟧ = Object.fromEntries(new FormData(⟦vr:form⟧));
    console.log("submitting:", ⟦vr:data⟧);
  });

  // Live feedback as the user leaves each field:
  ⟦vr:form⟧?.querySelectorAll("input, textarea, select").forEach((⟦vr:field⟧) => {
    ⟦vr:field⟧.addEventListener("blur", () => {
      const ⟦vr:row⟧ = ⟦vr:field⟧.closest(".field");
      if (!⟦vr:row⟧) return;
      ⟦vr:row⟧.dataset.invalid = String(!⟦vr:field⟧.validity.valid);
      const ⟦vr:message_slot⟧ = ⟦vr:row⟧.querySelector("[data-error]");
      if (⟦vr:message_slot⟧) {
        ⟦vr:message_slot⟧.textContent = ⟦vr:field⟧.validationMessage;  // localized!
      }
    });
  });

  // Custom rules via setCustomValidity (clears with ""):
  const ⟦vr:password⟧ = document.querySelector("input[name=password]");
  const ⟦vr:confirm⟧ = document.querySelector("input[name=confirm]");
  const ⟦fn:check_match⟧ = () => {
    const ⟦vr:mismatch⟧ = ⟦vr:confirm⟧?.value && ⟦vr:password⟧?.value !== ⟦vr:confirm⟧?.value;
    ⟦vr:confirm⟧?.setCustomValidity(⟦vr:mismatch⟧ ? "Passwords do not match" : "");
  };
  ⟦vr:password⟧?.addEventListener("input", ⟦fn:check_match⟧);
  ⟦vr:confirm⟧?.addEventListener("input", ⟦fn:check_match⟧);

  // validity tells you WHY (each flag is boolean):
  document.querySelectorAll("input").forEach((⟦vr:input⟧) => {
    ⟦vr:input⟧.addEventListener("input", () => {
      const ⟦vr:v⟧ = ⟦vr:input⟧.validity;
      if (⟦vr:v⟧.valueMissing) ⟦vr:input⟧.dataset.⟦vr:hint⟧ = "required";
      else if (⟦vr:v⟧.typeMismatch) ⟦vr:input⟧.dataset.⟦vr:hint⟧ = "wrong type";
      else if (⟦vr:v⟧.tooShort) ⟦vr:input⟧.dataset.⟦vr:hint⟧ = \`need \${⟦vr:input⟧.minLength}+ chars\`;
      else delete ⟦vr:input⟧.dataset.⟦vr:hint⟧;
    });
  });
};

if (typeof document === "undefined") console.log("browser-only — open from an HTML page");
else ⟦fn:wire_validation⟧();
`),

    ex("webdev-dom-ex-039", "Canvas drawing", "The 2D context basics: paths, gradients, text and a resize-safe setup.", "Browser & DOM", "canvas_draw", ".js",
        `// Canvas 2D — a tiny chart, drawn by hand.

const ⟦fn:draw_chart⟧ = () => {
  const ⟦vr:canvas⟧ = document.querySelector("canvas");
  if (!⟦vr:canvas⟧) return;
  const ⟦vr:ctx⟧ = ⟦vr:canvas⟧.getContext("2d");

  // DPR-aware sizing — the difference between crisp and blurry:
  const ⟦fn:resize⟧ = () => {
    const ⟦vr:ratio⟧ = window.devicePixelRatio || 1;
    const ⟦vr:rect⟧ = ⟦vr:canvas⟧.getBoundingClientRect();
    ⟦vr:canvas⟧.⟦vr:width⟧ = ⟦vr:rect⟧.⟦vr:width⟧ * ⟦vr:ratio⟧;
    ⟦vr:canvas⟧.⟦vr:height⟧ = ⟦vr:rect⟧.⟦vr:height⟧ * ⟦vr:ratio⟧;
    ⟦vr:ctx⟧.setTransform(⟦vr:ratio⟧, 0, 0, ⟦vr:ratio⟧, 0, 0);
    ⟦fn:render⟧(⟦vr:rect⟧.⟦vr:width⟧, ⟦vr:rect⟧.⟦vr:height⟧);
  };

  const ⟦vr:data⟧ = [12, 18, 9, 25, 21, 30, 27];

  const ⟦fn:render⟧ = (⟦vr:width⟧, ⟦vr:height⟧) => {
    ⟦vr:ctx⟧.clearRect(0, 0, ⟦vr:width⟧, ⟦vr:height⟧);

    // background gradient:
    const ⟦vr:bg⟧ = ⟦vr:ctx⟧.createLinearGradient(0, 0, 0, ⟦vr:height⟧);
    ⟦vr:bg⟧.addColorStop(0, "#f6faf7");
    ⟦vr:bg⟧.addColorStop(1, "#e2ede7");
    ⟦vr:ctx⟧.fillStyle = ⟦vr:bg⟧;
    ⟦vr:ctx⟧.fillRect(0, 0, ⟦vr:width⟧, ⟦vr:height⟧);

    // grid lines:
    ⟦vr:ctx⟧.strokeStyle = "#d5e0d9";
    ⟦vr:ctx⟧.lineWidth = 1;
    for (let ⟦vr:i⟧ = 1; ⟦vr:i⟧ < 5; ⟦vr:i⟧++) {
      const ⟦vr:y⟧ = (⟦vr:height⟧ / 5) * ⟦vr:i⟧;
      ⟦vr:ctx⟧.beginPath();
      ⟦vr:ctx⟧.moveTo(0, ⟦vr:y⟧);
      ⟦vr:ctx⟧.lineTo(⟦vr:width⟧, ⟦vr:y⟧);
      ⟦vr:ctx⟧.stroke();
    }

    // the line + area under it:
    const ⟦vr:max_value⟧ = Math.max(...⟦vr:data⟧) * 1.15;
    const ⟦fn:x_at⟧ = (⟦vr:index⟧) => (⟦vr:width⟧ / (⟦vr:data⟧.length - 1)) * ⟦vr:index⟧;
    const ⟦fn:y_at⟧ = (⟦vr:value⟧) => ⟦vr:height⟧ - 20 - (⟦vr:value⟧ / ⟦vr:max_value⟧) * (⟦vr:height⟧ - 50);

    ⟦vr:ctx⟧.beginPath();
    ⟦vr:ctx⟧.moveTo(⟦fn:x_at⟧(0), ⟦fn:y_at⟧(⟦vr:data⟧[0]));
    ⟦vr:data⟧.forEach((⟦vr:value⟧, ⟦vr:index⟧) => ⟦vr:ctx⟧.lineTo(⟦fn:x_at⟧(⟦vr:index⟧), ⟦fn:y_at⟧(⟦vr:value⟧)));
    ⟦vr:ctx⟧.lineTo(⟦vr:width⟧, ⟦vr:height⟧);
    ⟦vr:ctx⟧.lineTo(0, ⟦vr:height⟧);
    ⟦vr:ctx⟧.closePath();
    ⟦vr:ctx⟧.fillStyle = "rgba(44, 110, 91, 0.18)";
    ⟦vr:ctx⟧.fill();

    ⟦vr:ctx⟧.beginPath();
    ⟦vr:data⟧.forEach((⟦vr:value⟧, ⟦vr:index⟧) =>
      ⟦vr:index⟧ === 0 ? ⟦vr:ctx⟧.moveTo(⟦fn:x_at⟧(0), ⟦fn:y_at⟧(⟦vr:value⟧))
                       : ⟦vr:ctx⟧.lineTo(⟦fn:x_at⟧(⟦vr:index⟧), ⟦fn:y_at⟧(⟦vr:value⟧)));
    ⟦vr:ctx⟧.strokeStyle = "#2c6e5b";
    ⟦vr:ctx⟧.lineWidth = 2.5;
    ⟦vr:ctx⟧.stroke();

    // points + labels:
    ⟦vr:data⟧.forEach((⟦vr:value⟧, ⟦vr:index⟧) => {
      ⟦vr:ctx⟧.beginPath();
      ⟦vr:ctx⟧.arc(⟦fn:x_at⟧(⟦vr:index⟧), ⟦fn:y_at⟧(⟦vr:value⟧), 4, 0, Math.PI * 2);
      ⟦vr:ctx⟧.fillStyle = "#174d3e";
      ⟦vr:ctx⟧.fill();
      ⟦vr:ctx⟧.fillStyle = "#40514a";
      ⟦vr:ctx⟧.font = "11px ui-monospace, monospace";
      ⟦vr:ctx⟧.fillText(String(⟦vr:value⟧), ⟦fn:x_at⟧(⟦vr:index⟧) - 6, ⟦fn:y_at⟧(⟦vr:value⟧) - 10);
    });
  };

  new ResizeObserver(⟦fn:resize⟧).observe(⟦vr:canvas⟧);
};

if (typeof document === "undefined") console.log("browser-only — needs a <canvas> on the page");
else ⟦fn:draw_chart⟧();
`),

    ex("webdev-dom-ex-040", "IntersectionObserver", "Lazy reveal and infinite scroll triggers — observing without scroll listeners.", "Browser & DOM", "intersection_observer", ".js",
        `// IntersectionObserver — "is it visible?" without scroll math.

const ⟦fn:setup_reveals⟧ = () => {
  // 1. Scroll-in animations:
  const ⟦vr:reveal_observer⟧ = new IntersectionObserver(
    (⟦vr:entries⟧) => {
      for (const ⟦vr:entry⟧ of ⟦vr:entries⟧) {
        if (⟦vr:entry⟧.isIntersecting) {
          ⟦vr:entry⟧.target.classList.add("visible");
          ⟦vr:reveal_observer⟧.unobserve(⟦vr:entry⟧.target);   // once is enough
        }
      }
    },
    { threshold: 0.15 }                                        // 15% visible counts
  );
  document.querySelectorAll(".reveal").forEach((⟦vr:element⟧) => ⟦vr:reveal_observer⟧.observe(⟦vr:element⟧));

  // 2. Infinite scroll sentinel — rootMargin does the lookahead:
  const ⟦vr:loader⟧ = document.querySelector("#loader");
  const ⟦vr:page⟧ = { ⟦vr:number⟧: 1 };
  let ⟦vr:busy⟧ = false;

  const ⟦fn:load_page⟧ = async () => {
    if (⟦vr:busy⟧) return;
    ⟦vr:busy⟧ = true;
    ⟦vr:loader⟧?.classList.add("active");
    await new Promise((r) => setTimeout(r, 400));              // fetch(...)
    ⟦vr:page⟧.⟦vr:number⟧++;
    console.log("loaded page", ⟦vr:page⟧.⟦vr:number⟧);
    ⟦vr:loader⟧?.classList.remove("active");
    ⟦vr:busy⟧ = false;
  };

  const ⟦vr:scroll_observer⟧ = new IntersectionObserver(
    (⟦vr:entries⟧) => { if (⟦vr:entries⟧[0].isIntersecting) ⟦fn:load_page⟧(); },
    { rootMargin: "400px 0px" }                                // preload BEFORE the edge
  );
  if (⟦vr:loader⟧) ⟦vr:scroll_observer⟧.observe(⟦vr:loader⟧);

  // 3. Lazy images — the original use case:
  const ⟦vr:image_observer⟧ = new IntersectionObserver((⟦vr:entries⟧, ⟦vr:observer⟧) => {
    for (const ⟦vr:entry⟧ of ⟦vr:entries⟧) {
      if (!⟦vr:entry⟧.isIntersecting) continue;
      const ⟦vr:img⟧ = ⟦vr:entry⟧.target;
      ⟦vr:img⟧.src = ⟦vr:img⟧.dataset.src ?? "";               // data-src -> src
      ⟦vr:img⟧.removeAttribute("data-src");
      ⟦vr:observer⟧.unobserve(⟦vr:img⟧);
    }
  });
  document.querySelectorAll("img[data-src]").forEach((⟦vr:img⟧) => ⟦vr:image_observer⟧.observe(⟦vr:img⟧));
};

if (typeof IntersectionObserver === "undefined") {
  console.log("no IntersectionObserver in this runtime — browser only");
} else {
  ⟦fn:setup_reveals⟧();
}
`),
];
