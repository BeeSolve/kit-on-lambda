# Checklist: Replace inlined node utilities with `@beesolve/lambda-fetch-api`

> **Plan reference:** [lambda-fetch-api.md](./lambda-fetch-api.md)
> **Must be implemented BEFORE** [bun-runtime-upgrade-checklist.md](./bun-runtime-upgrade-checklist.md) — the bun upgrade depends on `@beesolve/lambda-fetch-api` being added here.
> **Status: COMPLETE**

---

## Step 1 — Add dependency to `package.json` ✅

**File:** `package.json`

> **Note:** The plan specified `^0.1.8` but that version still uses the old header-based approach and does not export `runWithAwsContext`, `getAwsEvent`, etc. The correct version is `^1.0.0`.

```diff
 "dependencies": {
   "@beesolve/lambda-bun-runtime": "^1.8.0",
+  "@beesolve/lambda-fetch-api": "^1.0.0",
   "@beesolve/lambda-keep-active": "^1.3.0"
 },
```

- [x] `@beesolve/lambda-fetch-api` appears in `package.json` dependencies
- [x] `bun.lock` is updated

---

## Step 2 — Rewrite `files/node/handler.ts` ✅

**File:** `files/node/handler.ts`

Replace the entire file. Key changes:
- Remove import of `./util.js` and `runtime.js`
- Import `awsRequest`, `awsResponseBody`, `awsResponseHeaders`, `isAPIGatewayProxyEvent`, `runWithAwsContext` from `@beesolve/lambda-fetch-api`
- Wrap the response logic in `runWithAwsContext` so AWS event/context are available via `AsyncLocalStorage`
- Drop the `context` argument from `awsRequest` (new signature: `awsRequest(event)` only)

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
      ...awsResponseHeaders(
        response,
        isAPIGatewayProxyEvent(event) ? "v1" : "v2",
      ),
      ...(await awsResponseBody(response)),
    };
  });
}
```

- [x] File no longer imports from `./util.js` or `runtime.js`
- [x] `runWithAwsContext` wraps the response logic
- [x] `awsRequest(event)` — no `context` argument

---

## Step 3 — Rewrite `files/node/stream.ts` ✅

**File:** `files/node/stream.ts`

Replace the entire file. The streaming logic (including the `responseStream.write("")` workaround and the `streamToNodeStream` loop) is fully handled inside `asResponseStreamHandler`. Only the SvelteKit `server.respond` call is needed here.

```typescript
import { asResponseStreamHandler } from "@beesolve/lambda-fetch-api";
import { createReadableStream } from "@sveltejs/kit/node";
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

- [x] File no longer imports from `./util.js`
- [x] The local `streamToNodeStream` function is removed
- [x] `awslambda.streamifyResponse` is gone — `asResponseStreamHandler` handles it

---

## Step 4 — Delete `files/node/util.ts` ✅

- [x] `files/node/util.ts` no longer exists

---

## Step 5 — Rewrite `runtime.ts` ✅

**File:** `runtime.ts`

This is the public `./runtime` export consumed by SvelteKit apps. The old `toAwsEvent` / `toAwsContext` worked by reading `aws-event` / `aws-context` request headers injected by the old `awsRequest`. Those headers no longer exist after this migration.

```typescript
export {
  isAPIGatewayProxyEvent,
  isAPIGatewayProxyEventV2,
  getAwsEvent,
  getAwsContext,
  getAwsV1Event,
  getAwsV2Event,
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

- [x] `isAPIGatewayProxyEvent` and `isAPIGatewayProxyEventV2` are re-exported from `@beesolve/lambda-fetch-api`
- [x] `getAwsEvent`, `getAwsContext`, `getAwsV1Event`, `getAwsV2Event` are re-exported from `@beesolve/lambda-fetch-api`
- [x] `toAwsEvent` and `toAwsContext` throw with a helpful migration message
- [x] The old header-reading implementation (`request.headers.get("aws-event")`) is gone
- [x] The custom error classes `MissingAwsEventHeaderError` / `MissingAwsContextHeaderError` are removed

---

## Step 6 — Verify `build.ts` (no code changes expected) ✅

- [x] `bun run build.ts` exits with no errors
- [x] `grep -r "@beesolve" dist/files/` returns only inlined source-path comments, no live imports

---

## Side effects resolved during implementation

The TypeScript 6 upgrade (done concurrently) exposed two issues resolved as part of this work:

- **`tsconfig.json`**: `baseUrl: "."` removed (deprecated in TS6). It was only needed for the old bare import `"runtime.js"` in `files/node/handler.ts`, which is gone after this migration.
- **`cdk.ts` line 46**: `import { assertUnreachable } from "util.js"` → `"./util.js"` (bare import no longer resolves without `baseUrl`).

---

## Migration note for users

Users who imported `toAwsEvent` or `toAwsContext` from `kit-on-lambda/runtime` must:

1. Add `@beesolve/lambda-fetch-api` to their project.
2. Replace `import { toAwsEvent } from 'kit-on-lambda/runtime'` with `import { getAwsEvent } from '@beesolve/lambda-fetch-api'`.
3. Remove the `request` argument — `getAwsEvent()` takes no arguments.
4. Same for `toAwsContext` → `getAwsContext()`.

The type guards `isAPIGatewayProxyEvent` / `isAPIGatewayProxyEventV2` are still importable from `kit-on-lambda/runtime` unchanged.
