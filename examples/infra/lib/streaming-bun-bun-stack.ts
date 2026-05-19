import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib'
import { InvokeMode } from 'aws-cdk-lib/aws-lambda'
import { SvelteKit } from 'kit-on-lambda/cdk'
import { type App } from 'aws-cdk-lib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export class StreamingBunBunStack extends Stack {
  constructor(scope: App, id: string, props: StackProps) {
    super(scope, id, props)

    const sk = new SvelteKit(this, 'App', {
      buildDirectory: join(__dirname, '../../streaming/build'),
      runtime: 'bun',
      invokeMode: InvokeMode.BUFFERED,
    })

    new CfnOutput(this, 'DistributionUrl', {
      value: `https://${sk.distribution.distributionDomainName}`,
    })
  }
}
