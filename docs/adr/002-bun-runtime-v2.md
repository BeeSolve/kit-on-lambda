# ADR-002: Upgrade `@beesolve/lambda-bun-runtime` to v2

**Date:** 2025  
**Status:** Accepted

## Context

`@beesolve/lambda-bun-runtime` v1 shipped a Lambda layer that acted as a Fetch API bridge: it started a `Bun.serve()` HTTP server inside the Lambda environment, converted each invocation's event into a `Request`, and expected handlers to export `export default { fetch }`.

v2 replaces this with a minimal ~80-line Lambda Runtime API loop that calls handlers as `handler(event, context)` directly — the same convention as Node.js Lambda. Fetch-API wrapping is delegated to `@beesolve/lambda-fetch-api` (see ADR-001). The version scheme encodes the bundled Bun version: `2.<bun_major_minor>.<bun_patch>` (e.g. `2.103.14` = Bun 1.3.14).

## Decision

Upgrade from `^1.8.0` to `^2.103.14`. Update `files/bun/handler.ts` to export a named `handler` using `asHttpV2Handler` instead of `export default { fetch }`.

Bun streaming (`asResponseStreamHandler`) is deferred: the Bun Lambda layer does not yet provide the `awslambda` global required by `streamifyResponse`. The streaming implementation is preserved in `files/bun/stream.future.ts`; `files/bun/stream.ts` falls back to `asHttpV2Handler` until upstream support lands in `@beesolve/lambda-bun-runtime`.

CDK constructs (`BunFunctionProps`, `BunLambdaLayer`) are structurally unchanged between v1 and v2 — no CDK-side changes needed.

## Consequences

- **Breaking for existing deployments:** the Bun Lambda function's `_HANDLER` env var changes from the fetch-based export to `handler.handler`, causing CloudFormation to replace the Lambda function resource on the next `cdk deploy`.
- The streaming large-payload test (`> 6 MB`) remains skipped until `@beesolve/lambda-bun-runtime` implements the streaming protocol.
