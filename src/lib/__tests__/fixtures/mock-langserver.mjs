/**
 * mock-langserver.mjs — a minimal but PROTOCOL-FAITHFUL LSP server used
 * by the pyright-lsp lifecycle tests.
 *
 * The real pyright is a heavy optional dependency; the manager's
 * lifecycle (spawn, handshake, request/response, coalescing, crash,
 * restart, clean shutdown) must still be provable in CI. This fixture
 * is a plain Node script that speaks the same Content-Length framing
 * over stdio and answers the five methods Praxis uses:
 *
 *   initialize / initialized / shutdown / exit
 *   textDocument/didOpen | didChange | didClose
 *   textDocument/hover | definition | references | prepareRename | rename
 *
 * Test-controllable behavior is driven by the DOCUMENT TEXT (markers)
 * and by two environment variables:
 *
 *   MOCK_LOG       absolute path of a JSONL file every received message
 *                  is appended to (tests assert counts and ordering)
 *   MOCK_DELAY_MS  artificial delay before hover responses (tests the
 *                  request-timeout path)
 *
 * Text markers recognized at didOpen/didChange time:
 *   KILL_SERVER   the process exits(1) immediately (crash test)
 *   PUBLISH_DIAG  two diagnostics are published for the document
 *   CROSS_FILE    definition/references/rename also report a sibling
 *                  file `mock_other.py` next to the opened document
 *   mock_symbol   the identifier prepareRename/rename act on
 */

import {appendFileSync} from "node:fs";

// ── Logging ─────────────────────────────────────────────────────────
// Every received message is appended as one JSON line so tests can
// assert exact message counts and ordering after the fact.
const logFile = process.env.MOCK_LOG ?? "";

/** Append one structured log entry (never throws). */
function log(entry) {
  // Without a log path there is nothing to do.
  if (!logFile) return;
  // Best-effort append — a broken log must not kill the "server".
  try {
    appendFileSync(logFile, JSON.stringify({ts: Date.now(), ...entry}) + "\n", "utf-8");
  } catch {
    /* ignore */
  }
}

// Announce our own death so tests can await clean shutdown.
process.on("exit", (code) => log({type: "exit", code}));

// ── Framing: reading framed requests from stdin ────────────────────
let stdinBuffer = Buffer.alloc(0);

/** Extract every complete frame currently buffered. */
function takeFrames() {
  // The frames decoded from the buffer.
  const frames = [];
  // Loop while a full header + body is present.
  for (; ;) {
    // Nothing left to parse.
    if (stdinBuffer.byteLength === 0) break;
    // Must be aligned on a Content-Length header.
    if (stdinBuffer.subarray(0, 15).toString("ascii") !== "Content-Length") {
      // Try to realign to the next frame.
      const idx = stdinBuffer.indexOf("Content-Length", 0, "ascii");
      // Unrecoverable — drop everything.
      if (idx < 0) {
        stdinBuffer = Buffer.alloc(0);
        break;
      }
      // Slice to the found header.
      stdinBuffer = stdinBuffer.subarray(idx);
    }
    // Find the header terminator.
    const headerEnd = stdinBuffer.indexOf("\r\n\r\n", 0, "ascii");
    // Header incomplete — wait for more bytes.
    if (headerEnd < 0) break;
    // The declared body length.
    const declared = Number(/Content-Length:\s*(\d+)/.exec(stdinBuffer.subarray(0, headerEnd).toString("ascii"))?.[1] ?? "-1");
    // Malformed — drop the header block.
    if (!(declared >= 0)) {
      stdinBuffer = stdinBuffer.subarray(headerEnd + 4);
      continue;
    }
    // Body incomplete — wait for more bytes.
    const bodyStart = headerEnd + 4;
    if (stdinBuffer.byteLength < bodyStart + declared) break;
    // Slice + parse the body.
    const body = stdinBuffer.subarray(bodyStart, bodyStart + declared).toString("utf-8");
    try {
      frames.push(JSON.parse(body));
    } catch {
      /* skip a malformed frame */
    }
    // Compact past this frame.
    stdinBuffer = stdinBuffer.subarray(bodyStart + declared);
  }
  // Hand the decoded frames to the caller.
  return frames;
}

process.stdin.on("data", (chunk) => {
  // Accumulate the raw bytes.
  stdinBuffer = Buffer.concat([stdinBuffer, chunk]);
  // Decode every complete frame and dispatch it.
  for (const msg of takeFrames()) {
    dispatch(msg);
  }
});

// ── Framing: writing framed responses to stdout ────────────────────
/** Serialize one message into the framed wire format. */
function writeFrame(payload) {
  // The utf-8 body bytes.
  const body = Buffer.from(JSON.stringify(payload), "utf-8");
  // The ASCII header announcing the body length.
  const header = Buffer.from(`Content-Length: ${body.byteLength}\r\n\r\n`, "ascii");
  // One atomic write per message.
  process.stdout.write(Buffer.concat([header, body]));
}

// ── Tracked documents ───────────────────────────────────────────────
// uri → current text (kept current by didChange).
const docs = new Map();

// ── Protocol handlers ───────────────────────────────────────────────
/** Dispatch one decoded message. */
function dispatch(msg) {
  // Notifications have no id.
  const isRequest = typeof msg.id === "number";
  // The method name ("$/setTrace" etc. are ignored silently).
  const method = msg.method ?? "";
  // Every received message is logged (except the noisy setTrace).
  if (method !== "$/setTrace") {
    log({type: isRequest ? "request" : "notification", method, id: msg.id});
  }

  // Lifecycle: initialize.
  if (method === "initialize") {
    // Remember the pythonPath the manager configured (restart test).
    log({type: "initialize-options", pythonPath: msg.params?.initializationOptions?.python?.pythonPath ?? null});
    // Answer with the capabilities the manager consumes.
    writeFrame({
      jsonrpc: "2.0",
      id: msg.id,
      result: {
        capabilities: {
          textDocumentSync: 1, // FULL text sync.
          hoverProvider: true,
          definitionProvider: true,
          referencesProvider: true,
          renameProvider: {prepareProvider: true},
        },
        serverInfo: {name: "mock-pyright", version: "1.2.3"},
      },
    });
    return;
  }
  // Lifecycle: initialized (notification).
  if (method === "initialized") {
    // Nothing to do.
    return;
  }
  // Lifecycle: shutdown (request) — answer null per spec.
  if (method === "shutdown") {
    writeFrame({jsonrpc: "2.0", id: msg.id, result: null});
    return;
  }
  // Lifecycle: exit (notification) — die cleanly per spec.
  if (method === "exit") {
    process.exit(0);
  }

  // Document sync: didOpen.
  if (method === "textDocument/didOpen") {
    // Track the document text.
    const text = msg.params?.textDocument?.text ?? "";
    const uri = msg.params?.textDocument?.uri ?? "";
    docs.set(uri, text);
    log({type: "didOpen", uri, length: text.length});
    // Crash marker — die like a real killed process.
    if (text.includes("KILL_SERVER")) {
      process.exit(1);
    }
    // Diagnostics marker — publish two typed diagnostics.
    if (text.includes("PUBLISH_DIAG")) {
      writeFrame({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: {
          uri,
          diagnostics: [
            {
              range: {start: {line: 0, character: 0}, end: {line: 0, character: 5}},
              severity: 1,
              code: "reportGeneralTypeIssues",
              message: "mock error: incompatible type",
            },
            {
              range: {start: {line: 1, character: 4}, end: {line: 1, character: 9}},
              severity: 2,
              code: "reportOptionalMemberAccess",
              message: "mock warning: optional member access",
            },
          ],
        },
      });
    }
    return;
  }
  // Document sync: didChange (full text — sync kind 1).
  if (method === "textDocument/didChange") {
    // The full replacement text.
    const changes = msg.params?.contentChanges ?? [];
    const text = changes.length > 0 ? String(changes[changes.length - 1].text ?? "") : "";
    const uri = msg.params?.textDocument?.uri ?? "";
    docs.set(uri, text);
    log({type: "didChange", uri, version: msg.params?.textDocument?.version, length: text.length});
    // Crash marker mid-session — a server can die at ANY point, not
    // just between open/close.
    if (text.includes("KILL_SERVER")) {
      process.exit(1);
    }
    // Diagnostics marker — real pyright republishes after every edit,
    // so the mock does too (fresh versions let clients detect changes).
    if (text.includes("PUBLISH_DIAG")) {
      writeFrame({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: {
          uri,
          diagnostics: [
            {
              range: {start: {line: 0, character: 0}, end: {line: 0, character: 5}},
              severity: 1,
              code: "reportGeneralTypeIssues",
              message: "mock error: incompatible type",
            },
            {
              range: {start: {line: 1, character: 4}, end: {line: 1, character: 9}},
              severity: 2,
              code: "reportOptionalMemberAccess",
              message: "mock warning: optional member access",
            },
          ],
        },
      });
    }
    return;
  }
  // Document sync: didClose.
  if (method === "textDocument/didClose") {
    // Forget the document.
    docs.delete(msg.params?.textDocument?.uri ?? "");
    return;
  }

  // hover — optionally delayed (MOCK_DELAY_MS) to test timeouts.
  if (method === "textDocument/hover") {
    // Respond after the configured artificial delay.
    setTimeout(() => {
      writeFrame({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          contents: {
            kind: "markdown",
            value: "```python\n(def) mock_hover(x: int) -> str\n```\n\n---\nThe mock docstring.",
          },
        },
      });
    }, Number(process.env.MOCK_DELAY_MS ?? 0));
    return;
  }
  // definition — the document's own line 1, plus a sibling when asked.
  if (method === "textDocument/definition") {
    // The document being asked about.
    const uri = msg.params?.textDocument?.uri ?? "";
    // The locations to report.
    const locations = [{uri, range: {start: {line: 0, character: 0}, end: {line: 0, character: 4}}}];
    // Cross-file marker.
    if ((docs.get(uri) ?? "").includes("CROSS_FILE")) {
      locations.push({
        uri: siblingUri(uri),
        range: {start: {line: 2, character: 0}, end: {line: 2, character: 4}},
      });
    }
    writeFrame({jsonrpc: "2.0", id: msg.id, result: locations});
    return;
  }
  // references — two in-file rows, plus a sibling row when asked.
  if (method === "textDocument/references") {
    // The document being asked about.
    const uri = msg.params?.textDocument?.uri ?? "";
    // The in-file references.
    const locations = [
      {uri, range: {start: {line: 0, character: 0}, end: {line: 0, character: 11}}},
      {uri, range: {start: {line: 2, character: 4}, end: {line: 2, character: 15}}},
    ];
    // Cross-file marker.
    if ((docs.get(uri) ?? "").includes("CROSS_FILE")) {
      locations.push({
        uri: siblingUri(uri),
        range: {start: {line: 4, character: 0}, end: {line: 4, character: 11}},
      });
    }
    writeFrame({jsonrpc: "2.0", id: msg.id, result: locations});
    return;
  }
  // prepareRename — the first mock_symbol occurrence.
  if (method === "textDocument/prepareRename") {
    // The document and its text.
    const uri = msg.params?.textDocument?.uri ?? "";
    const text = docs.get(uri) ?? "";
    // Locate the tracked identifier.
    const idx = text.indexOf("mock_symbol");
    // Not present — the rename is not permitted here.
    if (idx < 0) {
      writeFrame({jsonrpc: "2.0", id: msg.id, result: null});
      return;
    }
    // Convert the flat offset into a (line, character) range.
    const range = offsetToRange(text, idx, "mock_symbol".length);
    writeFrame({jsonrpc: "2.0", id: msg.id, result: {range, placeholder: "mock_symbol"}});
    return;
  }
  // rename — whole-word edits of mock_symbol in every tracked file.
  if (method === "textDocument/rename") {
    // The document and its text.
    const uri = msg.params?.textDocument?.uri ?? "";
    const text = docs.get(uri) ?? "";
    // The new name to apply.
    const newName = String(msg.params?.newName ?? "renamed");
    // The per-file edit sets.
    const changes = {};
    // The current document's edits.
    changes[uri] = wholeWordEdits(text, "mock_symbol", newName);
    // Cross-file marker adds a sibling edit set.
    if (text.includes("CROSS_FILE")) {
      changes[siblingUri(uri)] = [
        {
          range: {start: {line: 1, character: 0}, end: {line: 1, character: 11}},
          newText: newName,
        },
      ];
    }
    writeFrame({jsonrpc: "2.0", id: msg.id, result: {changes}});
    return;
  }

  // Unknown REQUEST → MethodNotFound error (spec-correct).
  if (isRequest) {
    writeFrame({jsonrpc: "2.0", id: msg.id, error: {code: -32601, message: "method not found: " + method}});
  }
  // Unknown notification → ignored.
}

/** The sibling file uri used by CROSS_FILE markers. */
function siblingUri(uri) {
  // Strip the file name, append the sibling name.
  return uri.replace(/[^/]+$/, "") + "mock_other.py";
}

/** Convert a flat (offset, length) into an LSP range. */
function offsetToRange(text, start, length) {
  // The line the offset falls on (0-based).
  let line = 0;
  // The index of the newline before the offset.
  let lastNewline = -1;
  // Walk to the offset counting newlines.
  for (let i = 0; i < start; i++) {
    if (text[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }
  // The column (0-based) where the match starts.
  const character = start - lastNewline - 1;
  // The full LSP range.
  return {start: {line, character}, end: {line, character: character + length}};
}

/** Whole-word replacement edits for `name` across the whole text. */
function wholeWordEdits(text, name, newName) {
  // The collected edits.
  const edits = [];
  // A word-boundary-safe scanner.
  const isWord = (ch) => /[A-Za-z0-9_]/.test(ch ?? "");
  // Scan for occurrences.
  let idx = text.indexOf(name);
  while (idx >= 0) {
    // Whole-word check on both sides.
    const before = text[idx - 1];
    const after = text[idx + name.length];
    if (!isWord(before) && !isWord(after)) {
      // A real occurrence — record its edit.
      edits.push({range: offsetToRange(text, idx, name.length), newText: newName});
    }
    // Continue scanning past this hit.
    idx = text.indexOf(name, idx + 1);
  }
  // Done.
  return edits;
}

// Keep the process alive on open stdin.
process.stdin.resume();
