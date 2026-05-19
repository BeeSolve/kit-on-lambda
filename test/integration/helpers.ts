import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const examplesDir = join(__dirname, '../../examples')
export const infraDir = join(examplesDir, 'infra')

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
