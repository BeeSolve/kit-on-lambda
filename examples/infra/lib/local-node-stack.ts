import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib'
import {
  Architecture,
  Code,
  Function,
  FunctionUrlAuthType,
  Runtime,
} from 'aws-cdk-lib/aws-lambda'
import { type App } from 'aws-cdk-lib'
import { join } from 'node:path'

export class LocalNodeStack extends Stack {
  constructor(scope: App, id: string, buildDir: string, props: StackProps) {
    super(scope, id, props)

    const fn = new Function(this, 'Handler', {
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      handler: 'handler.handler',
      code: Code.fromAsset(join(buildDir, 'server')),
      memorySize: 1024,
      timeout: Duration.seconds(10),
      environment: { ORIGIN_TOKEN: '' },
    })

    const url = fn.addFunctionUrl({ authType: FunctionUrlAuthType.NONE })

    new CfnOutput(this, 'FunctionUrl', { value: url.url })
  }
}
