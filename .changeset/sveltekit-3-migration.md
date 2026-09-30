---
"kit-on-lambda": minor
---

Migrate the adapter to SvelteKit 3 (beta). This release targets SvelteKit 3 only and drops SvelteKit 2 support.

- Bump the `@sveltejs/kit` peer dependency to `^3.0.0`.
- Replace the removed `builder.generateManifest` + `"SERVER"`/`"MANIFEST"` string-substitution flow with `builder.generateServerInstance(...)`. The emitted server module exports a `server` object (from `create_server`), so the node and bun handler/stream entries now `import { server } from "SERVER"` and call `server.init(...)` / `server.respond(...)` directly instead of constructing the deprecated `Server` class.
- Read `paths.base` from the flattened `builder.config.paths.base` (`builder.config.kit` was removed).
- Replace the deprecated `builder.mkdirp` / `builder.rimraf` with `node:fs`.
- Update server instrumentation to the new flow: call `builder.createInstrumentationInitializer(...)`, include the initializer in the bundle, then pass its path to `builder.instrument(...)`.
