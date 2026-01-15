import {
  BunFunction,
  BunFunctionProps,
  BunLambdaLayer,
} from "@beesolve/lambda-bun-runtime";
import { LambdaKeepActive } from "@beesolve/lambda-keep-active";
import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  AllowedMethods,
  CachePolicy,
  Function as CloudfrontFunction,
  Distribution,
  DistributionProps,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  PriceClass,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import {
  FunctionUrlOrigin,
  HttpOrigin,
} from "aws-cdk-lib/aws-cloudfront-origins";
import { ArnPrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Function, FunctionUrlAuthType } from "aws-cdk-lib/aws-lambda";
import { BlockPublicAccess, Bucket, HttpMethods } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface SvelteKitProps {
  /**
   * @default `${__dirname}/build`
   */
  readonly buildDirectory?: string;

  /**
   * By default Lambda with 1024MB and 10s of timeout is created.
   *
   * You can change any Lambda function options here
   */
  readonly lambdaProps?: Omit<BunFunctionProps, "entrypoint">;

  /**
   * Some sensible CloudFront options are pre-set - you can change them through this setting.
   */
  readonly distributionProps?: Omit<DistributionProps, "defaultBehavior">;

  /**
   * If you provide `basicHttpAuthentication` config the CloudFront function
   * is deployed which will check your username/password against each request
   */
  readonly basicHttpAuthentication?: {
    readonly username: string;
    readonly password: string;
  };

  /**
   * If you wish to use your own instance of LambdaKeepActive for better reuse
   * you can pass it here. If you won't provide an instance it is created internally.
   *
   * @default LambdaKeepActive warmer is created internally
   */
  readonly warmer?: LambdaKeepActive;
}

export class SvelteKit extends Construct {
  readonly distribution: Distribution;
  readonly handler: Function;

  constructor(scope: Construct, id: string, props: SvelteKitProps = {}) {
    super(scope, id);

    const {
      buildDirectory = `${__dirname}/build`,
      lambdaProps = {
        bunLayer: new BunLambdaLayer(this, "BunLayer"),
      } satisfies Omit<BunFunctionProps, "entrypoint">,
      distributionProps,
    } = props;

    const handler = new BunFunction(this, "Handler", {
      entrypoint: `${buildDirectory}/server/handler.js`,
      memorySize: 1024,
      timeout: Duration.seconds(10),
      ...lambdaProps,
    });

    const warmer = props.warmer ?? new LambdaKeepActive(this, "KeepActive");
    warmer.keepActive(handler);

    const originToken = new Secret(handler, "OriginToken", {
      description: `x-origin-token for ${handler.node.path}.`,
      removalPolicy: RemovalPolicy.DESTROY,
      generateSecretString: { passwordLength: 128, excludePunctuation: true },
    }).secretValue.toString();

    handler.addEnvironment("ORIGIN_TOKEN", originToken);

    const url = handler.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
      },
    });

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
        origin: new FunctionUrlOrigin(url, {
          customHeaders: {
            "x-origin-token": originToken,
          },
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

    import(`${buildDirectory}/routes.json`, {
      with: { type: "json" },
    }).then(({ default: routes }: { default: string[] }) => {
      routes.forEach((route) => {
        distribution.addBehavior(route, s3Origin, {
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          originRequestPolicy: OriginRequestPolicy.USER_AGENT_REFERER_HEADERS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        });
      });
    });

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
}
