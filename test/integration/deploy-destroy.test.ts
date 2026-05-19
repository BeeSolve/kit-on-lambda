import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildApp, cdkDeploy, cdkDestroy, infraDir } from './helpers.js'

const RUN_INTEG = process.env.RUN_AWS_INTEG === '1'

function describeInteg(label: string, fn: () => void) {
  if (!RUN_INTEG) {
    describe.skip(`[skipped — set RUN_AWS_INTEG=1] ${label}`, fn)
  } else {
    describe(label, fn)
  }
}

interface StackOutputs {
  EsbNodeUrl: string
  BunNodeUrl: string
  BunBunUrl: string
}

let outputs: StackOutputs
const ts = Date.now().toString()

if (RUN_INTEG) {
  beforeAll(
    async () => {
      buildApp('basic', { ADAPTER_TYPE: 'esb', ADAPTER_OUT: 'build-esb' })
      buildApp('basic', { ADAPTER_TYPE: 'bun', ADAPTER_OUT: 'build-bun' })
      buildApp('streaming')

      cdkDeploy(ts)

      const raw = JSON.parse(readFileSync(join(infraDir, 'outputs.json'), 'utf8'))
      outputs = {
        EsbNodeUrl: raw[`KitOnLambdaInteg-EsbNode-${ts}`].DistributionUrl,
        BunNodeUrl: raw[`KitOnLambdaInteg-BunNode-${ts}`].DistributionUrl,
        BunBunUrl: raw[`KitOnLambdaInteg-BunBun-${ts}`].DistributionUrl,
      }
    },
    30 * 60 * 1000,
  )

  afterAll(
    async () => {
      cdkDestroy(ts)
    },
    20 * 60 * 1000,
  )
}

function basicSuite(label: string, getUrl: () => string) {
  describeInteg(label, () => {
    test('home page renders SSR content', async () => {
      const res = await fetch(getUrl())
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/text\/html/)
      expect(await res.text()).toContain('<html')
    })

    test('API route returns JSON', async () => {
      const res = await fetch(`${getUrl()}/api/hello`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('message')
      expect(body).toHaveProperty('timestamp')
    })

    test('AWS event is accessible via getAwsEvent()', async () => {
      const res = await fetch(`${getUrl()}/api/context`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('requestContext')
    })

    test('cookie header is read by the server', async () => {
      const res = await fetch(`${getUrl()}/cookies`, {
        headers: { cookie: 'test=hello' },
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('hello')
    })

    test('static asset is served via CloudFront', async () => {
      const res = await fetch(`${getUrl()}/favicon.png`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/image/)
    })

    test('custom error page is rendered for 404', async () => {
      const res = await fetch(`${getUrl()}/does-not-exist`)
      expect(res.status).toBe(404)
      expect(await res.text()).toContain('<html')
    })

    test('redirect returns 200 when followed', async () => {
      const res = await fetch(`${getUrl()}/redirect`, { redirect: 'follow' })
      expect(res.status).toBe(200)
    })
  })
}

basicSuite('Config 1: esbuild + Node.js', () => outputs.EsbNodeUrl)
basicSuite('Config 2: bun bundler + Node.js', () => outputs.BunNodeUrl)
basicSuite('Config 3: bun bundler + Bun', () => outputs.BunBunUrl)

describe.skip('Config 3: streaming-specific (disabled — awaiting @beesolve/lambda-bun-runtime streaming support)', () => {
  test('large payload (>6 MB) is returned without error', async () => {
    const res = await fetch(`${outputs.BunBunUrl}/api/large`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body.length).toBeGreaterThan(6 * 1024 * 1024)
  })
})
