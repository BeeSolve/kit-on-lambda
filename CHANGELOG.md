# kit-on-lambda

## 0.2.0

### Minor Changes

- Upgrade to `@beesolve/lambda-fetch-api` v1 and `@beesolve/lambda-bun-runtime` v2. Adds response streaming support for the Bun runtime with a new `invokeMode` CDK prop, extracts shared route logic into `util.ts`, and ships a full test suite covering Node.js and Bun handlers, streaming, and runtime helpers.
