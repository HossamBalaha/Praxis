"use client";

import * as React from "react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Check, FlaskConical, Loader2, X} from "lucide-react";

/**
 * A modal dialog that shows a live, streaming preview of AI-generated
 * pytest tests as they arrive from /api/ai-generate-tests (SSE). The
 * user can watch the code appear in real time and cancel mid-stream.
 *
 * When the stream completes, the "Write to disk" button becomes
 * clickable; the parent handles the actual file write via
 * /api/import-py.
 */
interface AiTestPreviewDialogProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** The test file name (e.g. "test_foo.py") — shown in the header. */
    fileName: string | null;
    /** The accumulated test code so far (grows as tokens arrive). */
    testCode: string;
    /** True while the stream is still receiving tokens. */
    streaming: boolean;
    /** Error message if the stream failed; null otherwise. */
    error: string | null;
    /** Called when the user clicks "Write to disk". The parent writes
     * the file via /api/import-py and closes the dialog. */
    onWrite: () => void;
    /** Called when the user clicks "Cancel" (mid-stream) or "Discard"
     * (after the stream completed without writing). */
    onDiscard: () => void;
    /** True while the parent is writing the file to disk (disables the
     *  Write button + shows a spinner). */
    writing?: boolean;
}

export function AiTestPreviewDialog({
                                        open,
                                        onOpenChange,
                                        fileName,
                                        testCode,
                                        streaming,
                                        error,
                                        onWrite,
                                        onDiscard,
                                        writing = false,
                                    }: AiTestPreviewDialogProps) {
    const preRef = React.useRef<HTMLPreElement | null>(null);

    // Auto-scroll the preview to the bottom as new tokens arrive.
    React.useEffect(() => {
        const el = preRef.current;
        if (!el) return;
        const raf = requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
        });
        return () => cancelAnimationFrame(raf);
    }, [testCode]);

    return (
        <Dialog open={open} onOpenChange={(v) => {
            if (!v) onDiscard(); else onOpenChange(v);
        }}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FlaskConical className="size-4 text-cyan-500"/>
                        {streaming ? "Generating Tests…" : error ? "Test Generation Failed" : "Tests Generated"}
                        {streaming && <Loader2 className="size-3.5 animate-spin text-muted-foreground"/>}
                    </DialogTitle>
                    <DialogDescription>
                        {fileName
                            ? `AI is generating pytest tests — ${fileName}`
                            : "AI is generating pytest tests for the current script."}
                        {!streaming && !error && testCode
                            ? " Review the code below, then write it to disk or discard."
                            : null}
                    </DialogDescription>
                </DialogHeader>

                {/* Live code preview — grows as tokens arrive. */}
                <div className="flex-1 min-h-0 overflow-hidden rounded-md border bg-muted/30">
          <pre
              ref={preRef}
              className="h-full max-h-[55vh] overflow-auto p-3 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed"
              aria-label="Generated test code"
          >
            {testCode ? (
                testCode
            ) : error ? (
                <span className="text-destructive">{error}</span>
            ) : (
                <span className="text-muted-foreground italic">
                {streaming ? "Waiting for the first token…" : "(empty)"}
              </span>
            )}
              {streaming && testCode && (
                  <span
                      className="inline-block w-1.5 h-3.5 ml-0.5 align-text-bottom bg-foreground/70 animate-pulse"
                      aria-hidden
                  />
              )}
          </pre>
                </div>

                {/* Footer — Cancel/Discard on the left, Write on the right. */}
                <div className="flex items-center justify-between gap-2 pt-2">
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                        {testCode.length > 0 && `${testCode.length.toLocaleString()} chars`}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onDiscard}
                            disabled={writing}
                            className="gap-1.5 text-xs"
                            title={streaming ? "Cancel the stream" : "Discard without writing"}
                        >
                            <X className="size-3.5"/>
                            {streaming ? "Cancel" : "Discard"}
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={onWrite}
                            disabled={streaming || !!error || !testCode.trim() || writing}
                            className="gap-1.5 text-xs"
                            title="Write the generated tests to disk as a new file"
                        >
                            {writing ? (
                                <Loader2 className="size-3.5 animate-spin"/>
                            ) : (
                                <Check className="size-3.5"/>
                            )}
                            {writing ? "Writing…" : "Write to disk"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
