# Local Integration Tests: Implementation Plan

> **Research & tool comparison:** [local-integration-testing.md](./local-integration-testing.md)

## Summary

Add a `bun run integ:local` command that runs the integration test suite against **ministack** on `localhost:4566` — no AWS credentials, no cost, under 5 minutes. Covers all three adapter/runtime configs; skips static-asset (CloudFront data plane) and streaming (RESPONSE_STREAM) tests, which stay AWS-only.

## Starting ministack

```bash
docker run -p 4566:4566 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ministackorg/ministack
```

Docker socket mount enables `provided.al2023` Lambda execution (Bun custom runtime via Docker RIE).

## Local test scope

| | EsbNode | BunNode | BunBun |
|---|---|---|---|
| SSR home page | ✅ | ✅ | ✅ |
| API route JSON | ✅ | ✅ | ✅ |
| `getAwsEvent()` | ✅ | ✅ | ✅ |
| Cookies | ✅ | ✅ | ✅ |
| Custom 404 | ✅ | ✅ | ✅ |
| Redirect | ✅ | ✅ | ✅ |
| Static asset (CloudFront→S3) | ❌ | ❌ | ❌ |
| Streaming > 6 MB | ❌ | ❌ | ❌ |

BunBun uses `invokeMode: BUFFERED` locally (RESPONSE_STREAM not supported by ministack).

## Files to create/modify

| File | Change |
|---|---|
| `examples/infra/lib/local-node-stack.ts` | **New** — Lambda (Node.js 24 ARM64) + Function URL; no CloudFront/S3/warmer |
| `examples/infra/lib/local-bun-stack.ts` | **New** — same but `BunFunction` + `BunLambdaLayer`, `invokeMode: BUFFERED` |
| `examples/infra/bin/app.ts` | Add local stacks behind `if (process.env.LOCAL_INTEG)` guard |
| `test/integration/local.test.ts` | **New** — test orchestrator gated on `LOCAL_INTEG=1` |
| `test/integration/helpers.ts` | Add `waitForMinistack`, `ministackReset`, `cdkBootstrapLocal`, `cdkDeployLocal` |
| `package.json` | Add `integ:local` and `integ:local:start` scripts |

## CDK stack design

Local stacks use pre-built `Code.fromAsset(join(buildDir, 'server'))` — CDK must not re-bundle since `buildApp()` runs first.

```typescript
// local-node-stack.ts
export class LocalNodeStack extends Stack {
  constructor(scope: App, id: string, buildDir: string, props: StackProps) {
    super(scope, id, props)
    const fn = new Function(this, 'Fn', {
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      handler: 'handler.handler',
      code: Code.fromAsset(join(buildDir, 'server')),
      memorySize: 1024,
      timeout: Duration.seconds(10),
      environment: { ORIGIN_TOKEN: '' },  // CloudFront validates this, not Lambda
    })
    const url = fn.addFunctionUrl({ authType: FunctionUrlAuthType.NONE })
    new CfnOutput(this, 'FunctionUrl', { value: url.url })
  }
}
```

`bin/app.ts` addition:
```typescript
if (process.env.LOCAL_INTEG) {
  new LocalNodeStack(app, 'LocalEsbNode', join(__dirname, '../../basic/build-esb'), { env })
  new LocalNodeStack(app, 'LocalBunNode', join(__dirname, '../../basic/build-bun'), { env })
  new LocalBunStack(app, 'LocalBunBun', join(__dirname, '../../streaming/build'), { env })
}
```

## Test structure (`local.test.ts`)

```typescript
const RUN_LOCAL = process.env.LOCAL_INTEG === '1'

const localEnv = {
  ...process.env,
  LOCAL_INTEG: '1',
  AWS_ENDPOINT_URL: 'http://localhost:4566',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  AWS_DEFAULT_REGION: 'eu-central-1',
}

if (RUN_LOCAL) {
  beforeAll(async () => {
    await waitForMinistack()        // poll /_ministack/health up to 15s
    await ministackReset()         // POST /_ministack/reset — clean state
    buildApp('basic', { ADAPTER_TYPE: 'esb', ADAPTER_OUT: 'build-esb' })
    buildApp('basic', { ADAPTER_TYPE: 'bun', ADAPTER_OUT: 'build-bun' })
    buildApp('streaming')
    cdkBootstrapLocal(localEnv)    // cdk bootstrap aws://000000000000/eu-central-1
    cdkDeployLocal(['LocalEsbNode', 'LocalBunNode', 'LocalBunBun'], localEnv)
    // parse outputs.json for Function URLs
  }, 10 * 60 * 1000)
}

// 6 tests (static asset omitted)
localBasicSuite('Config 1: esbuild + Node.js', () => outputs.EsbNodeUrl)
localBasicSuite('Config 2: bun bundler + Node.js', () => outputs.BunNodeUrl)
localBasicSuite('Config 3: bun bundler + Bun', () => outputs.BunBunUrl)
```

## `package.json` scripts

```json
"integ:local": "LOCAL_INTEG=1 bun test test/integration/local.test.ts",
"integ:local:start": "docker run -p 4566:4566 -v /var/run/docker.sock:/var/run/docker.sock ministackorg/ministack"
```

## Risks

| Risk | Mitigation |
|---|---|
| CDK bootstrap fails (CloudFormation partial in ministack) | Fall back to creating Lambda + Function URL directly via `@aws-sdk/client-lambda` — no CDK, no CloudFormation |
| BunBun Docker RIE path untested | Test manually first; skip BunBun locally if RIE doesn't resolve the Bun layer binary |
| ministack Function URL format unknown | Check actual `FunctionUrl` output from `CreateFunctionUrlConfig` — likely `http://localhost:4566/lambda-url/<name>/` |
