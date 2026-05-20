# Local Integration Tests: Implementation Plan

> **Research & tool comparison:** [local-integration-testing.md](./local-integration-testing.md)

## Summary

`bun run integ:local` runs the integration test suite entirely in-process — no Docker, no AWS credentials, no external services. The SvelteKit build output is imported directly into the Bun test process and wrapped in a lightweight `Bun.serve()` HTTP server that translates HTTP requests to `APIGatewayProxyEventV2` events.

## Approach: in-process Bun server

Ministack and the AWS SDK direct-API approach were both explored and abandoned:

- **ministack CloudFormation** does not support `AWS::Lambda::Url` (Function URLs), so CDK deploy fails.
- **ministack's Lambda executor** uses `require()` to load handlers, which fails for ESM modules with top-level `await` (which the SvelteKit adapter produces).

The solution: skip the Lambda runtime entirely. `deployLocalLambda` dynamically imports `handler.js`, starts a `Bun.serve()` on a random port, and converts incoming `Request` objects to `APIGatewayProxyEventV2` events before calling the handler directly.

## Local test scope

| | EsbNode | BunNode |
|---|---|---|
| SSR home page | ✅ | ✅ |
| API route JSON | ✅ | ✅ |
| `getAwsEvent()` | ✅ | ✅ |
| Cookies | ✅ | ✅ |
| Custom 404 | ✅ | ✅ |
| Redirect | ✅ | ✅ |
| Static asset (CloudFront→S3) | ❌ | ❌ |
| Streaming > 6 MB | ❌ | ❌ |

BunBun (Bun custom runtime) is not included locally because `@beesolve/lambda-bun-runtime` shares `aws-cdk-lib` with the root but at a different install path, causing TypeScript type conflicts. BunBun stays AWS-only.

## Files created/modified

| File | Change |
|---|---|
| `test/integration/helpers.ts` | Added `deployLocalLambda`, `stopLocalServers` |
| `test/integration/local.test.ts` | **New** — test suite gated on `LOCAL_INTEG=1` |
| `package.json` | Added `integ:local` script |

## How `deployLocalLambda` works

```typescript
export async function deployLocalLambda(functionName: string, serverDir: string): Promise<string> {
  const { handler } = await import(`${serverDir}/handler.js`)
  const server = Bun.serve({
    port: 0,  // OS assigns a free port
    fetch: async (req) => {
      const event = buildAPIGatewayEventV2(req)
      const context = buildFakeContext(functionName)
      const result = await handler(event, context)
      return buildResponse(result)
    },
  })
  return `http://localhost:${server.port}`
}
```

`stopLocalServers()` is called in `afterAll` to shut down all servers after tests complete.

## Running locally

```bash
bun run integ:local
```

No setup required — the test suite builds both adapters and starts servers in `beforeAll`.
