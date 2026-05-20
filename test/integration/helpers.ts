import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const examplesDir = join(__dirname, '../../examples')
export const infraDir = join(examplesDir, 'infra')

const localServers: ReturnType<typeof Bun.serve>[] = []

export function stopLocalServers() {
  for (const server of localServers) server.stop()
  localServers.length = 0
}

export async function deployLocalLambda(
  functionName: string,
  serverDir: string,
): Promise<string> {
  const { handler } = (await import(`${serverDir}/handler.js`)) as {
    handler: (
      event: APIGatewayProxyEventV2,
      context: Context,
    ) => Promise<APIGatewayProxyStructuredResultV2>
  }

  const server = Bun.serve({
    port: 0,
    fetch: async (req: Request) => {
      const url = new URL(req.url)
      const cookieHeader = req.headers.get('cookie')

      const event: APIGatewayProxyEventV2 = {
        version: '2.0',
        routeKey: `${req.method} ${url.pathname}`,
        rawPath: url.pathname,
        rawQueryString: url.search.slice(1),
        headers: Object.fromEntries(req.headers.entries()),
        cookies: cookieHeader ? cookieHeader.split(';').map((c) => c.trim()) : undefined,
        requestContext: {
          apiId: 'local',
          domainName: 'localhost',
          domainPrefix: 'localhost',
          http: {
            method: req.method,
            path: url.pathname,
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: req.headers.get('user-agent') ?? '',
          },
          routeKey: `${req.method} ${url.pathname}`,
          stage: '$default',
          time: new Date().toUTCString(),
          timeEpoch: Date.now(),
          accountId: '000000000000',
          requestId: crypto.randomUUID(),
        },
        isBase64Encoded: false,
        body: (await req.text()) || undefined,
      }

      const fakeContext: Context = {
        functionName,
        functionVersion: '$LATEST',
        invokedFunctionArn: `arn:aws:lambda:eu-central-1:000000000000:function:${functionName}`,
        memoryLimitInMB: '1024',
        awsRequestId: crypto.randomUUID(),
        logGroupName: `/aws/lambda/${functionName}`,
        logStreamName: '2026/[$LATEST]/local',
        getRemainingTimeInMillis: () => 30_000,
        done: () => {},
        fail: () => {},
        succeed: () => {},
        callbackWaitsForEmptyEventLoop: false,
      }

      const result = await handler(event, fakeContext)

      const headers = new Headers()
      for (const [k, v] of Object.entries(result.headers ?? {})) headers.set(k, String(v))
      for (const cookie of result.cookies ?? []) headers.append('set-cookie', cookie)

      const body = result.body
        ? result.isBase64Encoded
          ? Buffer.from(result.body, 'base64')
          : result.body
        : null

      return new Response(body, { status: result.statusCode ?? 200, headers })
    },
  })

  localServers.push(server)
  return `http://localhost:${server.port}`
}

export function buildApp(
  app: 'basic' | 'streaming',
  env: Record<string, string> = {},
) {
  // --bun ensures Bun's native runtime is used, required for the bun.ts adapter (Bun.build)
  const result = spawnSync('bun', ['--bun', 'run', 'build'], {
    cwd: join(examplesDir, app),
    env: { ...process.env, ...env },
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`SvelteKit build failed for examples/${app}`)
  }
}

export function cdkDeploy(timestamp: string) {
  const result = spawnSync(
    'bunx',
    ['cdk', 'deploy', '--all', '--require-approval', 'never', '--outputs-file', 'outputs.json'],
    {
      cwd: infraDir,
      env: { ...process.env, INTEG_TIMESTAMP: timestamp },
      stdio: 'inherit',
    },
  )
  if (result.status !== 0) {
    throw new Error('CDK deploy failed')
  }
}

export function cdkDestroy(timestamp: string) {
  spawnSync('bunx', ['cdk', 'destroy', '--all', '--force'], {
    cwd: infraDir,
    env: { ...process.env, INTEG_TIMESTAMP: timestamp },
    stdio: 'inherit',
  })
}
