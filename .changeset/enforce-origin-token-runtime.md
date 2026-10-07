---
"kit-on-lambda": minor
---

Enforce the origin token at runtime. The default Function URL origin now routes through
`@beesolve/lambda-function-url-protection` (`protectedFunctionUrlOrigin`), and all four handlers
are guarded: the fetch handlers (`files/node/stream.ts`, `files/bun/handler.ts`,
`files/bun/stream.ts`) with `protectFetch`, and the Node buffered handler
(`files/node/handler.ts`) with `protectHandler`. Keep-active stays outermost so warmer pings
short-circuit before the token check. Requests that reach the Function URL without the
`x-origin-token` header that CloudFront injects are now rejected with a 403.
