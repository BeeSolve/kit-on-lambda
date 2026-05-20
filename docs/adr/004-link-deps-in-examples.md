# ADR-004: Use `link:` (not `file:`) for local package dependencies in examples

**Date:** 2025  
**Status:** Accepted

## Context

`examples/` apps need to import the local `kit-on-lambda` package. The naive `"kit-on-lambda": "file:../.."` has two fatal flaws with Bun:

1. **Infinite install loop** — Bun traverses the entire target directory, recurses into nested `package.json` files, and loops forever.
2. **Stale `dist/`** — Bun copies the directory at install time; since CI builds the package *after* installing deps, `dist/` is absent when the copy is made.

## Decision

Use name-based `link:` (`"kit-on-lambda": "link:kit-on-lambda"`) combined with `bun link` registered at the repo root. Bun creates a proper relative symlink to the live repo root rather than copying. Since the symlink is live, `dist/` is present as soon as the build step runs.

CI workflow registers the package before installing examples:

```
bun install --frozen-lockfile          # root
bun link                               # register globally
bun install --frozen-lockfile --cwd examples/basic
bun install --frozen-lockfile --cwd examples/streaming
bun install --frozen-lockfile --cwd examples/infra
bun run prepublishOnly                 # build dist/
```

Each example maintains its own `bun.lock` (trade-off vs. a workspace root).

## Consequences

- Symlink resolves correctly through Node.js, Vite, CDK, and esbuild — no resolution failures.
- Lockfiles in `examples/` must be regenerated after structural changes with `bun install --cwd examples/<name>`.
