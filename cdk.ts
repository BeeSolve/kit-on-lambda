import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BunFunctionProps } from "@beesolve/lambda-bun-runtime";
import { BunFunction, BunLambdaLayer } from "@beesolve/lambda-bun-runtime";
import { LambdaKeepActive } from "@beesolve/lambda-keep-active";
import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import type { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { BehaviorOptions, DistributionProps, IOrigin } from "aws-cdk-lib/aws-cloudfront";
import {
  AllowedMethods,
  CachePolicy,
  Function as CloudfrontFunction,
  Distribution,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { FunctionUrlOrigin, HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { ArnPrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { Function } from "aws-cdk-lib/aws-lambda";
import {
  Architecture,
  Code,
  FunctionUrlAuthType,
  InvokeMode,
  LoggingFormat,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import type { NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { BlockPublicAccess, Bucket, HttpMethods } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

import { assertUnreachable } from "./util.js";

type BaseProps = {
  /** @default resolve(`./build`) */
  readonly buildDirectory?: string;
  readonly distributionProps?: Omit<DistributionProps, "defaultBehavior">;
  readonly basicHttpAuthentication?: {
    readonly username: string;
    readonly password: string;
  };
  readonly warmer?: LambdaKeepActive;
};

type SvelteKitFunctionUrlProps =
  | (BaseProps & {
      readonly runtime: "node";
      /** @default InvokeMode.RESPONSE_STREAM */
      readonly invokeMode?: InvokeMode;
      readonly lambdaProps?: Omit<
        NodejsFunctionProps,
        "entrypoint" | "bundling" | "entry" | "code" | "handler"
      >;
    })
  | (BaseProps & {
      readonly runtime: "bun";
      /** @default InvokeMode.RESPONSE_STREAM */
      readonly invokeMode?: InvokeMode;
      readonly lambdaProps?: Omit<BunFunctionProps, "entrypoint">;
    });

export class SvelteKitFunctionUrl extends Construct {
  readonly distribution: Distribution;
  readonly handler: Function;

  constructor(
    scope: Construct,
    id: string,
    props: SvelteKitFunctionUrlProps = { runtime: "node" },
  ) {
    super(scope, id);

    const { buildDirectory = resolve(`./build`) } = props;
    const invokeMode = props.invokeMode ?? InvokeMode.RESPONSE_STREAM;
    const streaming = invokeMode === InvokeMode.RESPONSE_STREAM;

    const handler = createHandler({ scope: this, props, buildDirectory, streaming });

    keepActive({ scope: this, handler, warmer: props.warmer });

    const originToken = new Secret(handler, "OriginToken", {
      description: `x-origin-token for ${handler.node.path}.`,
      removalPolicy: RemovalPolicy.DESTROY,
      generateSecretString: { passwordLength: 128, excludePunctuation: true },
    }).secretValue.toString();

    handler.addEnvironment("ORIGIN_TOKEN", originToken);

    const url = handler.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      invokeMode,
      cors: { allowedOrigins: ["*"] },
    });

    const origin = new FunctionUrlOrigin(url, {
      customHeaders: { "x-origin-token": originToken },
    });

    this.distribution = createDistribution({ scope: this, origin, props, buildDirectory });
    this.handler = handler;
  }
}

type SvelteKitHttpApiProps =
  | (BaseProps & {
      readonly runtime: "node";
      readonly httpApi: HttpApi;
      readonly lambdaProps?: Omit<
        NodejsFunctionProps,
        "entrypoint" | "bundling" | "entry" | "code" | "handler"
      >;
    })
  | (BaseProps & {
      readonly runtime: "bun";
      readonly httpApi: HttpApi;
      readonly lambdaProps?: Omit<BunFunctionProps, "entrypoint">;
    });

export class SvelteKitHttpApi extends Construct {
  readonly distribution: Distribution;
  readonly handler: Function;
  readonly httpApi: HttpApi;
  readonly integration: HttpLambdaIntegration;

  constructor(scope: Construct, id: string, props: SvelteKitHttpApiProps) {
    super(scope, id);

    const { buildDirectory = resolve(`./build`) } = props;

    const handler = createHandler({ scope: this, props, buildDirectory, streaming: false });

    keepActive({ scope: this, handler, warmer: props.warmer });

    const api = props.httpApi;
    const integration = new HttpLambdaIntegration("LambdaIntegration", handler);

    const domain = `${api.httpApiId}.execute-api.${handler.stack.region}.amazonaws.com`;
    const origin = new HttpOrigin(domain, {
      protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
    });

    this.distribution = createDistribution({ scope: this, origin, props, buildDirectory });
    this.handler = handler;
    this.httpApi = api;
    this.integration = integration;
  }
}

export { SvelteKitFunctionUrl as SvelteKit };
export type { SvelteKitFunctionUrlProps, SvelteKitHttpApiProps };

function keepActive(props: {
  scope: Construct;
  handler: Function;
  warmer?: LambdaKeepActive;
}): void {
  const warmer = props.warmer ?? new LambdaKeepActive(props.scope, "KeepActive");
  warmer.keepActive(props.handler);
}

function createHandler(props: {
  scope: Construct;
  props: SvelteKitFunctionUrlProps | SvelteKitHttpApiProps;
  buildDirectory: string;
  streaming: boolean;
}): Function {
  const entrypoint = props.streaming ? "stream" : "handler";

  if (props.props.runtime === "node") {
    const { lambdaProps = {} } = props.props;
    const { logGroup, ...rest } = lambdaProps;

    return new NodejsFunction(props.scope, "Handler", {
      memorySize: 1024,
      timeout: Duration.seconds(10),
      code: Code.fromAsset(`${props.buildDirectory}/server/`),
      handler: `${entrypoint}.handler`,
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      loggingFormat: LoggingFormat.JSON,
      logGroup:
        logGroup ??
        new LogGroup(props.scope, "HandlerLogGroup", {
          retention: RetentionDays.TWO_WEEKS,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      ...rest,
    });
  }
  if (props.props.runtime === "bun") {
    const {
      lambdaProps = {
        bunLayer: new BunLambdaLayer(props.scope, "BunLayer"),
      } satisfies Omit<BunFunctionProps, "entrypoint">,
    } = props.props;

    return new BunFunction(props.scope, "Handler", {
      entrypoint: `${props.buildDirectory}/server/${entrypoint}.js`,
      memorySize: 1024,
      timeout: Duration.seconds(10),
      loggingFormat: LoggingFormat.JSON,
      ...lambdaProps,
    });
  }

  assertUnreachable(props.props);
}

function createDistribution(props: {
  scope: Construct;
  origin: IOrigin;
  props: BaseProps;
  buildDirectory: string;
}): Distribution {
  const bucket = new Bucket(props.scope, "Assets", {
    blockPublicAccess: BlockPublicAccess.BLOCK_ACLS_ONLY,
    websiteIndexDocument: "index.html",
    cors: [
      {
        allowedMethods: [HttpMethods.GET, HttpMethods.HEAD],
        allowedOrigins: ["*"],
        allowedHeaders: ["*"],
        maxAge: 300,
      },
    ],
  });
  bucket.addToResourcePolicy(
    new PolicyStatement({
      principals: [new ArnPrincipal("*")],
      actions: ["s3:GetObject"],
      resources: [`${bucket.bucketArn}/*`],
    }),
  );

  const s3Origin = new HttpOrigin(bucket.bucketWebsiteDomainName, {
    originPath: "",
    protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
  });

  const defaultBehavior: BehaviorOptions = {
    origin: props.origin,
    viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    allowedMethods: AllowedMethods.ALLOW_ALL,
    cachePolicy: CachePolicy.CACHING_DISABLED,
    functionAssociations: props.props.basicHttpAuthentication
      ? [
          {
            eventType: FunctionEventType.VIEWER_REQUEST,
            function: new CloudfrontFunction(props.scope, "AuthHandler", {
              runtime: FunctionRuntime.JS_2_0,
              code: FunctionCode.fromInline(`async function handler(event) {
            const request = event.request;
            var authString = 'Basic ' + Buffer.from("${props.props.basicHttpAuthentication.username}" + ':' + "${props.props.basicHttpAuthentication.password}").toString('base64');
            if (request.headers.authorization && request.headers.authorization.value === authString) {
                return request;
            }
            return {
                statusCode: 401,
                statusDescription: 'Unauthorized',
                headers: {
                    'www-authenticate': { value: 'Basic realm="Restricted"' },
                    'cache-control': { value: 'no-cache' },
                },
            };
        }`),
            }),
          },
        ]
      : undefined,
  };

  const distribution = new Distribution(props.scope, "Distribution", {
    comment: `${props.scope.node.path} SvelteKit distribution.`,
    defaultBehavior,
    priceClass: PriceClass.PRICE_CLASS_100,
    ...props.props.distributionProps,
  });

  const routes: Array<string> = JSON.parse(
    readFileSync(resolve(props.buildDirectory, "routes.json"), "utf-8"),
  );
  for (const route of routes) {
    distribution.addBehavior(route, s3Origin, {
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      originRequestPolicy: OriginRequestPolicy.USER_AGENT_REFERER_HEADERS,
      cachePolicy: CachePolicy.CACHING_OPTIMIZED,
    });
  }

  new BucketDeployment(props.scope, "Deployment", {
    destinationBucket: bucket,
    sources: [Source.asset(`${props.buildDirectory}/client`)],
    distribution,
    memoryLimit: 3008,
  });

  new CfnOutput(props.scope, "CloudFrontDomain", {
    value: distribution.domainName,
  });

  return distribution;
}
