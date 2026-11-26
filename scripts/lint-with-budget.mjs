#!/usr/bin/env node
/**
 * Budget-ratcheted lint runner — the implementation behind
 * `bun run lint`.
 *
 * Reads the warning budget from .lint-warning-budget, then runs eslint
 * with `--max-warnings <budget>` so that: errors always fail, and any
 * warning count above the budget fails. This makes the gate strict for
 * NEW code (zero new warnings allowed) while the recorded legacy debt
 * shrinks over time — see the contract documented in the budget file.
 *
 * `bun run lint:raw` (plain `eslint .`) remains available for humans
 * who want the ungated report while working the debt down.
 */
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

/** Repository root (this script lives in <root>/scripts/). */
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Absolute path of the budget file. */
const budgetPath = resolve(rootDir, ".lint-warning-budget");

/** Absolute path of the local eslint binary. */
const eslintBin = resolve(rootDir, "node_modules", "eslint", "bin", "eslint.js");

/**
 * Resolve the node binary to run eslint under.
 *
 * `bun run lint` executes THIS script under bun, and eslint spawned under
 * bun's node-compat layer dies with SIGKILL (exit 137) on this codebase —
 * so when the current runtime is bun, prefer a real node from PATH (the
 * same interpreter the node_modules/.bin shims shebang to, which is why
 * plain `bun run lint:raw` has always worked). If no node exists, fall
 * back to the current runtime as a last resort.
 */
function resolveRunnerPath() {
  if (!process.execPath.includes("bun")) {
    return process.execPath;
  }
  const probe = spawnSync("node", ["--version"], {encoding: "utf8"});
  if (probe.status === 0) {
    return "node";
  }
  return process.execPath;
}

/**
 * Parse the budget file and return the budget number.
 *
 * The file's last non-empty, non-comment line holds the number; comment
 * lines start with "#". Anything unparsable is a hard error — a broken
 * ratchet must never silently pass.
 */
function readBudget() {
  let raw = "";
  try {
    raw = readFileSync(budgetPath, "utf8");
  } catch {
    console.error(`[lint] cannot read ${budgetPath} — the budget file is required for the ratchet gate.`);
    process.exit(1);
  }
  const lines = raw.split("\n").filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
  const budget = Number.parseInt(lines[lines.length - 1] ?? "", 10);
  if (!Number.isFinite(budget) || budget < 0) {
    console.error(`[lint] ${budgetPath} does not end in a non-negative integer — fix the budget file.`);
    process.exit(1);
  }
  return budget;
}

// Announce the gate before the eslint report so the first line explains the rule.
const budget = readBudget();
console.log(`[lint] warning budget: ${budget} (errors always fail; warnings fail only above the budget — see .lint-warning-budget)`);

// Run eslint under the resolved runner with the budget cap; stdio is inherited so the report is the familiar eslint output, summary line included.
const runnerPath = resolveRunnerPath();
const result = spawnSync(runnerPath, [eslintBin, ".", "--max-warnings", String(budget)], {
  cwd: rootDir,
  stdio: "inherit",
});

// Propagate spawn failures loudly instead of pretending lint ran.
if (result.error) {
  console.error(`[lint] failed to start eslint: ${result.error.message}`);
  process.exit(1);
}

// Non-zero exit while the summary shows warnings at or under budget means real errors; above budget means new debt. Either way, explain the ratchet.
if (result.status !== 0) {
  console.log("");
  console.log("[lint] gate tripped. Errors always fail. If the failure is the warning cap:");
  console.log("[lint]   1. run `bun run lint:raw` and fix warnings until the total is below the budget;");
  console.log("[lint]   2. lower the number in .lint-warning-budget to the new count (never raise it).");
}
process.exit(result.status ?? 1);
