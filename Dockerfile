# syntax=docker/dockerfile:1
#
# Praxis — Bun-first production image.
#
# Why Bun:
#   - bun install is the package manager (bun.lock is the single lockfile)
#   - the standalone Next server runs under the Bun runtime (`bun server.js`),
#     which is already what `npm start` / `bun run start` did in 0.4
#
# Why debian-based (oven/bun:1-debian) and not the slim alpine variant:
#   - Python wheels for numpy/scipy/pandas/matplotlib are manylinux-only;
#     musl builds are slow to install and often missing.
FROM oven/bun:1-debian AS base
WORKDIR /app

# ── Python + scientific stack ────────────────────────────────────────────────
# bookworm pip is PEP 668 "externally-managed"; --break-system-packages is
# required for a plain container install (the 0.4 Dockerfile silently broke
# on this for node:20-slim/bookworm images).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --no-cache-dir --break-system-packages \
    matplotlib numpy scipy pandas \
    mpld3 \
    openpyxl \
    pyarrow

# ── Node deps (bun) ──────────────────────────────────────────────────────────
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Source + build ───────────────────────────────────────────────────────────
COPY . .
RUN bun run build

EXPOSE 3000
CMD ["bun", ".next/standalone/server.js"]
