# Fix: Integration Test Failures

## Root Causes

### Bug 1 — Config 2 (bun bundler + Node.js): ESM syntax error
`dist/files/node/stream.js` uses ES module `import` syntax but is deployed without a `package.json` declaring `"type": "module"`. Node.js Lambda treats it as CommonJS → `SyntaxError: Cannot use import statement outside a module`.

**Fix:** `bun.ts` — write `{ type: "module" }` package.json to `${out}/server/` when `runtime === 'node'` (mirrors what `esb.ts` already does at line 121–124).

---

### Bug 2 — All configs: `getAwsEvent()` returns 500
`@beesolve/lambda-fetch-api` uses an `AsyncLocalStorage` singleton to propagate the AWS event through the handler call chain. But it gets bundled separately into:
- `dist/files/*/stream.js` (by `build.ts`)
- The SvelteKit server bundle `index.js` (by esbuild/Bun)

Two separate module instances → two separate `AsyncLocalStorage` instances → `runWithAwsContext()` writes to one instance, `getAwsEvent()` reads from another → `NotInHandlerContextError` → 500.

**Fix:** Make `@beesolve/lambda-fetch-api` an external (not bundled) import everywhere, and copy the package + its `@beesolve/helpers` dependency to `${out}/server/node_modules/` so Node.js module caching provides a single shared instance.

Changes:
- `build.ts`: add `'@beesolve/lambda-fetch-api'` to the `external` array for the files build
- `esb.ts`: add `'@beesolve/lambda-fetch-api'` to esbuild's `external` array; copy both packages to `${out}/server/node_modules/` using `builder.copy()`
- `bun.ts`: add `/^@beesolve\/lambda-fetch-api(\/.*)?$/.toString()` to the Bun build's `external` array; copy both packages to `${out}/server/node_modules/`

Finding package dirs (used in both adapters):
```typescript
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fetchApiDir = dirname(require.resolve('@beesolve/lambda-fetch-api/package.json'));
const helpersDir  = dirname(require.resolve('@beesolve/helpers/package.json'));
// then: builder.copy(fetchApiDir, `${out}/server/node_modules/@beesolve/lambda-fetch-api`);
// then: builder.copy(helpersDir,  `${out}/server/node_modules/@beesolve/helpers`);
```

@claude I don't like this fix. This is not something which users of this library should do and we want to mimic the sample applciation of real world example setup. can you find different solution?

---

### Bug 3 — Config 3 (bun bundler + Bun runtime): `awslambda is not defined`
`files/bun/stream.ts` calls `asResponseStreamHandler()` which immediately invokes `awslambda.streamifyResponse()` at module initialisation. The `awslambda` global is injected by the Node.js Lambda runtime only; the Bun custom runtime layer (`/opt/runtime.js`) does not provide it. The module fails to load, so every Lambda invocation returns a 500-level error JSON.

**Fix:** Change `files/bun/stream.ts` to use `asHttpV2Handler` (same as `files/bun/handler.ts`), which works with the Bun runtime's request/response model. This makes all basic tests pass. The `large payload (>6 MB)` streaming test will still fail — proper Bun streaming requires `@beesolve/lambda-bun-runtime` to implement the Lambda custom-runtime streaming protocol, which is an upstream change outside this repo.

@claude remove the streaming for bun for now until @beesolve/lambda-bun-runtime implements streaming - maybe put the code aside so we can get to it quickly once there is support?

---

### Bug 4 — Config 3 basic suite: missing routes in streaming example
`examples/streaming/` is deployed as the Config 3 (BunBun) stack. The `basicSuite` tests hit `/api/context`, `/cookies`, and `/redirect`, but the streaming example only has `/` and `/api/{hello,large}`. After fixes 1–3, those three routes return 404 instead of the expected responses.

**Fix:** Add the missing routes (same implementations as `examples/basic/`):
- `examples/streaming/src/routes/api/context/+server.ts`
- `examples/streaming/src/routes/cookies/+page.server.ts`
- `examples/streaming/src/routes/cookies/+page.svelte`
- `examples/streaming/src/routes/redirect/+server.ts`

---

## Files to Modify

| File | Change |
|------|--------|
| `build.ts` | Add `'@beesolve/lambda-fetch-api'` to `external` for files build |
| `esb.ts` | Add `'@beesolve/lambda-fetch-api'` to esbuild `external`; add `createRequire` import; copy two packages to node_modules after build |
| `bun.ts` | Write `package.json` for Node.js runtime; add lambda-fetch-api to Bun build external; add `createRequire` import; copy two packages to node_modules after copy |
| `files/bun/stream.ts` | Replace `asResponseStreamHandler` with `asHttpV2Handler` |
| `examples/streaming/src/routes/api/context/+server.ts` | New file (same as basic) |
| `examples/streaming/src/routes/cookies/+page.server.ts` | New file (same as basic) |
| `examples/streaming/src/routes/cookies/+page.svelte` | New file (same as basic) |
| `examples/streaming/src/routes/redirect/+server.ts` | New file (same as basic) |

After code changes: run `bun run build.ts` to regenerate `dist/` (especially `dist/files/bun/stream.js` and `dist/files/node/stream.js`).

---

## Expected Outcome

| Config | Before | After |
|--------|--------|-------|
| Config 1 (esb + Node) | 6/7 pass | 7/7 pass |
| Config 2 (bun + Node) | 2/7 pass | 7/7 pass |
| Config 3 (bun + Bun) basic | 2/7 pass | 7/7 pass |
| Config 3 streaming >6MB | 0/1 pass | 0/1 pass (needs upstream) |
| **Total** | **10/22** | **21/22** |

The remaining failure (`large payload (>6 MB) is returned without error`) requires `@beesolve/lambda-bun-runtime` to implement the Lambda custom-runtime streaming protocol in its `runtime.js` bootstrap.
