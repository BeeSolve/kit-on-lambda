import { App } from 'aws-cdk-lib'
import { BasicEsbNodeStack } from '../lib/basic-esb-node-stack.js'
import { BasicBunNodeStack } from '../lib/basic-bun-node-stack.js'
import { StreamingBunBunStack } from '../lib/streaming-bun-bun-stack.js'

const app = new App()

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1',
}

const ts = process.env.INTEG_TIMESTAMP ?? Date.now().toString()

new BasicEsbNodeStack(app, `KitOnLambdaInteg-EsbNode-${ts}`, { env })
new BasicBunNodeStack(app, `KitOnLambdaInteg-BunNode-${ts}`, { env })
new StreamingBunBunStack(app, `KitOnLambdaInteg-BunBun-${ts}`, { env })
