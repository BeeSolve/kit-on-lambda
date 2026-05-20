# ADR 005: Local Integration Tests via In-Process Bun Server

## Status

Accepted

## Context

The existing integration tests (`integ:deploy-test-destroy`) deploy real CDK stacks to AWS, take ~30 minutes, and incur real cost. A faster local feedback loop was needed.

Two AWS emulators were evaluated: **ministack** and **floci**. ministack was chosen over floci for broader service coverage and CDK documentation. However, both approaches were ultimately abandoned in favour of a simpler alternative.

### ministack blockers

1. **`AWS::Lambda::Url` not supported** — CDK stacks include `fn.addFunctionUrl()` which emits an `AWS::Lambda::Url` CloudFormation resource. ministack's CloudFormation emulation rejects it, so `cdk deploy` fails unconditionally.

2. **ESM top-level `await` not supported** — Falling back to the AWS SDK directly (`@aws-sdk/client-lambda`) and invoking the function through ministack's Lambda executor also failed. ministack's native Node.js executor loads handlers with `require()`, which Node.js refuses for ESM modules containing top-level `await` — which the SvelteKit adapter produces.

### Chosen approach: in-process Bun server

Skip the Lambda runtime and any external emulator entirely. The SvelteKit handler is a plain async function; it can be imported directly into the test process and called with a synthetic event.

`deployLocalLambda` dynamically imports `handler.js` from the build output, starts a `Bun.serve()` on a random port, and for each request:
- constructs an `APIGatewayProxyEventV2` from the incoming `Request`
- constructs a fake `Context` with realistic fields
- calls `handler(event, context)` directly
- converts the `APIGatewayProxyStructuredResultV2` result back to a `Response`

Tests `fetch()` against `http://localhost:PORT` as if it were a real Lambda Function URL.

## Decision

Use an in-process `Bun.serve()` proxy as the local test target. No Docker, no external services, no AWS credentials.

## Consequences

- `bun run integ:local` runs 12 tests across 2 configs (esbuild + Node.js, Bun bundler + Node.js) in ~30 seconds.
- No ministack dependency; `integ:local:start` script not needed.
- BunBun (Bun custom runtime) stays AWS-only: `@beesolve/lambda-bun-runtime` introduces an `aws-cdk-lib` version conflict at the TypeScript level when imported alongside the root workspace.
- Static asset (CloudFront→S3) and streaming (RESPONSE_STREAM) tests remain AWS-only — neither is expressible through a plain HTTP proxy.
