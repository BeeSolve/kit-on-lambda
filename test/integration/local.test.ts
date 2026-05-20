import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { buildApp, deployLocalLambda, examplesDir, stopLocalServers } from './helpers.js'

const RUN_LOCAL = process.env.LOCAL_INTEG === '1'

function describeLocal(label: string, fn: () => void) {
  if (!RUN_LOCAL) {
    describe.skip(`[skipped — set LOCAL_INTEG=1] ${label}`, fn)
  } else {
    describe(label, fn)
  }
}

interface StackOutputs {
  EsbNodeUrl: string
  BunNodeUrl: string
}

let outputs: StackOutputs

if (RUN_LOCAL) {
  beforeAll(
    async () => {
      buildApp('basic', { ADAPTER_TYPE: 'esb', ADAPTER_OUT: 'build-esb' })
      buildApp('basic', { ADAPTER_TYPE: 'bun', ADAPTER_OUT: 'build-bun' })

      const [esbUrl, bunUrl] = await Promise.all([
        deployLocalLambda('local-esb-node', join(examplesDir, 'basic/build-esb/server')),
        deployLocalLambda('local-bun-node', join(examplesDir, 'basic/build-bun/server')),
      ])

      outputs = { EsbNodeUrl: esbUrl, BunNodeUrl: bunUrl }
    },
    10 * 60 * 1000,
  )

  afterAll(() => stopLocalServers())
}

function basicSuiteLocal(label: string, getUrl: () => string) {
  describeLocal(label, () => {
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

basicSuiteLocal('Config 1: esbuild + Node.js', () => outputs.EsbNodeUrl)
basicSuiteLocal('Config 2: bun bundler + Node.js', () => outputs.BunNodeUrl)
