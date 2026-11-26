"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {BookOpen, CircleAlert, Cpu, KeyRound, Server, TerminalSquare,} from "lucide-react";

/**
 * AiModelHelpDialog — the helper the chat sidebar attaches when the
 * active AI model is not defined or does not exist.
 *
 * It walks the TWO ways to get a working model (the built-in Z.AI
 * SDK path was REMOVED along with the SDK — it only worked inside
 * Z.AI's own infrastructure):
 * ▸ A local model (Ollama / LM Studio) — download once, runs offline;
 * ▸ A hosted OpenAI-compatible API — paste a URL + key + model id.
 * Every path ends in Settings → AI ("Chat model providers"), and the
 * dialog's footer can jump straight there.
 */

export interface AiModelHelpDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The provider that failed the probe (shown in the header). */
    providerName?: string;
    /** What the probe said, verbatim, when available. */
    error?: string;
    /** Jump to Settings → AI ("Chat model providers"). */
    onOpenAiSettings?: () => void;
}

const Step = ({
                  n,
                  title,
                  Icon,
                  children,
              }: {
    n: number;
    title: string;
    Icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
}) => (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
        <div className="flex items-center gap-2">
      <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
        {n}
      </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="size-3.5 text-emerald-500"/>
                {title}
      </span>
        </div>
        <div className="text-[11px] leading-relaxed text-muted-foreground space-y-1 ps-8">{children}</div>
    </div>
);

const Cmd = ({children}: { children: React.ReactNode }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground">{children}</code>
);

export function AiModelHelpDialog({
                                      open,
                                      onOpenChange,
                                      providerName,
                                      error,
                                      onOpenAiSettings,
                                  }: AiModelHelpDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CircleAlert className="size-4 text-amber-500"/>
                        No AI model available
                    </DialogTitle>
                    <DialogDescription>
                        {providerName
                            ? `The selected provider (${providerName}) did not answer the pre-chat check`
                            : "The chat needs a model before it can answer"}
                        {error ? (
                            <>
                                {" — "}
                                <span className="font-mono text-[10px] break-all">{error}</span>
                            </>
                        ) : null}
                        . The composer stays disabled until one works — here is how to get one running.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2.5">
                    <Step n={1} title="Run a local model — free, offline (recommended)" Icon={Cpu}>
                        <p>
                            Install <strong>Ollama</strong> (ollama.com) or <strong>LM Studio</strong>
                            (lmstudio.ai), then pull a model:
                        </p>
                        <p>
                            <Cmd>ollama run llama3.2</Cmd> — the server starts on{" "}
                            <Cmd>http://localhost:11434</Cmd> and speaks an OpenAI-compatible API.
                        </p>
                        <p>
                            LM Studio: start the local server (Developer tab) — it listens on{" "}
                            <Cmd>http://localhost:1234/v1</Cmd>.
                        </p>
                    </Step>

                    <Step n={2} title="Add it as a provider in Settings → AI" Icon={Server}>
                        <p>
                            Open <strong>Settings → AI → Chat model providers</strong> (the AI tab in the
                            configs) and press <strong>+ Ollama</strong> / <strong>+ LM Studio</strong> from
                            the quick-add presets — the base URL is pre-filled.
                        </p>
                        <p>
                            Fill the <strong>Model</strong> field with the exact id the server serves (for
                            Ollama: what <Cmd>ollama list</Cmd> shows, e.g. <Cmd>llama3.2</Cmd>), then press{" "}
                            <strong>Test</strong> — a green line with the latency and model name means it
                            works.
                        </p>
                    </Step>

                    <Step n={3} title="…or use a hosted OpenAI-compatible API" Icon={KeyRound}>
                        <p>
                            Any endpoint speaking <Cmd>/chat/completions</Cmd> works: Z.AI&apos;s HTTP API,
                            OpenRouter, OpenAI, vLLM, llama.cpp… add it the same way and paste the API key
                            (local servers need none). Keys can be stored on the server&apos;s keyring
                            (~/.praxis/ai-keys.json) instead of the browser.
                        </p>
                    </Step>
                </div>

                <div
                    className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    <BookOpen className="mr-1 inline size-3.5 align-[-2px] text-sky-500"/>
                    <strong className="text-foreground">Where to configure:</strong> everything lives in{" "}
                    <strong>Settings → AI</strong> (⌘,) — providers, the active model, the system prompt,
                    context size, completion toggles and the pre-chat verification switch. The same
                    provider feeds the chat sidebar, code completion and test generation.
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        title="Close the helper — the composer stays disabled until a model tests OK"
                    >
                        Close
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => {
                                onOpenChange(false);
                                onOpenAiSettings?.();
                            }}
                            title="Open Settings directly on the AI tab — the provider cards and quick-add presets live there"
                        >
                            <TerminalSquare className="size-3.5"/>
                            Open Settings → AI
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
