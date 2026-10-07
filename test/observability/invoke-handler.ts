// Child-process runner for the observability build test.
//
// Imports a built SvelteKit Lambda handler, invokes it once for `/`, then calls
// the span-dump hook the example's instrumentation installs when `KOL_SPAN_SINK`
// is set. Runs in its own process so each build gets a fresh OpenTelemetry SDK
// (two SDKs in one process would clash) and so a top-level `await import` of the
// handler picks up `KOL_SPAN_SINK` from the environment before the SDK starts.
//
// Usage: bun run invoke-handler.ts <path-to-handler.js>
// Requires: KOL_SPAN_SINK=<file> in the environment.
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context as LambdaContext,
} from "aws-lambda";

type Context = Omit<LambdaContext, "done" | "succeed" | "fail">;

declare global {
  // Installed by the example's instrumentation.server.ts when KOL_SPAN_SINK is set.
  // oxlint-disable-next-line no-var -- `var` is required to augment globalThis
  var __dumpSpans: (() => void) | undefined;
}

const handlerPath = process.argv[2];
if (handlerPath == null) {
  console.error("usage: invoke-handler.ts <path-to-handler.js>");
  process.exit(2);
}

let dep0205 = false;
process.on("warning", (warning) => {
  if (warning.message.includes("module.register()")) dep0205 = true;
});

const originToken = "observability-origin-token";
process.env.ORIGIN_TOKEN = originToken;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- dynamically imported built handler
const { handler } = (await import(handlerPath)) as {
  handler: (
    event: APIGatewayProxyEventV2,
    context: Context,
  ) => Promise<APIGatewayProxyStructuredResultV2>;
};

const event: APIGatewayProxyEventV2 = {
  version: "2.0",
  routeKey: "GET /",
  rawPath: "/",
  rawQueryString: "",
  headers: { host: "localhost", "x-origin-token": originToken },
  requestContext: {
    accountId: "000000000000",
    apiId: "local",
    domainName: "localhost",
    domainPrefix: "localhost",
    http: {
      method: "GET",
      path: "/",
      protocol: "HTTP/1.1",
      sourceIp: "127.0.0.1",
      userAgent: "observability-test",
    },
    requestId: "test-request",
    routeKey: "GET /",
    stage: "$default",
    time: new Date().toUTCString(),
    timeEpoch: Date.now(),
  },
  isBase64Encoded: false,
};

const context: Context = {
  functionName: "observability-test",
  functionVersion: "$LATEST",
  invokedFunctionArn: "arn:aws:lambda:eu-central-1:000000000000:function:observability-test",
  memoryLimitInMB: "1024",
  awsRequestId: "test-request",
  logGroupName: "/aws/lambda/observability-test",
  logStreamName: "test",
  getRemainingTimeInMillis: () => 30_000,
  callbackWaitsForEmptyEventLoop: false,
};

const response = await handler(event, context);

// Let the SimpleSpanProcessor flush synchronous span ends.
await new Promise((resolve) => setTimeout(resolve, 250));

const dumpSpans = globalThis.__dumpSpans;
if (dumpSpans == null) {
  console.error("instrumentation did not install __dumpSpans — is KOL_SPAN_SINK set?");
  process.exit(3);
}
dumpSpans();

console.log(`status=${response.statusCode} dep0205=${dep0205}`);
process.exit(0);
