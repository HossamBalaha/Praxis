/**
 * extensions-worker — the WORKER half of the extension runtime.
 *
 * This module never runs inside a Worker itself: it is a SOURCE
 * BUILDER. buildWorkerSource(manifest) returns the complete JS
 * source for a classic Web Worker, assembled as one IIFE:
 *
 *   (function () {
 *     "use strict";
 *     …RPC runtime (seq-keyed reply map + command dispatch table)…
 *     var praxis = { … };     // the API object handed to the code
 *     /* extension code *…   // the manifest's `code`, verbatim
 *     post({ kind: "ready" }); // boot handshake
 *   })();
 *
 * The host (src/lib/extensions-registry.ts) turns that string into a
 * Worker via a Blob URL — the same host-wiring shape as
 * src/lib/highlight-worker.ts's client (onmessage/onerror/try-catch
 * and a per-request timeout), except the source is generated per
 * extension instead of bundled.
 *
 * Protocol (host <-> worker), all structured-clone-safe:
 *   worker -> host: { kind:"call",   fn, args, seq }            (RPC request)
 *   worker -> host: { kind:"invoke-result", commandId, ok, error? }
 *   worker -> host: { kind:"ready" }                            (boot done)
 *   host   -> worker: { kind:"reply",  seq, ok, value?, error? } (RPC answer)
 *   host   -> worker: { kind:"invoke", commandId }              (run command)
 *
 * Every praxis.* method returns a Promise that settles when the
 * host's reply lands — or rejects after a 10 s timeout, so a dead
 * host bridge can never hang an extension forever.
 */

import type {ExtensionManifest} from "./extensions-registry";

/** RPC entry points the host exposes to workers. */
export type RpcFn =
    | "registerCommand"
    | "registerStatusBar"
    | "notify"
    | "insertText"
    | "getSelection"
    | "getDocument"
    | "setStorage"
    | "getStorage"
    | "log";

/** Worker -> host: an RPC request (seq is the reply-match key). */
export interface WorkerCallMessage {
    kind: "call";
    fn: RpcFn;
    args: unknown[];
    seq: number;
}

/** Worker -> host: outcome of a host-invoked command. */
export interface WorkerInvokeResultMessage {
    kind: "invoke-result";
    commandId: string;
    ok: boolean;
    error?: string;
}

/** Worker -> host: extension code finished loading (boot handshake). */
export interface WorkerReadyMessage {
    kind: "ready";
}

export type WorkerToHostMessage =
    | WorkerCallMessage
    | WorkerInvokeResultMessage
    | WorkerReadyMessage;

/** Host -> worker: the answer to a "call" (seq-matched). */
export interface HostReplyMessage {
    kind: "reply";
    seq: number;
    ok: boolean;
    value?: unknown;
    error?: string;
}

/** Host -> worker: run a command the extension registered. */
export interface HostInvokeMessage {
    kind: "invoke";
    commandId: string;
}

export type HostToWorkerMessage = HostReplyMessage | HostInvokeMessage;

/**
 * The RPC runtime, verbatim worker JS. String.raw keeps every
 * backslash literal (no TS escape processing), so the emitted source
 * is exactly what is written here. It contains no template
 * interpolations on purpose — only plain ES5 so any browser that
 * ships Workers can run it.
 */
const RUNTIME_BODY = String.raw`
"use strict";
var RPC_TIMEOUT_MS = 10000;
var seq = 0;
var pending = new Map();   // seq -> { resolve, reject, timer }
var handlers = new Map();  // commandId -> handler function

function post(msg) {
  self.postMessage(msg);
}

function call(fn, args) {
  return new Promise(function (resolve, reject) {
    var s = ++seq;
    var timer = setTimeout(function () {
      if (pending.delete(s)) {
        reject(new Error("RPC timeout after " + RPC_TIMEOUT_MS + "ms: " + fn));
      }
    }, RPC_TIMEOUT_MS);
    pending.set(s, { resolve: resolve, reject: reject, timer: timer });
    post({ kind: "call", fn: fn, args: args, seq: s });
  });
}

function runCommand(commandId) {
  var handler = handlers.get(commandId);
  if (typeof handler !== "function") {
    post({ kind: "invoke-result", commandId: commandId, ok: false, error: "no handler registered for command: " + commandId });
    return;
  }
  Promise.resolve()
    .then(function () { return handler(); })
    .then(
      function () { post({ kind: "invoke-result", commandId: commandId, ok: true }); },
      function (err) {
        post({ kind: "invoke-result", commandId: commandId, ok: false, error: String(err && err.message ? err.message : err) });
      }
    );
}

self.onmessage = function (ev) {
  var m = ev.data;
  if (!m || typeof m.kind !== "string") return;
  if (m.kind === "invoke") { runCommand(m.commandId); return; }
  if (m.kind === "reply") {
    var p = pending.get(m.seq);
    if (!p) return;
    pending.delete(m.seq);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.value);
    else p.reject(new Error(m.error || "RPC failed"));
  }
};

// The API surface extension code sees. Every method is an RPC
// round-trip to the permission-checked host implementation.
var praxis = {
  registerCommand: function (id, title, handler) {
    if (typeof handler === "function") handlers.set(id, handler);
    return call("registerCommand", [id, title]);
  },
  onCommand: function (id, handler) {
    handlers.set(id, handler);
    return Promise.resolve();
  },
  registerStatusBar: function (id, text, tooltip) {
    return call("registerStatusBar", [id, text, tooltip]);
  },
  notify: function (text, title) {
    return call("notify", [text, title]);
  },
  insertText: function (text) {
    return call("insertText", [text]);
  },
  getDocument: function () { return call("getDocument", []); },
  getSelection: function () { return call("getSelection", []); },
  setStorage: function (key, value) { return call("setStorage", [key, value]); },
  getStorage: function (key) { return call("getStorage", [key]); },
  log: function () {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) parts.push(String(arguments[i]));
    return call("log", [parts]);
  }
};
`;

/**
 * Build the full worker source for one manifest: the RPC runtime
 * first (so `praxis` exists), then the manifest's `code` verbatim
 * (plain JS, no imports), then the ready handshake that ends the
 * host's boot wait.
 */
export function buildWorkerSource(manifest: ExtensionManifest): string {
    return [
        "/* Praxis extension worker - generated source for " + manifest.id + " */",
        "(function () {",
        RUNTIME_BODY,
        "/* ---- extension code: " + manifest.id + " ---- */",
        manifest.code,
        "/* ---- end extension code ---- */",
        'post({ kind: "ready" });',
        "})();",
        "",
    ].join("\n");
}
