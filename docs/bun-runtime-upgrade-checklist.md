# Checklist: Upgrade `@beesolve/lambda-bun-runtime` to v2

> **Plan reference:** [bun-runtime-upgrade.md](./bun-runtime-upgrade.md)
> **Depends on:** [lambda-fetch-api-checklist.md](./lambda-fetch-api-checklist.md) must be completed first — it adds `@beesolve/lambda-fetch-api` to `package.json`, which the new Bun handler imports.
> **Status: COMPLETE**

---

## Step 1 — Bump `@beesolve/lambda-bun-runtime` in `package.json` ✅

**File:** `package.json`

> **Note:** The lambda-fetch-api checklist installed `@beesolve/lambda-fetch-api` at `^1.0.0` (not `^0.1.8` as the plan stated — v0.1.8 lacks the AsyncLocalStorage API). The diff below reflects the actual final state.

```diff
 "dependencies": {
-  "@beesolve/lambda-bun-runtime": "^1.8.0",
+  "@beesolve/lambda-bun-runtime": "^2.103.14",
   "@beesolve/lambda-fetch-api": "^1.0.0",
   "@beesolve/lambda-keep-active": "^1.3.0"
 },
```

- [x] `@beesolve/lambda-bun-runtime` is `^2.103.14` in `package.json`
- [x] `@beesolve/lambda-fetch-api` is `^1.0.0` in `package.json`
- [x] `bun.lock` is updated

---

## Step 2 — Rewrite `files/bun/handler.ts` ✅

**File:** `files/bun/handler.ts`

The v1 runtime called the `fetch` function on `export default { fetch }`. The v2 runtime no longer converts events to `Request` objects. Instead, it reads the `_HANDLER` env var (e.g., `handler.handler`), imports that named export, and calls `handler(event, context)` directly.

The `export default { fetch }` export is **never called by the v2 runtime** — it must be replaced with a named `handler` export that uses `asHttpV2Handler` from `@beesolve/lambda-fetch-api` to do the event → Request conversion.

```typescript
import { asHttpV2Handler } from "@beesolve/lambda-fetch-api";
import { createReadableStream } from "@sveltejs/kit/node";
import { manifest } from "MANIFEST";
import process from "node:process";
import { Server } from "SERVER";

const server = new Server(manifest);

await server.init({
  env: process.env as Record<string, string>,
  read: createReadableStream,
});

export const handler = asHttpV2Handler(async (request: Request) => {
  return server.respond(request, {
    getClientAddress() {
      return request.headers.get("x-forwarded-for") ?? "";
    },
  });
});
```

- [x] `export default { fetch }` is removed
- [x] `export const handler = asHttpV2Handler(...)` is present
- [x] `asHttpV2Handler` is imported from `@beesolve/lambda-fetch-api`
- [x] `SERVER` and `MANIFEST` are still imported as virtual modules (unchanged)

---

## Step 3 — Verify `build.ts` and bundle output (no code changes expected) ✅

- [x] `bun run build.ts` exits with no errors
- [x] `grep -r "@beesolve" dist/files/bun/` returns only inlined source-path comments, no live imports

---

## Files NOT changed

| File | Reason |
|---|---|
| `cdk.ts` | `BunFunctionProps` and `BunLambdaLayer` shapes are identical in v1 and v2 |
| `runtime.ts` | Header-based utilities are Node.js path only; not used by Bun handler |
| `build.ts` | Existing externals and bundling strategy are correct as-is |

---

## Deployment note for users

On the first CDK deploy after this upgrade, the Bun Lambda function's handler string changes from the old `fetch`-based export to `handler.handler`. This causes **resource replacement** of the Lambda function (CloudFormation will delete and recreate it). Users should be aware of this before deploying.
