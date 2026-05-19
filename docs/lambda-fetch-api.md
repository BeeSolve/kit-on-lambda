# Replace inlined node utilities with `@beesolve/lambda-fetch-api` — Plan

## Context

`kit-on-lambda` ships three runtime files for the **Node.js Lambda path** under
`files/node/`.  Those files contain low-level AWS↔Fetch-API conversion utilities
(`awsRequest`, `awsResponseHeaders`, `awsResponseBody`) that were hand-rolled from the
Nitro project.  The same utilities now exist as a published, tested, and maintained
package: `@beesolve/lambda-fetch-api` (v0.1.8).

This plan describes how to replace the inlined code with the package, what diverges
between the two, how the public `runtime` export of `kit-on-lambda` is affected, and
the ordered task list for an agent to execute.

---

## Research: `@beesolve/lambda-fetch-api` API surface

### Handler wrappers (high-level)

| Export | Description |
|---|---|
| `asHttpV1Handler(fetch)` | Wraps `(req) => Response` as an API Gateway v1 (REST) Lambda handler |
| `asHttpV2Handler(fetch)` | Wraps `(req) => Response` as an API Gateway v2 / Function URL Lambda handler |
| `asResponseStreamHandler(fetch)` | Wraps `(req) => Response` as a response-streaming handler via `awslambda.streamifyResponse` |
| `asLambdaAuthorizedHttpV2Handler(fetch)` | v2 handler with Lambda authorizer context |
| `asCustomAuthorizedHttpV1Handler(fetch)` | v1 handler with custom authorizer context |

Every wrapper internally calls `runWithAwsContext(event, context, fn)` which stores the
event and context in an `AsyncLocalStorage` for the duration of the invocation.

### Context accessors (low-level, callable from anywhere inside an invocation)

| Export | Description |
|---|---|
| `getAwsEvent()` | Returns the raw `APIGatewayProxyEvent \| APIGatewayProxyEventV2` |
| `getAwsV1Event()` | Typed getter; throws if current event is not v1 |
| `getAwsV2Event()` | Typed getter; throws if current event is not v2 |
| `getAwsContext()` | Returns the Lambda `Context` |
| `runWithAwsContext(event, context, fn)` | Runs `fn` inside the AsyncLocalStorage scope |

### Primitives (also exported)

`awsRequest(event)`, `awsResponseHeaders(response, version)`, `awsResponseBody(response)`,
`isAPIGatewayProxyEvent(event)`, `isAPIGatewayProxyEventV2(event)`.

---

## Research: Current `files/node/` code

### `files/node/util.ts`

Implements the same `awsRequest`, `awsResponseHeaders`, `awsResponseBody` utilities.

**Key differences from `lambda-fetch-api`:**

1. **`awsRequest` appends `aws-event` and `aws-context` request headers.**  The raw
   event is JSON-serialised into `aws-event`; the context (plus a `serializedAtTimeInMillis`
   timestamp) is serialised into `aws-context`.  `lambda-fetch-api` does **not** do this
   — it uses `AsyncLocalStorage` instead.

2. **`awsResponseHeaders` does not delete `set-cookie` from headers.**  `lambda-fetch-api`
   explicitly does `delete headers["set-cookie"]` when splitting cookies into
   `multiValueHeaders` (v1) or `cookies` (v2), preventing the header from appearing in
   both places.  This is a bug fix present in the package but not in the inlined code.

3. **`isTextType` regex lacks a word boundary.**  Inlined: `/(javascript|json|xml)/i`.
   Package: `/(javascript|json|xml)\b/i`.  The boundary prevents false positives such as
   `application/javascript-esm` being detected as text when it shouldn't be.

4. **Headers object initialisation.**  Inlined uses `Object.create(null)`.  Package uses
   `const headers: Record<string, string> = {}`.  Functionally equivalent for this usage.

5. **`awsRequest` signature.**  Inlined: `awsRequest(event, context)`.  Package:
   `awsRequest(event)` — context is not needed because it flows through `AsyncLocalStorage`.

### `files/node/handler.ts`

Handles **both** `APIGatewayProxyEvent` (v1) and `APIGatewayProxyEventV2` (v2) in a
single exported `handler` function.  It calls `awsRequest(event, context)` and then
calls `isAPIGatewayProxyEvent(event)` to choose between `"v1"` and `"v2"` for the
response headers.

`lambda-fetch-api` has separate `asHttpV1Handler` / `asHttpV2Handler` but does not
expose a single combined v1+v2 handler.  The combined behaviour must be replicated using
the lower-level primitives (`awsRequest`, `runWithAwsContext`, `awsResponseHeaders`).

### `files/node/stream.ts`

Handles streaming response via `awslambda.streamifyResponse`.  It is effectively the
same code already present in `asResponseStreamHandler` in `lambda-fetch-api`.

---

## Note: `kit-on-lambda/runtime` removed

`kit-on-lambda/runtime` no longer exists. All AWS helpers are imported directly from
`@beesolve/lambda-fetch-api`:

```ts
import { getAwsEvent, getAwsContext, isAPIGatewayProxyEvent } from '@beesolve/lambda-fetch-api'
```

---

## Required changes

### 1. Add `@beesolve/lambda-fetch-api` as a dependency

**File:** `package.json`

```diff
 "dependencies": {
   "@beesolve/lambda-bun-runtime": "^1.14.0",
+  "@beesolve/lambda-fetch-api": "^0.1.8",
   "@beesolve/lambda-keep-active": "^1.3.0"
 },
```

Note: `@beesolve/lambda-fetch-api` is not a peer dep because it ships into the pre-built
handler files (see build step below).

---

### 2. Rewrite `files/node/handler.ts`

The combined v1+v2 handler cannot use `asHttpV1Handler` or `asHttpV2Handler` directly
(they each lock in the version).  Use the primitives instead:

```typescript
import { createReadableStream } from "@sveltejs/kit/node";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import {
  awsRequest,
  awsResponseBody,
  awsResponseHeaders,
  isAPIGatewayProxyEvent,
  runWithAwsContext,
} from "@beesolve/lambda-fetch-api";
import { manifest } from "MANIFEST";
import process from "node:process";
import { Server } from "SERVER";

const server = new Server(manifest);

await server.init({
  env: process.env as Record<string, string>,
  read: createReadableStream,
});

export async function handler(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResult | APIGatewayProxyResultV2> {
  const request = awsRequest(event);

  return runWithAwsContext(event, context, async () => {
    const response = await server.respond(request, {
      getClientAddress() {
        return request.headers.get("x-forwarded-for") ?? "";
      },
    });

    return {
      statusCode: response.status,
      ...awsResponseHeaders(response, isAPIGatewayProxyEvent(event) ? "v1" : "v2"),
      ...(await awsResponseBody(response)),
    };
  });
}
```

**File:** `files/node/handler.ts`

---

### 3. Rewrite `files/node/stream.ts`

`asResponseStreamHandler` from `lambda-fetch-api` already implements the full streaming
logic (including the `responseStream.write("")` workaround and the `streamToNodeStream`
loop).  The only SvelteKit-specific part is the `Server.respond` call:

```typescript
import { createReadableStream } from "@sveltejs/kit/node";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { asResponseStreamHandler } from "@beesolve/lambda-fetch-api";
import { manifest } from "MANIFEST";
import process from "node:process";
import { Server } from "SERVER";

const server = new Server(manifest);
await server.init({
  env: process.env as Record<string, string>,
  read: createReadableStream,
});

export const handler = asResponseStreamHandler(async (request: Request) => {
  return server.respond(request, {
    getClientAddress() {
      return request.headers.get("x-forwarded-for") ?? "";
    },
  });
});
```

**File:** `files/node/stream.ts`

---

### 4. Delete `files/node/util.ts`

All utilities it contained (`awsRequest`, `awsResponseHeaders`, `awsResponseBody`) are
now sourced from `@beesolve/lambda-fetch-api`.  The file should be removed.

**File:** `files/node/util.ts` — DELETE

---

### 5. Update `runtime.ts` — migrate away from header-based approach

The `./runtime` export is a public API.  The migration must:

1. **Re-export the type guards** directly from `@beesolve/lambda-fetch-api` (they are
   identical).
2. **Deprecate and remove `toAwsEvent` / `toAwsContext`.**  These worked by reading
   serialised headers injected by the old `awsRequest`.  After the migration there are
   no such headers.
3. **Add a migration note** pointing users to `getAwsEvent()` / `getAwsContext()` from
   `@beesolve/lambda-fetch-api`.

New `runtime.ts` (breaking change for users of `toAwsEvent` / `toAwsContext`):

```typescript
export {
  isAPIGatewayProxyEvent,
  isAPIGatewayProxyEventV2,
  getAwsEvent,
  getAwsContext,
  getAwsV1Event,
  getAwsV2Event,
} from "@beesolve/lambda-fetch-api";
```

Or, if a soft deprecation is preferred, keep thin wrappers that throw with a helpful
message:

```typescript
export {
  isAPIGatewayProxyEvent,
  isAPIGatewayProxyEventV2,
} from "@beesolve/lambda-fetch-api";

/** @deprecated Use getAwsEvent() from @beesolve/lambda-fetch-api */
export function toAwsEvent(_request: Request): never {
  throw new Error(
    "toAwsEvent is removed. Use getAwsEvent() from @beesolve/lambda-fetch-api instead.",
  );
}

/** @deprecated Use getAwsContext() from @beesolve/lambda-fetch-api */
export function toAwsContext(_request: Request): never {
  throw new Error(
    "toAwsContext is removed. Use getAwsContext() from @beesolve/lambda-fetch-api instead.",
  );
}
```

**File:** `runtime.ts`

---

### 6. Update `build.ts` — add `@beesolve/lambda-fetch-api` to externals

The handler files are built by `build.ts` with `external: ["SERVER", "MANIFEST"]`,
meaning everything else (including `lambda-fetch-api`) is **bundled in**.  This keeps
the Lambda deployment self-contained and is the correct approach.

However, `@beesolve/lambda-fetch-api` depends on `@beesolve/helpers` at runtime.
Bundling the handler files will inline both packages automatically — no change to
`build.ts` is needed as long as `@beesolve/lambda-fetch-api` is installed as a regular
dependency (not peer dep).

Verify after adding the dependency that `bun run build.ts` succeeds and the `dist/files`
output is self-contained (no `@beesolve/` imports in the bundle).

**File:** `build.ts` — likely no change needed; verify only.

---

## Breaking change for kit-on-lambda users

| Old API | New API (`@beesolve/lambda-fetch-api`) |
|---|---|
| `toAwsEvent(request)` | `getAwsEvent()` |
| `toAwsContext(request)` | `getAwsContext()` |
| `isAPIGatewayProxyEvent(event)` | `isAPIGatewayProxyEvent(event)` |
| `isAPIGatewayProxyEventV2(event)` | `isAPIGatewayProxyEventV2(event)` |

Users of the old header-based getters must:
1. Add `@beesolve/lambda-fetch-api` to their project.
2. Replace all imports from `kit-on-lambda/runtime` with
   `import { ... } from '@beesolve/lambda-fetch-api'`.
3. Remove the `request` argument from `getAwsEvent()`/`getAwsContext()` — they take no arguments.

The `getRemainingTimeInMillis` reconstruction logic in `toAwsContext` was also subtly
wrong (the serialised timestamp drifted slightly).  `getAwsContext()` returns the
original `Context` object reference unchanged, which is more accurate.

---

## Bug fixes gained for free

| Bug | Old behaviour | New behaviour |
|---|---|---|
| `set-cookie` duplicated in v1 `multiValueHeaders` | Header also appeared in `headers` map | `delete headers["set-cookie"]` removes it |
| `isTextType` false positives | `/(javascript\|json\|xml)/` matched substrings | `/(javascript\|json\|xml)\b/` adds word boundary |

---

## Task list

```
[ ] 1. Add @beesolve/lambda-fetch-api ^0.1.8 to dependencies in package.json
[ ] 2. Rewrite files/node/handler.ts using awsRequest, runWithAwsContext,
        awsResponseHeaders, awsResponseBody, isAPIGatewayProxyEvent from lambda-fetch-api
[ ] 3. Rewrite files/node/stream.ts using asResponseStreamHandler from lambda-fetch-api
[ ] 4. Delete files/node/util.ts
[ ] 5. Update runtime.ts: re-export isAPIGatewayProxyEvent and isAPIGatewayProxyEventV2
        from lambda-fetch-api; remove or shim toAwsEvent / toAwsContext with deprecation errors
[ ] 6. Run bun run build.ts and verify dist/files bundles are self-contained
[ ] 7. Add migration note to CHANGELOG / README: toAwsEvent / toAwsContext are removed,
        users must switch to getAwsEvent() / getAwsContext() from @beesolve/lambda-fetch-api
[ ] 8. (Optional) Add unit tests for the node handler files using the test helpers
        already present in lambda-fetch-api (makeV1Event / makeV2Event patterns)
```

---

## Files affected

| File | Change |
|---|---|
| `package.json` | Add `@beesolve/lambda-fetch-api` as dependency |
| `files/node/handler.ts` | Rewrite — remove util.ts imports, use lambda-fetch-api primitives |
| `files/node/stream.ts` | Rewrite — replace body with `asResponseStreamHandler` |
| `files/node/util.ts` | **Delete** |
| `runtime.ts` | Re-export from lambda-fetch-api; remove/shim `toAwsEvent` / `toAwsContext` |
| `build.ts` | Verify only — no code change expected |
