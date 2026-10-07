---
name: sync-package-docs
description: Keep this package's agentic documentation (DOCS.md + docs/how-to/ guides) in sync with the code. Use when the adapter options or the SvelteKit CDK construct API change, a how-to workflow changes, or an example is added/renamed. Internal to the kit-on-lambda repo.
---

## Overview

This is the `kit-on-lambda` binding for the generic `agentic-package-docs` skill. The method, the non-negotiable rules, the DOCS.md / how-to templates, and the sync procedure live in that user-level skill - **read and follow it.** This file only supplies the concrete values for THIS repo. Where they overlap, these repo-specific values win.

## Repo-Specific Bindings

- **Package:** `kit-on-lambda` - a SINGLE published package (not a monorepo), and note the npm name is UNSCOPED (no `@beesolve/` prefix). Docs go at the repo ROOT.
- **Repo / branch:** `https://github.com/BeeSolve/kit-on-lambda`, branch `main`, org casing `BeeSolve`. (The `repository` field uses a `git+ssh://` URL; use the `https://` form for doc links.)
- **Install command:** `npm i` (primary); mention `bun i` as an alternative. `aws-cdk-lib` and `constructs` are peer dependencies; `@beesolve/lambda-fetch-api` is an optional add-on for raw event/context access.
- **Package manager:** bun (`bun.lock`, `bun test`).
- **Public API (verify in source before writing):**
  - `.` -> default adapter (`esb.ts`), default export takes `AdapterOptions`
  - `./bun` -> Bun adapter (`bun.ts`), default export takes `AdapterOptions`
  - `./cdk` -> the `SvelteKit` construct (`cdk.ts`); key props: discriminated `runtime: "node" | "bun"`, `buildDirectory`, `distributionProps` (default behavior is NOT overridable), `basicHttpAuthentication`, `warmer`, `toDefaultOrigin`, `invokeMode`, `lambdaProps`; exposes `distribution` and `handler`.
- **Examples (confirm before linking):** `examples/basic`, `examples/streaming`, `examples/observability` (SvelteKit apps) and `examples/infra/lib/*-stack.ts` (CDK stacks using `new SvelteKit`). These are the Working Examples links.
- **Publish mechanism:** the `files` array in `package.json`. It must include `"dist"`, `"docs/how-to"`, `"DOCS.md"`. There is no `.npmignore`.
- **Keep OUT of the tarball:** `docs/adr/*` and `docs/iam-policy.json`. The `docs/how-to`-only allowlist keeps them out automatically; never add the whole `"docs"` folder. The Further Reading ADR link may point to the GitHub `docs/adr` path (GitHub only).

## Verification Gates (this repo)

```bash
bun run check        # oxfmt --check && oxlint . (run `bun run fmt` first if markdown tables need realignment)
bun test

# tarball check
npm pack --dry-run   # or: bun pm pack --dry-run
```

Note: there is NO `typecheck` script in this repo. Gates are `check` and `test`. The pack output must include `DOCS.md` and `docs/how-to/*.md` and must NOT include `docs/adr/*` or `docs/iam-policy.json`.

## Release Note (uses changesets)

This repo DOES use changesets (`.changeset/config.json`, `version`/`release` scripts). A docs-only change is a `patch`: create `.changeset/<slug>.md` with frontmatter `"kit-on-lambda": patch` and a short summary.

## Audit

```bash
grep -c "Coming soon" DOCS.md                    # expect 0
grep -c "Keywords:" DOCS.md                       # expect 1
grep -c "matches the installed version" DOCS.md   # expect 1
ls docs/how-to/                                    # guides linked from DOCS.md must exist here
```

## Scope Note

Internal tooling for `kit-on-lambda`. Not published to npm, not referenced from the package README.
