---
"kit-on-lambda": minor
---

Upgrade toolchain dependencies: TypeScript 6 → 7, `@changesets/cli` 2 → 3, and bump AWS CDK, esbuild, oxlint/oxfmt, and `@beesolve/*` runtime packages.

TypeScript 7 is the native compiler previously distributed as `@typescript/native-preview` (binary `tsgo`); it now ships as `tsc`. The build's declaration step (`build.ts`) was updated from `tsgo` to `tsc` accordingly, and `@typescript/native-preview` is no longer needed. The release workflow was also updated for Changesets CLI v3 (`changeset tag` → `changeset git-tag`, `version` → `version-script` action input).
