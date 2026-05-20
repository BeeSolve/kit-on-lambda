# ADR-001: Adopt `@beesolve/lambda-fetch-api` for AWS↔Fetch-API conversion

**Date:** 2025  
**Status:** Accepted

## Context

`files/node/` contained hand-rolled AWS↔Fetch-API utilities (`awsRequest`, `awsResponseHeaders`, `awsResponseBody`) ported from Nitro. These had several bugs:

- `set-cookie` appeared in both `headers` and `multiValueHeaders`/`cookies` on v1 responses
- `isTextType` regex lacked a word boundary, causing false positives (e.g. `application/javascript-esm`)
- AWS event/context were passed to SvelteKit routes via injected request headers (`aws-event`, `aws-context`), making them unavailable outside the request object

The same utilities now exist as a maintained package: `@beesolve/lambda-fetch-api`.

## Decision

Replace all inlined node utilities with `@beesolve/lambda-fetch-api`. Key changes:

- `files/node/handler.ts`: use `awsRequest`, `runWithAwsContext`, `awsResponseHeaders`, `awsResponseBody`, `isAPIGatewayProxyEvent` from the package
- `files/node/stream.ts`: replace the streaming loop with `asResponseStreamHandler`
- `files/bun/handler.ts`: use `asHttpV2Handler`
- `files/node/util.ts`: deleted
- `runtime.ts`: re-export `getAwsEvent`, `getAwsContext`, `getAwsV1Event`, `getAwsV2Event`, `isAPIGatewayProxyEvent`, `isAPIGatewayProxyEventV2` from the package; `toAwsEvent`/`toAwsContext` throw with a migration message

AWS event/context are now propagated via `AsyncLocalStorage` (inside `runWithAwsContext`), accessible anywhere during an invocation via `getAwsEvent()` / `getAwsContext()`.

`@beesolve/lambda-fetch-api` is kept external in the bundler builds (not inlined into handler or server bundles) so Node.js module caching ensures a single `AsyncLocalStorage` instance is shared across both.

## Consequences

- **Breaking:** `toAwsEvent(request)` and `toAwsContext(request)` are removed. Users must add `@beesolve/lambda-fetch-api` and switch to `getAwsEvent()` / `getAwsContext()` (no `request` argument).
- Bug fixes (set-cookie duplication, isTextType false positives) are gained for free.
