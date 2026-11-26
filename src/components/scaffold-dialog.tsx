"use client";

import * as React from "react";
import {FolderTree, Loader2, Sparkles} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";

/**
 * "Scaffold From Blueprint…" — ready-made mini-project
 * skeletons (folders + starter files) created inside a chosen parent
 * folder via the existing /api/folder-create + /api/file-create
 * routes. PascalCase names, camelCase variables — the app's defaults.
 */

interface ScaffoldDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    folders: Array<{ slug: string; name: string }>;
    onDone: () => void;
}

interface Blueprint {
    id: string;
    name: string;
    description: string;
    folders: string[];
    files: Array<{ path: string; content: string }>;
}

const BLUEPRINTS: Blueprint[] = [
    {
        id: "data-analysis",
        name: "Data analysis project",
        description: "Data / Notebooks / Plots / Scripts split with a starter loader.",
        folders: ["Data", "Notebooks", "Plots", "Scripts"],
        files: [
            {
                path: "Scripts/LoadData.py",
                content: `"""Load every table in ../Data and print a quick summary."""\nimport pathlib\n\nimport pandas as pd\n\ndataDir = pathlib.Path(__file__).resolve().parent.parent / "Data"\n\nfor tablePath in sorted(dataDir.iterdir()):\n    if tablePath.suffix.lower() in (".csv", ".tsv"):\n        frame = pd.read_csv(tablePath)\n        print(f"{tablePath.name}: {frame.shape[0]} rows x {frame.shape[1]} cols")\n`,
            },
            {
                path: "README.md",
                content: `# Data analysis project\n\n- \`Data/\` — raw tables (CSV / TSV)\n- \`Notebooks/\` — exploratory notebooks\n- \`Plots/\` — generated figures\n- \`Scripts/\` — runnable analysis scripts\n`,
            },
        ],
    },
    {
        id: "package-skeleton",
        name: "Package skeleton",
        description: "src/ + tests/ layout with an importable module and a pytest.",
        folders: ["Src/MyPackage", "Tests"],
        files: [
            {
                path: "Src/MyPackage/Core.py",
                content: `"""MyPackage core module."""\n\n\ndef Greet(who: str = "world") -> str:\n    """Return a friendly greeting."""\n    return f"Hello, {who}!"\n`,
            },
            {
                path: "Src/MyPackage/__init__.py",
                content: `"""MyPackage — a Praxis-scaffolded package."""\n\nfrom .Core import Greet\n\n__all__ = ["Greet"]\n`,
            },
            {
                path: "Tests/TestCore.py",
                content: `"""Tests for MyPackage.Core."""\nfrom MyPackage.Core import Greet\n\n\ndef TestGreetDefault():\n    assert Greet() == "Hello, world!"\n\n\ndef TestGreetName():\n    assert Greet("Praxis") == "Hello, Praxis!"\n`,
            },
        ],
    },
    {
        id: "ml-experiment",
        name: "ML experiment",
        description: "Data / Models / Runs layout with a seeded experiment script.",
        folders: ["Data", "Models", "Runs"],
        files: [
            {
                path: "RunExperiment.py",
                content: `"""A seeded, reproducible experiment stub."""\nimport random\n\nimport numpy as np\n\nseed = 42\nrandom.seed(seed)\nnp.random.seed(seed)\n\nsampleCount = 200\nfeatures = np.random.normal(size=(sampleCount, 4))\nlabels = (features[:, 0] > 0).astype(int)\n\nprint(f"features: {features.shape}, positive labels: {int(labels.sum())}")\nprint("Replace this stub with your real pipeline.")\n`,
            },
        ],
    },
    {
        id: "report-bundle",
        name: "Report bundle",
        description: "Figures / Sections / data sidecar for a written report.",
        folders: ["Figures", "Sections", "Data"],
        files: [
            {
                path: "README.md",
                content: `# Report bundle\n\n- \`Figures/\` — exported plots\n- \`Sections/\` — one Markdown file per section\n- \`Data/\` — the tables behind the figures\n`,
            },
        ],
    },
    {
        id: "cli-tool",
        name: "CLI tool",
        description: "argparse command-line app with subcommands and a pytest.",
        folders: ["Tests"],
        files: [
            {
                path: "Main.py",
                content: `"""A small command-line tool with subcommands.\n\nRun with: python Main.py greet --name Praxis\n          python Main.py stats --numbers 3 1 4 1 5\n"""\nimport argparse\nimport statistics\n\n\ndef BuildParser() -> argparse.ArgumentParser:\n    parser = argparse.ArgumentParser(prog="CliTool", description="A scaffolded CLI tool.")\n    sub = parser.add_subparsers(dest="command", required=True)\n\n    greet = sub.add_parser("greet", help="Print a greeting")\n    greet.add_argument("--name", default="world", help="Who to greet")\n\n    stats = sub.add_parser("stats", help="Summary statistics for numbers")\n    stats.add_argument("--numbers", nargs="+", type=float, required=True)\n\n    return parser\n\n\ndef Main(argv: list[str] | None = None) -> int:\n    args = BuildParser().parse_args(argv)\n    if args.command == "greet":\n        print(f"Hello, {args.name}!")\n    elif args.command == "stats":\n        print(f"count: {len(args.numbers)}")\n        print(f"mean:  {statistics.mean(args.numbers):.3f}")\n        print(f"stdev: {statistics.stdev(args.numbers):.3f}" if len(args.numbers) > 1 else "stdev: n/a")\n    return 0\n\n\nif __name__ == "__main__":\n    raise SystemExit(Main())\n`,
            },
            {
                path: "Tests/TestCli.py",
                content: `"""Tests for the CLI tool."""\nimport Main\n\n\ndef TestGreetDefault(capsys):\n    assert Main.Main(["greet"]) == 0\n    assert "Hello, world!" in capsys.readouterr().out\n\n\ndef TestStats():\n    assert Main.Main(["stats", "--numbers", "1", "2", "3"]) == 0\n`,
            },
            {
                path: "README.md",
                content: `# CLI tool\n\n- \`Main.py\` — argparse entry point with \`greet\` and \`stats\` subcommands\n- \`Tests/\` — pytest suite\n\nAdd new subcommands in \`BuildParser()\` and dispatch them in \`Main()\`.\n`,
            },
        ],
    },
    {
        id: "fastapi-app",
        name: "FastAPI web app",
        description: "App/Routers/Src layout with a ready-to-run API and tests.",
        folders: ["App", "Routers", "Src", "Tests"],
        files: [
            {
                path: "Server.py",
                content: `"""FastAPI application entry point.\n\nRun with:  uvicorn Server:app --reload\nRequires:  pip install fastapi uvicorn\n"""\nfrom fastapi import FastAPI\n\nfrom Routers import Items\n\napp = FastAPI(title="Scaffolded API")\n\napp.include_router(Items.router)\n\n\n@app.get("/")\ndef Root() -> dict:\n    """Service banner."""\n    return {"service": "scaffolded-api", "docs": "/docs"}\n`,
            },
            {
                path: "Routers/Items.py",
                content: `"""Items router — CRUD over an in-memory store."""\nfrom fastapi import APIRouter, HTTPException\n\nfrom Src import Store\n\nrouter = APIRouter(prefix="/items", tags=["items"])\n\n\n@router.get("")\ndef ListItems() -> list[dict]:\n    return Store.All()\n\n\n@router.post("")\ndef CreateItem(item: dict) -> dict:\n    return Store.Add(item)\n\n\n@router.get("/{itemId}")\ndef ReadItem(itemId: int) -> dict:\n    found = Store.Get(itemId)\n    if found is None:\n        raise HTTPException(status_code=404, detail="Item not found")\n    return found\n`,
            },
            {
                path: "Src/Store.py",
                content: `"""A tiny in-memory item store (id-keyed)."""\nfrom typing import Any\n\n_items: dict[int, dict[str, Any]] = {}\n_nextId = 1\n\n\ndef Reset() -> None:\n    """Clear the store (used by tests)."""\n    global _nextId\n    _items.clear()\n    _nextId = 1\n\n\ndef Add(item: dict[str, Any]) -> dict[str, Any]:\n    global _nextId\n    saved = {"id": _nextId, **item}\n    _items[_nextId] = saved\n    _nextId += 1\n    return saved\n\n\ndef Get(itemId: int) -> dict[str, Any] | None:\n    return _items.get(itemId)\n\n\ndef All() -> list[dict[str, Any]]:\n    return list(_items.values())\n`,
            },
            {
                path: "Routers/__init__.py",
                content: `"""Routers package."""\n`,
            },
            {
                path: "Src/__init__.py",
                content: `"""Src package."""\n`,
            },
            {
                path: "Tests/TestApi.py",
                content: `"""API tests (requires httpx for FastAPI's TestClient)."""\nfrom fastapi.testclient import TestClient\n\nimport Server\nfrom Src import Store\n\n\ndef TestRootAndItems():\n    Store.Reset()\n    client = TestClient(Server.app)\n    assert client.get("/").json()["service"] == "scaffolded-api"\n    created = client.post("/items", json={"name": "widget"}).json()\n    assert created["id"] == 1\n    assert client.get("/items/1").json()["name"] == "widget"\n    assert client.get("/items/999").status_code == 404\n`,
            },
            {
                path: "README.md",
                content: `# FastAPI web app\n\n- \`Server.py\` — the app factory; run \`uvicorn Server:app --reload\`\n- \`Routers/\` — one file per API area\n- \`Src/\` — plain-Python services the routers call\n- \`Tests/\` — TestClient-based pytest suite\n\nInteractive docs live at \`/docs\` (Swagger) once the server runs.\n`,
            },
        ],
    },
];

export function ScaffoldDialog({open, onOpenChange, folders, onDone}: ScaffoldDialogProps) {
    const {toast} = useToast();
    const [blueprintId, setBlueprintId] = React.useState(BLUEPRINTS[0].id);
    const [name, setName] = React.useState("");
    const [parentSlug, setParentSlug] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (open) {
            setBlueprintId(BLUEPRINTS[0].id);
            setName("");
            setParentSlug(folders[0]?.slug ?? "");
        }
    }, [open, folders]);

    const scaffold = async () => {
        const bp = BLUEPRINTS.find((b) => b.id === blueprintId);
        const rootName = (name || `${bp?.name.replace(/\s+/g, "")}Project`).trim();
        if (!bp || !parentSlug) return;
        setBusy(true);
        try {
            // Root folder under the chosen parent.
            let res = await fetch("/api/folder-create", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({name: rootName, folder: parentSlug}),
            });
            let json = await res.json();
            if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
            // Sub-folders (nested paths are created stepwise).
            for (const folder of bp.folders) {
                const segs = folder.split("/");
                let rel = "";
                for (const seg of segs) {
                    rel = rel ? `${rel}/${seg}` : seg;
                    const slugified = rel
                        .split("/")
                        .map((s) => s.replace(/\s+/g, ""))
                        .join("/");
                    res = await fetch("/api/folder-create", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({
                            name: seg,
                            folder: parentSlug,
                            sub: `${rootName}/${slugified.split("/").slice(0, -1).join("/")}`.replace(/\/$/, "") || rootName
                        }),
                    });
                    // 409 = already exists — fine for idempotent scaffolds.
                    if (!res.ok && res.status !== 409) {
                        json = await res.json();
                        throw new Error(json.error ?? `HTTP ${res.status} for ${seg}`);
                    }
                }
            }
            // Starter files.
            for (const file of bp.files) {
                res = await fetch("/api/file-create", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({
                        folder: parentSlug,
                        fileName: `${rootName}/${file.path}`,
                        content: file.content,
                    }),
                });
                if (!res.ok && res.status !== 409) {
                    const json = await res.json();
                    throw new Error(json.error ?? `HTTP ${res.status} for ${file.path}`);
                }
            }
            toast({
                title: `Scaffolded "${rootName}"`,
                description: `${bp.folders.length} folder(s), ${bp.files.length} starter file(s).`,
                variant: "success",
            });
            onDone();
            onOpenChange(false);
        } catch (err) {
            toast({title: "Scaffold failed", description: (err as Error).message, variant: "destructive"});
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="size-4 text-emerald-500"/>
                        Scaffold From Blueprint
                    </DialogTitle>
                    <DialogDescription>
                        Create a ready-made mini-project (folders + starter files) inside a parent folder.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        {BLUEPRINTS.map((b) => (
                            <button
                                key={b.id}
                                type="button"
                                onClick={() => setBlueprintId(b.id)}
                                className={cn(
                                    "rounded-md border p-2.5 text-left transition",
                                    blueprintId === b.id ? "border-emerald-500/60 bg-emerald-500/10" : "hover:bg-muted/50"
                                )}
                            >
                                <p className="text-xs font-medium flex items-center gap-1.5">
                                    <FolderTree className="size-3.5 text-emerald-500"/>
                                    {b.name}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{b.description}</p>
                                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                                    {b.folders.join(" · ")}
                                </p>
                            </button>
                        ))}
                    </div>

                    <div className="space-y-1.5">
                        <p className="text-xs font-medium">Parent folder</p>
                        <select
                            value={parentSlug}
                            onChange={(e) => setParentSlug(e.target.value)}
                            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                        >
                            {folders.map((f) => (
                                <option key={f.slug} value={f.slug}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium">Project folder name</p>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={BLUEPRINTS.find((b) => b.id === blueprintId)?.name.replace(/\s+/g, "") + "Project"}
                            className="h-8 text-xs"
                        />
                    </div>

                    <Button size="sm" className="h-8 gap-1.5 text-xs w-full" disabled={busy || !parentSlug}
                            onClick={() => void scaffold()}>
                        {busy ? <Loader2 className="size-3.5 animate-spin"/> : <Sparkles className="size-3.5"/>}
                        Create scaffold
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
