import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import type { App } from "aws-cdk-lib";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { InvokeMode } from "aws-cdk-lib/aws-lambda";
import { SvelteKit } from "kit-on-lambda/cdk";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class BasicHttpApiNodeStack extends Stack {
  constructor(scope: App, id: string, props: StackProps) {
    super(scope, id, props);

    const api = new HttpApi(this, "Api");

    const sk = new SvelteKit(this, "App", {
      buildDirectory: join(__dirname, "../../basic/build-esb"),
      runtime: "node",
      invokeMode: InvokeMode.BUFFERED,
      toDefaultOrigin: ({ handler }) => {
        const integration = new HttpLambdaIntegration("Integration", handler);

        api.addRoutes({
          path: "/{proxy+}",
          methods: [HttpMethod.ANY],
          integration,
        });
        api.addRoutes({
          path: "/",
          methods: [HttpMethod.ANY],
          integration,
        });

        const apiUrl = new URL(api.apiEndpoint);
        return new HttpOrigin(apiUrl.hostname);
      },
    });

    new CfnOutput(this, "DistributionUrl", {
      value: `https://${sk.distribution.distributionDomainName}`,
    });

    new CfnOutput(this, "HttpApiUrl", {
      value: api.apiEndpoint,
    });
  }
}
