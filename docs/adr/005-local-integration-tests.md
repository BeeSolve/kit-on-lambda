# ADR 005: Local Integration Tests via In-Process Bun Server

## Status

Accepted

## Context

The existing integration tests (`integ:deploy-test-destroy`) deploy real CDK stacks to AWS, take ~30 minutes, and incur real cost. A faster local feedback loop was needed.

### Emulators evaluated

Two free, MIT-licensed AWS emulators were compared — both emerged after LocalStack moved behind a paywall in March 2026.

| | ministack | floci |
|---|---|---|
| **Stars** | 2,945 | 12,549 |
| **Lambda (Node.js)** | Native in-process | Docker required |
| **Lambda (provided.al2023 / Bun)** | Docker RIE | Docker required |
| **Lambda Function URLs** | ✅ | ✅ |
| **RESPONSE_STREAM** | ❌ | ❌ explicitly 404 |
| **CloudFront (data plane)** | ❌ API stubs only | ❌ none |
| **CloudFormation** | Partial | Partial |
| **AWS services** | 55+ | 47 |

ministack was preferred over floci because: it accepts CloudFront resource creation as a stub (so `cdk deploy` succeeds without a local-specific stack), it covers more services, and CDK usage is explicitly documented in the README. Floci's faster startup (24 ms vs 2 s) is irrelevant when test runs take minutes.

**Apple Container** was also evaluated as a Docker substitute — not viable: requires Socktainer (experimental, macOS 26 only) to expose a Docker-compatible socket, and has no Docker Compose support.

**RESPONSE_STREAM** is unsupported in all local tooling surveyed (ministack, floci, AWS SAM CLI, AWS Lambda RIE). Streaming tests remain AWS-only with no known local workaround.

### ministack blockers

Despite winning the emulator comparison, ministack hit two hard blockers when integrated:

1. **`AWS::Lambda::Url` not supported** — CDK stacks include `fn.addFunctionUrl()` which emits an `AWS::Lambda::Url` CloudFormation resource. ministack's CloudFormation emulation rejects it, so `cdk deploy` fails unconditionally.

2. **ESM top-level `await` not supported** — Falling back to the AWS SDK directly (`@aws-sdk/client-lambda`) and invoking the function through ministack's Lambda executor also failed. ministack's native Node.js executor loads handlers with `require()`, which Node.js refuses for ESM modules with top-level `await` — which the SvelteKit adapter produces.

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

### What is tested locally

| Scenario | Local |
|---|---|
| EsbNode — esbuild + Node.js | ✅ |
| BunNode — Bun bundler + Node.js | ✅ |
| SSR home page, API routes, cookies, 404, redirects, `getAwsEvent()` | ✅ (6 tests per config) |
| BunBun — Bun custom runtime | ❌ AWS-only |
| Static assets (CloudFront → S3) | ❌ AWS-only |
| Response streaming > 6 MB | ❌ AWS-only |

BunBun stays AWS-only because `@beesolve/lambda-bun-runtime` shares `aws-cdk-lib` with the root workspace at a different install path, causing TypeScript type conflicts. Static asset and streaming tests are structurally incompatible with a plain HTTP proxy.

### Running

```bash
bun run integ:local   # ~30 seconds, 12 tests
```

No setup required — `beforeAll` builds both adapter configs and starts the servers; `afterAll` tears them down.
