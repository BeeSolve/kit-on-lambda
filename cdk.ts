import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BunFunctionProps } from "@beesolve/lambda-bun-runtime";
import { BunFunction, BunLambdaLayer } from "@beesolve/lambda-bun-runtime";
import { LambdaKeepActive } from "@beesolve/lambda-keep-active";
import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import type { DistributionProps, OriginBase } from "aws-cdk-lib/aws-cloudfront";
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
  /**
   * Path to the SvelteKit build output directory.
   *
   * @default resolve("./build")
   */
  readonly buildDirectory?: string;

  /**
   * Override pre-set CloudFront distribution options. The `defaultBehavior` is managed
   * internally and cannot be overridden here.
   */
  readonly distributionProps?: Omit<DistributionProps, "defaultBehavior">;

  /**
   * If provided, a CloudFront function is deployed that checks Basic HTTP authentication
   * credentials against each request.
   */
  readonly basicHttpAuthentication?: {
    readonly username: string;
    readonly password: string;
  };

  /**
   * Provide your own LambdaKeepActive instance for reuse across multiple constructs.
   *
   * @default A new LambdaKeepActive warmer is created internally.
   */
  readonly warmer?: LambdaKeepActive;

  /**
   * Factory function that creates the default CloudFront origin from the SvelteKit Lambda handler.
   *
   * The construct passes `handler` and `invokeMode` to this function internally.
   * Override this to use a custom origin (e.g., HTTP API Gateway).
   *
   * @default Function URL origin with secret-based origin token.
   */
  readonly toDefaultOrigin?: (props: {
    /**
     * SvelteKit Lambda handler.
     */
    readonly handler: Function;
    /**
     * InvokeMode selected for this deployment.
     */
    readonly invokeMode?: InvokeMode;
  }) => OriginBase;
};

type SvelteKitProps =
  | (BaseProps & {
      readonly runtime: "node";

      /**
       * @default InvokeMode.RESPONSE_STREAM
       */
      readonly invokeMode?: InvokeMode;

      /**
       * By default Lambda with 1024MB and 10s of timeout is created.
       * By default ARM architecture and Node.js 24 is used.
       *
       * You can change any Lambda function options here.
       */
      readonly lambdaProps?: Omit<
        NodejsFunctionProps,
        "entrypoint" | "bundling" | "entry" | "code" | "handler"
      >;
    })
  | (BaseProps & {
      readonly runtime: "bun";

      /**
       * @default InvokeMode.RESPONSE_STREAM
       */
      readonly invokeMode?: InvokeMode;

      /**
       * By default Lambda with 1024MB and 10s of timeout is created.
       *
       * You can change any Lambda function options here.
       */
      readonly lambdaProps?: Omit<BunFunctionProps, "entrypoint">;
    });

export class SvelteKit extends Construct {
  readonly distribution: Distribution;
  readonly handler: Function;

  constructor(
    scope: Construct,
    id: string,
    props: SvelteKitProps = {
      runtime: "node",
    },
  ) {
    super(scope, id);

    const {
      buildDirectory = resolve(`./build`),
      distributionProps,
      toDefaultOrigin = toFunctionUrlOrigin(),
    } = props;

    const handler = this.toHandler(props, buildDirectory);

    const warmer = props.warmer ?? new LambdaKeepActive(this, "KeepActive");
    warmer.keepActive(handler);

    const bucket = new Bucket(this, "Assets", {
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

    const distribution = new Distribution(this, "Distribution", {
      comment: `${this.node.path} SvelteKit distribution.`,
      defaultBehavior: {
        origin: toDefaultOrigin({
          handler,
          invokeMode: props.invokeMode,
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        functionAssociations:
          props.basicHttpAuthentication != null
            ? [
                {
                  eventType: FunctionEventType.VIEWER_REQUEST,
                  function: new CloudfrontFunction(this, "AuthHandler", {
                    runtime: FunctionRuntime.JS_2_0,
                    code: FunctionCode.fromInline(`async function handler(event) {
            const request = event.request;
            var authString = 'Basic ' + Buffer.from("${props.basicHttpAuthentication.username}" + ':' + "${props.basicHttpAuthentication.password}").toString('base64');
            // Check for Authorization header
            if (request.headers.authorization && request.headers.authorization.value === authString) {
                return request;
            }
            // If authorization fails, return a 401 Unauthorized response
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
      },
      priceClass: PriceClass.PRICE_CLASS_100,
      ...distributionProps,
    });

    const routes: Array<string> = JSON.parse(
      readFileSync(resolve(buildDirectory, "routes.json"), "utf-8"),
    );
    for (const route of routes) {
      distribution.addBehavior(route, s3Origin, {
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        originRequestPolicy: OriginRequestPolicy.USER_AGENT_REFERER_HEADERS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      });
    }

    new BucketDeployment(this, "Deployment", {
      destinationBucket: bucket,
      sources: [Source.asset(`${buildDirectory}/client`)],
      distribution,
      memoryLimit: 3008,
    });

    new CfnOutput(this, "CloudFrontDomain", {
      value: distribution.domainName,
    });

    this.distribution = distribution;
    this.handler = handler;
  }

  private readonly toHandler = (props: SvelteKitProps, buildDirectory: string) => {
    if (props.runtime === "bun") {
      const {
        invokeMode = InvokeMode.RESPONSE_STREAM,
        lambdaProps = {
          bunLayer: new BunLambdaLayer(this, "BunLayer"),
        } satisfies Omit<BunFunctionProps, "entrypoint">,
      } = props;

      return new BunFunction(this, "Handler", {
        entrypoint: `${buildDirectory}/server/${invokeMode === InvokeMode.RESPONSE_STREAM ? "stream" : "handler"}.js`,
        memorySize: 1024,
        timeout: Duration.seconds(10),
        loggingFormat: LoggingFormat.JSON,
        ...lambdaProps,
      });
    }
    if (props.runtime === "node") {
      const { invokeMode = InvokeMode.RESPONSE_STREAM, lambdaProps = {} } = props;

      const { logGroup, ...rest } = lambdaProps;

      return new NodejsFunction(this, "Handler", {
        memorySize: 1024,
        timeout: Duration.seconds(10),
        code: Code.fromAsset(`${buildDirectory}/server/`),
        handler: `${invokeMode === InvokeMode.RESPONSE_STREAM ? "stream" : "handler"}.handler`,
        runtime: Runtime.NODEJS_24_X,
        architecture: Architecture.ARM_64,
        loggingFormat: LoggingFormat.JSON,
        logGroup:
          logGroup ??
          new LogGroup(this, "HandlerLogGroup", {
            retention: RetentionDays.TWO_WEEKS,
            removalPolicy: RemovalPolicy.DESTROY,
          }),
        ...rest,
      });
    }

    assertUnreachable(props);
  };
}

function toFunctionUrlOrigin() {
  return (props: { handler: Function; invokeMode?: InvokeMode }): OriginBase => {
    const originToken = new Secret(props.handler, "OriginToken", {
      description: `x-origin-token for ${props.handler.node.path}.`,
      removalPolicy: RemovalPolicy.DESTROY,
      generateSecretString: { passwordLength: 128, excludePunctuation: true },
    }).secretValue.toString();

    props.handler.addEnvironment("ORIGIN_TOKEN", originToken);

    const invokeMode = props.invokeMode ?? InvokeMode.RESPONSE_STREAM;

    const url = props.handler.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      invokeMode,
      cors: {
        allowedOrigins: ["*"],
      },
    });

    return new FunctionUrlOrigin(url, {
      customHeaders: {
        "x-origin-token": originToken,
      },
    });
  };
}
