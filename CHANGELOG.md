# kit-on-lambda

## 0.6.1

### Patch Changes

- a2b4375: Bump @beesolve/lambda-fetch-api to ^2.0.0, remove unused @beesolve/auth-service dependency, add overrides to deduplicate aws-cdk-lib

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
