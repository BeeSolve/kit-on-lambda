# Local Integration Testing: Research & Plan

## Emulators Evaluated

Two free, MIT-licensed AWS emulators were compared: **ministack** and **floci**. Both are positioned as LocalStack replacements after LocalStack moved behind a paywall in March 2026.

---

## Comparison: ministack vs floci

| | ministack | floci |
|---|---|---|
| **Stars** | 2,945 | 12,549 |
| **Latest release** | v1.3.44 (2026-05-19) | v1.5.17 (2026-05-18) |
| **Install (no Docker)** | `pip install ministack` | Native binary or JVM (no npm/brew) |
| **Startup time** | < 2 s | ~24 ms |
| **Idle memory** | ~40 MB | ~13 MB |
| **Docker image size** | ~250 MB | ~90 MB |
| **Lambda (Node.js)** | Native in-process | Docker required |
| **Lambda (provided.al2023 / Bun)** | Docker RIE | Docker required |
| **Lambda Function URLs** | ✅ | ✅ |
| **RESPONSE_STREAM invoke mode** | ❌ not implemented | ❌ explicitly returns 404 |
| **CloudFront (data plane)** | ❌ API stubs only | ❌ not documented at all |
| **CloudFormation** | Partial (enough for CDK) | Partial |
| **CDK support** | Documented (`AWS_ENDPOINT_URL`) | Documented |
| **AWS services** | 55+ | 47 |
| **License** | MIT | MIT |

### Winner with Docker available: ministack

Floci is faster and has more community traction, but for this codebase:

1. **CloudFront matters for CDK deploy.** The existing CDK stacks create CloudFront distributions. ministack accepts CloudFront resource creation (as a stub) so `cdk deploy` succeeds without modification. Floci has no CloudFront at all — the CDK deploy would fail on the distribution resource, requiring a local-specific stack either way.

2. **More services.** ministack covers 55+ services vs 47; the broader coverage is useful as the codebase grows.

3. **CDK is explicitly documented** in ministack's README with working examples.

4. **Bun runtime (provided.al2023)** — both require Docker for this. With Docker available, ministack's Docker RIE path enables the BunBun config locally. Floci also supports `provided.al2023` via Docker.

Floci's speed advantage (24ms vs 2s startup) is irrelevant when the test run itself takes minutes.

---

## Apple Container as Docker substitute

Not viable for this use case:

- Neither ministack nor floci documents or has tested Apple Container
- Apple Container requires [Socktainer](https://socktainer.github.io/) to expose a Docker-compatible socket — partial API, experimental, requires macOS 26 Tahoe
- No Docker Compose support (would affect multi-container setups)
- ministack's `pip install` path avoids Docker entirely for Node.js Lambda, making this moot for those configs

---

## Response Streaming (RESPONSE_STREAM)

**Neither emulator supports it, and there is no known workaround for local emulation.**

- ministack: no mention of `InvokeWithResponseStream` in docs/tests
- floci: explicitly documents it as unsupported (returns 404)
- AWS SAM CLI `sam local`: also does not support RESPONSE_STREAM
- AWS Lambda RIE (runtime interface emulator): implements the standard Lambda Runtime API but not the streaming extension

What is testable locally as a substitute: the same 6 basic test cases (SSR, API, cookies, redirects, 404, `getAwsEvent()`) work against the non-streaming `handler.handler` entrypoint with BUFFERED invoke mode. The streaming-specific test (`large payload > 6 MB`) stays AWS-only.

The BunBun streaming test is already skipped upstream pending `@beesolve/lambda-bun-runtime` implementing the streaming protocol, so that remains unaffected.

---

## What can be tested locally vs AWS-only

| Scenario | Local (ministack + Docker) |
|---|---|
| Config 1 EsbNode (esbuild + Node.js) | ✅ |
| Config 2 BunNode (Bun bundler + Node.js) | ✅ |
| Config 3 BunBun (Bun custom runtime) | ✅ with Docker RIE |
| SSR home page | ✅ |
| API routes | ✅ |
| `getAwsEvent()` context | ✅ |
| Cookies | ✅ |
| Custom 404 | ✅ |
| Redirect | ✅ |
| Static assets (CloudFront → S3) | ❌ no CloudFront data plane |
| Response streaming > 6 MB | ❌ RESPONSE_STREAM not supported |

6 of 7 basic tests pass per config. Static asset test stays AWS-only. Streaming test stays AWS-only.

---

## Implementation Plan

### Prerequisites

```bash
pip install ministack   # or: pipx install ministack
# Docker required for provided.al2023 (BunBun config)
ministack               # starts on http://localhost:4566
```

### New files

#### `examples/infra/lib/local-node-stack.ts`

Minimal CDK stack for local testing — Lambda + Function URL only. No CloudFront, no S3 static assets, no warmer. Two instances: EsbNode and BunNode (both Node.js 24, ARM64).

The existing SvelteKit construct can't be reused easily since it pulls in CloudFront/S3/warmer. This stack uses `NodejsFunction` (or `Function` with pre-built `Code.fromAsset`) directly.

Key: use `Code.fromAsset(join(buildDir, 'server'))` — build output is already created by `buildApp()`, so CDK must not re-bundle.

Set `ORIGIN_TOKEN: ''` — the Lambda handler itself doesn't validate this (CloudFront does).

Two stacks instantiated in `bin/app.ts` behind `LOCAL_INTEG` guard.

For BunBun locally: a third `local-bun-stack.ts` using `BunFunction` + `BunLambdaLayer` from `kit-on-lambda/cdk` with `invokeMode: BUFFERED` (since streaming isn't supported). This requires Docker for the runtime RIE.

#### `test/integration/local.test.ts`

Gate: `LOCAL_INTEG=1`. Mirrors `deploy-destroy.test.ts` structure:

- `waitForMinistack()` health check before proceeding
- `ministackReset()` for clean state between runs
- Builds apps (same `buildApp()` calls)
- CDK bootstrap + deploy against ministack (`AWS_ENDPOINT_URL=http://localhost:4566`, fake credentials)
- Reads Function URLs from `outputs.json`
- Runs `localBasicSuite` (same 7 tests minus static asset) against all three configs
- `afterAll` optional — ministack resets on restart; or call `/_ministack/reset`

Target runtime: under 5 minutes total vs 30+ minutes for AWS.

#### `test/integration/helpers.ts` additions

```typescript
export async function waitForMinistack(endpoint = 'http://localhost:4566', timeoutMs = 15_000): Promise<void>
export async function ministackReset(endpoint = 'http://localhost:4566'): Promise<void>
export function cdkBootstrapLocal(env: Record<string, string>): void
export function cdkDeployLocal(stacks: string[], env: Record<string, string>): void
```

#### `package.json` scripts

```json
"integ:local": "LOCAL_INTEG=1 bun test test/integration/local.test.ts",
"integ:local:start": "ministack"
```

### CDK env vars for local

```typescript
const localEnv = {
  ...process.env,
  LOCAL_INTEG: '1',
  AWS_ENDPOINT_URL: 'http://localhost:4566',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  AWS_DEFAULT_REGION: 'eu-central-1',
}
```

### Risks

1. **CDK bootstrap in ministack**: CloudFormation is partial. Bootstrap creates SSM params, IAM roles, ECR repo. If it fails, fall back to direct SDK Lambda creation (no CDK, no CloudFormation) in the test `beforeAll`.

2. **Lambda code asset upload**: CDK uploads ZIPs to an S3 assets bucket. ministack S3 is fully supported, so this should work.

3. **BunBun Docker RIE**: ministack routes `provided.al2023` to Docker RIE. The Bun runtime layer (`BunLambdaLayer`) ships a binary. This path needs testing — may require Docker image configuration.

### Verification

```bash
# Terminal 1
ministack

# Terminal 2  
bun run integ:local
```

Expected: 6 tests × 3 configs = 18 pass, static asset test skipped = 3 skipped.
