# ADR-007: Bun on a customer-managed runtime with response streaming

## Status

Accepted

## Context

`@beesolve/lambda-bun-runtime` v4 runs Bun on a Lambda customer-managed runtime (CMR) instead of a layer on `provided.al2023`. It defines the `awslambda` global (`streamifyResponse`, `HttpResponseStream.from`), which `asResponseStreamHandler` from `@beesolve/lambda-fetch-api` needs. This lifts the streaming deferral from ADR-002.

## Decision

- Depend on `@beesolve/lambda-bun-runtime` `^4.10405.1`. The `SvelteKit` construct with `runtime: "bun"` creates a `BunFunction` on the CMR and no longer creates a `BunLambdaLayer`.
- `files/bun/stream.ts` uses `asResponseStreamHandler(protectFetch(...))`, the same shape as the Node handler, so the Function URL origin-token protection applies in streaming mode.
- Regions without the published runtime use `lambdaProps.bunRuntime: { runtimeArn, runtimeAlias }` with a self-published runtime. There is no layer fallback in the construct.
- The streaming large-payload integration test (`> 6 MB`) is enabled.

## Consequences

- Requires `aws-cdk-lib` 2.278.0 or newer and a stack with a concrete region.
- Existing Bun deployments switch from a layer on `provided.al2023` to the CMR, so CloudFormation replaces the function's runtime configuration on the next deploy.
- Users in unsupported regions must publish their own runtime.
