// tags: node, getting-started
/** HelloNode — a JavaScript file the IDE runs with `node`.
 *
 * Expects one Run with args like:  --name Praxis --count 3
 * (no args defaults). Prints to the Output panel exactly like a
 * Python run: live stdout via SSE, exit code in the history.
 */
const {parseArgs} = require("node:util");

const {values} = parseArgs({
  options: {
    name: {type: "string", default: "Praxis"},
    count: {type: "string", default: "3"},
  },
});

const greetings = [];
for (let i = 1; i <= Number(values.count); i++) {
  greetings.push(`[${i}] Hello, ${values.name}!`);
}
console.log(greetings.join("\n"));

// A tiny stats block — exercise the number formatting on stream.
const xs = [3, 1, 4, 1, 5, 9, 2, 6];
const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
console.log(`mean=${mean.toFixed(3)} variance=${variance.toFixed(3)} stdev=${Math.sqrt(variance).toFixed(3)}`);
console.log("done — exit 0");
