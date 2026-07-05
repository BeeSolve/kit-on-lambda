import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import type { App } from "aws-cdk-lib";
import { SvelteKitHttpApi } from "kit-on-lambda/cdk";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class BasicHttpApiNodeStack extends Stack {
  constructor(scope: App, id: string, props: StackProps) {
    super(scope, id, props);

    const sk = new SvelteKitHttpApi(this, "App", {
      buildDirectory: join(__dirname, "../../basic/build-esb"),
      runtime: "node",
    });

    new CfnOutput(this, "DistributionUrl", {
      value: `https://${sk.distribution.distributionDomainName}`,
    });

    new CfnOutput(this, "HttpApiUrl", {
      value: sk.httpApi.apiEndpoint,
    });
  }
}
