# Upgrade `@beesolve/lambda-bun-runtime` to v2 — Plan

## Context

`kit-on-lambda` currently declares `"@beesolve/lambda-bun-runtime": "^1.8.0"` in
`package.json`. The package's latest published version on npm is **2.103.14**, which
represents a major architectural change from the 1.x series.

The version scheme encodes the bundled Bun version: `2.<bun_major_minor>.<bun_patch>`,
so `2.103.14` = package major v2, Bun v1.3.14 (1×100+3 = 103).

> **Note on the local repo**: The `lambda-bun-runtime` repository in this workspace
> has its `package.json` version set to `0.0.0` (managed by projen) and its CHANGELOG
> stops at 1.14.0.  The published npm package at 2.103.14 was produced after that and
> contains the rewritten v2 runtime described here.

---

## Research: What changed from v1 → v2

### v1.x — Fetch API bridge runtime

The v1 Lambda layer shipped a custom Bun runtime that acted as an HTTP bridge:
- It started a `Bun.serve()` HTTP server inside the Lambda execution environment.
- On each invocation it converted the AWS Lambda event into a `Request` object and
  forwarded it to a handler that exported `export default { fetch }`.
- The handler received a `Request` and returned a `Response`; the runtime translated
  the `Response` back into a Lambda result.

This is why `files/bun/handler.ts` currently exports:

```typescript
export default {
  fetch: async (request: Request): Promise<Response> => { … }
};
```

### v2.x — Minimal Lambda Runtime API loop (BREAKING)

The v2 layer replaces the Fetch API bridge with a **minimal 80-line runtime** that
implements the AWS Lambda Runtime API loop directly:

1. Poll `GET /runtime/invocation/next` for an invocation.
2. Build a `context` object from environment variables and response headers.
3. Import the handler module: `_HANDLER` env var is parsed as `filename.exportName`.
4. Call `handler(event, context)` — raw AWS event, no conversion.
5. Post the serialised return value to `POST /runtime/invocation/{id}/response`.

**The runtime no longer converts events to `Request` objects.** Handlers must now
follow the Node.js Lambda convention: `export const handler = async (event, context) => { … }`.

Fetch API wrapping (event → Request → Response → result) is explicitly delegated to the
companion package `@beesolve/lambda-fetch-api`.

### CDK constructs — unchanged shape

`BunFunctionProps` and `BunLambdaLayer` are structurally identical between v1 and v2.
The CDK-side code in `cdk.ts` requires **no changes** for the upgrade.

| Prop | v1 | v2 |
|---|---|---|
| `entrypoint` | `.js` or `.ts` | `.js` or `.ts` (unchanged) |
| `exportName` | default `"handler"` | default `"handler"` (unchanged) |
| `bunLayer` | required | required (unchanged) |
| Lambda runtime | `PROVIDED_AL2023` | `PROVIDED_AL2023` (unchanged since v1.10.0) |

---

## Impact on `kit-on-lambda`

### `files/bun/handler.ts` — must be rewritten (BREAKING)

This is the only file that needs code changes.  The current implementation:

```typescript
// CURRENT — works with v1 runtime only
export default {
  fetch: async (request: Request): Promise<Response> => {
    return await server.respond(request, { … });
  },
};
```

With the v2 runtime the `fetch` export is **never called**.  The runtime resolves the
handler string from the `_HANDLER` env var (e.g., `handler.handler`) and imports the
`handler` named export.

The new implementation must export `handler` using `asHttpV2Handler` (or
`asResponseStreamHandler` if streaming is desired) from `@beesolve/lambda-fetch-api`:

```typescript
// NEW — works with v2 runtime
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

Note: `export default { fetch }` can be removed entirely (the v2 runtime does not use
it), or retained as a no-op for documentation purposes.

### `cdk.ts` — no code changes needed

The `BunFunction` constructor call and the `Omit<BunFunctionProps, "entrypoint">` type
annotation are fully compatible with v2.  The entrypoint continues to be passed as a
pre-built `.js` file.

The only impact is cosmetic: `BunFunction` now auto-derives the handler string as
`handler.handler` from `${buildDirectory}/server/handler.js`, which matches the
`export const handler` exported by the new `files/bun/handler.ts`.

### `runtime.ts` — no changes needed

The `toAwsEvent` / `toAwsContext` header-based utilities are specific to the Node.js
handler path; they are not used by the Bun handler at all.

---

## Dependency on `@beesolve/lambda-fetch-api`

The new Bun handler requires `asHttpV2Handler` from `@beesolve/lambda-fetch-api`.  This
dependency is being introduced separately as part of the
[lambda-fetch-api.md](./lambda-fetch-api.md) plan which already adds the package to
`package.json`.  If that plan is executed first, the bun handler can simply import from
the already-declared dependency.

If this upgrade is done in isolation, add the dependency explicitly:

```diff
 "dependencies": {
   "@beesolve/lambda-bun-runtime": "^2.103.14",
+  "@beesolve/lambda-fetch-api": "^0.1.8",
   "@beesolve/lambda-keep-active": "^1.3.0"
 },
```

---

## Build pipeline changes

`build.ts` currently builds `files/bun/handler.ts` with `external: ["SERVER", "MANIFEST"]`.
After the rewrite the handler will also import from `@beesolve/lambda-fetch-api`.  That
package will be **bundled** into the output (it is not in the external list), which is
correct — the Bun Lambda deployment must be self-contained.

Verify that `@beesolve/helpers` (a transitive dep of `lambda-fetch-api`) also bundles
cleanly into the Bun target output.

---

## Breaking changes for `kit-on-lambda` users

| Area | Change | Action for users |
|---|---|---|
| Bun Lambda runtime handler | Must export `handler`, not `fetch` | Kit handles this internally — transparent to users |
| `runtime: "bun"` invoke mode | Bun still uses `BUFFERED`; no change | None |
| Infrastructure | Lambda function resource replaced on deploy due to `PROVIDED_AL2023` (since v1.10.0) | Users must be aware of resource replacement on first deploy after upgrade |

---

## Task list

```
[ ] 1. Bump @beesolve/lambda-bun-runtime in package.json from ^1.8.0 to ^2.103.14
[ ] 2. Add @beesolve/lambda-fetch-api as dependency (^0.1.8) if not already present
        from the lambda-fetch-api plan
[ ] 3. Rewrite files/bun/handler.ts:
        - Remove export default { fetch }
        - Add: export const handler = asHttpV2Handler(async (request) => server.respond(...))
        - Import asHttpV2Handler from @beesolve/lambda-fetch-api
[ ] 4. Run bun run build.ts and verify dist/files/bun/handler.js bundles correctly
        (no @beesolve/* imports remain in the bundle)
[ ] 5. Add release note: Bun Lambda handler convention changed from fetch export to
        handler export; existing deployments will have their Bun Lambda function replaced
        on next CDK deploy (resource replacement due to handler string change)
```

---

## Files affected

| File | Change |
|---|---|
| `package.json` | Bump `@beesolve/lambda-bun-runtime` to `^2.103.14`; add `@beesolve/lambda-fetch-api` if not already present |
| `files/bun/handler.ts` | Rewrite — replace `export default { fetch }` with `export const handler = asHttpV2Handler(...)` |
| `cdk.ts` | No changes needed |
| `runtime.ts` | No changes needed |
| `build.ts` | Verify only — no code change expected |
