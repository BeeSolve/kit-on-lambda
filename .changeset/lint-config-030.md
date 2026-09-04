---
"kit-on-lambda": patch
---

Upgrade `@beesolve/lint-config` to 0.3.0 and add the newly-required `oxlint-tsgolint` peer dependency, which enables type-aware linting.

Resolve the findings the stricter rules surface in the shipped handler/stream templates and tests:

- Replace `process.env as Record<string, string>` casts with a `definedEnv()` helper that filters out undefined values.
- Use `HttpMethod.ANY` instead of `"ANY" as never` in the CDK tests.
- Drop redundant result-type assertions on the single-arm Bun handler result, and narrow the Node handler's `v1 | v2` result union via small typed helpers.
- Prefix intentional fire-and-forget calls (`mock.module`, `server.stop`) with `void` to satisfy `no-floating-promises`.
