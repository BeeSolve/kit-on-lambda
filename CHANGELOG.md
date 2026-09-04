# kit-on-lambda

## 0.8.2

### Patch Changes

- 895d32d: Document `paths.relative: false` as the recommended way to configure asset paths, so the CloudFront distribution URL is no longer required at build time.

  The `SvelteKit` construct already routes root-absolute asset paths (`/_app/*`, top-level static files) to S3 via per-directory CloudFront behaviors, so emitting root-absolute URLs is sufficient and avoids the first-deploy chicken-and-egg problem of needing the distribution URL before it exists.

  - Add an "Asset paths — `paths.relative` vs `paths.assets`" section explaining both approaches and their trade-offs.
  - Present `paths.assets` (absolute CloudFront URL) as an optional alternative for cross-origin/separate-domain asset serving, rather than a requirement.
  - Update the Option 1/2/3 `svelte.config.js` examples to use `paths: { relative: false }`.
  - Add a troubleshooting entry for missing styles/scripts on nested routes (assets 404).

## 0.8.1

### Patch Changes

- 3038bec: Upgrade `@beesolve/lint-config` to 0.3.0 and add the newly-required `oxlint-tsgolint` peer dependency, which enables type-aware linting.

  Resolve the findings the stricter rules surface in the shipped handler/stream templates and tests:

  - Replace `process.env as Record<string, string>` casts with a `definedEnv()` helper that filters out undefined values.
  - Use `HttpMethod.ANY` instead of `"ANY" as never` in the CDK tests.
  - Drop redundant result-type assertions on the single-arm Bun handler result, and narrow the Node handler's `v1 | v2` result union via small typed helpers.
  - Prefix intentional fire-and-forget calls (`mock.module`, `server.stop`) with `void` to satisfy `no-floating-promises`.

## 0.8.0

### Minor Changes

- 17d9687: Upgrade toolchain dependencies: TypeScript 6 → 7, `@changesets/cli` 2 → 3, and bump AWS CDK, esbuild, oxlint/oxfmt, and `@beesolve/*` runtime packages.

  TypeScript 7 is the native compiler previously distributed as `@typescript/native-preview` (binary `tsgo`); it now ships as `tsc`. The build's declaration step (`build.ts`) was updated from `tsgo` to `tsc` accordingly, and `@typescript/native-preview` is no longer needed. The release workflow was also updated for Changesets CLI v3 (`changeset tag` → `changeset git-tag`, `version` → `version-script` action input).

### Patch Changes

- a8dc8e9: Align `aws-cdk-lib` and `constructs` version ranges in the `overrides` block with the bumped `peerDependencies` (both to the 2.268 / 10.8 line). Previously the stale override ranges conflicted with the direct dependency, causing `npm publish` to fail with `EOVERRIDE`.

## 0.7.0

### Minor Changes

- 4b8c1ef: Serve static assets from a REST S3 origin with Origin Access Control (OAC) instead of an S3 website origin.

  The website endpoint returned an HTML error/index document for missing objects, so a missing hashed asset (e.g. during a version skew or partial upload) came back as `text/html`. Browsers then tried to parse that HTML as an ES module and threw "Importing a module script failed", producing silent styling breakage instead of a clear error. A REST S3 origin via OAC returns real HTTP status codes and the object's stored Content-Type, so a missing asset 404s cleanly and never poisons module imports. The assets bucket is now fully private (all public access blocked, no public bucket policy, no website configuration); CloudFront signs origin requests via OAC.

  This changes the provisioned infrastructure: on redeploy the assets bucket loses its website configuration and public-read policy, and a CloudFront Origin Access Control resource plus an OAC-scoped bucket policy are added. No API changes.

### Patch Changes

- a2b4375: Bump @beesolve/lambda-fetch-api to ^2.0.0, remove unused @beesolve/auth-service dependency, add overrides to deduplicate aws-cdk-lib
- e613e8f: Document local development in the README: `vite dev` runs the app as a normal
  SvelteKit project (no Lambda), how to load env vars with `bun --env-file`, and that
  `getAwsEvent()` / `getAwsContext()` throw outside a real invocation — with a
  `import.meta.env.DEV` guard pattern for local fallbacks.

## 0.6.0

### Minor Changes

- Unify CDK constructs into a single `SvelteKit` class with a `toDefaultOrigin` prop. The previous `SvelteKitFunctionUrl` and `SvelteKitHttpApi` exports are removed. To use HTTP API Gateway as the CloudFront origin, pass a `toDefaultOrigin` factory function instead.

## 0.5.1

### Patch Changes

- SvelteKitHttpApi: httpApi is now required, authorizer prop removed. The construct exposes integration for consumers to wire up routes externally. This enables patterns where auth services keep their authorizer private.

## 0.5.0

### Minor Changes

- Add SvelteKitHttpApi construct for deploying SvelteKit behind HTTP API Gateway with Lambda authorizer support. Existing SvelteKitFunctionUrl (aliased as SvelteKit) remains unchanged.

## 0.4.1

### Patch Changes

- 39f28e9: Replace bun-dts with tsgo for declaration generation, add oxlint/oxfmt tooling via @beesolve/lint-config, fix CJS interop in CDK dist output

## 0.4.0

### Minor Changes

- 8eae50d: update lambda-keep-active

## 0.3.0

### Minor Changes

- 7126cf7: Fix `getAwsEvent()` returning 500, fix Bun runtime responses, and remove `kit-on-lambda/runtime`.

  **Bug fixes:**

  - `getAwsEvent()` / `getAwsContext()` now work correctly in all three deployment configs. The root cause was `@beesolve/lambda-fetch-api` being bundled twice (once into the adapter handler, once into the SvelteKit server bundle via the old `runtime.ts` re-export), producing two separate `AsyncLocalStorage` instances. Making `@beesolve/lambda-fetch-api` external in the adapter build ensures a single shared chunk and a single storage instance.
  - Config 3 (bun bundler + Bun runtime): fixed `application/octet-stream` responses, wrong API response shapes, and 404 returning 200. The CDK stack was configured with `InvokeMode.RESPONSE_STREAM` while the Bun handler uses a buffered `asHttpV2Handler` — changed to `InvokeMode.BUFFERED`.

  **Breaking change:**

  `kit-on-lambda/runtime` is removed. Import AWS helpers directly from `@beesolve/lambda-fetch-api` instead:

  ```diff
  -import { getAwsEvent } from 'kit-on-lambda/runtime'
  +import { getAwsEvent } from '@beesolve/lambda-fetch-api'
  ```

  Install the package if you haven't already:

  ```bash
  npm i @beesolve/lambda-fetch-api
  # or
  bun i @beesolve/lambda-fetch-api
  ```

### Patch Changes

- 796eb61: Fix CI: switch examples to name-based `bun link` so Vite and CDK can resolve the package.

## 0.2.0

### Minor Changes

- Upgrade to `@beesolve/lambda-fetch-api` v1 and `@beesolve/lambda-bun-runtime` v2. Adds response streaming support for the Bun runtime with a new `invokeMode` CDK prop, extracts shared route logic into `util.ts`, and ships a full test suite covering Node.js and Bun handlers, streaming, and runtime helpers.
