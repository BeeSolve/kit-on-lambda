---
"kit-on-lambda": patch
---

Document local development in the README: `vite dev` runs the app as a normal
SvelteKit project (no Lambda), how to load env vars with `bun --env-file`, and that
`getAwsEvent()` / `getAwsContext()` throw outside a real invocation — with a
`import.meta.env.DEV` guard pattern for local fallbacks.
