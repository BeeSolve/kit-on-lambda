import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import process from "node:process";

import { getAwsContext, getAwsEvent } from "@beesolve/lambda-fetch-api";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context as LambdaContext,
} from "aws-lambda";

type Context = Omit<LambdaContext, "done" | "succeed" | "fail">;

const originToken = "test-origin-token";

let originalToken: string | undefined;

const mockRespond = mock(
  async (_req: Request, _opts: { getClientAddress(): string }) =>
    new Response("ok", { headers: { "content-type": "text/plain" } }),
);

void mock.module("SERVER", () => ({
  server: {
    async init() {},
    respond: mockRespond,
  },
}));

void mock.module("@sveltejs/kit/node", () => ({ createReadableStream: () => {} }));

const { handler } = await import("./handler.js");

// The handler's result type includes a `void` arm from the keep-active wrapper
// (a keep-active ping short-circuits before rendering). Every test here sends a
// real HTTP event, so it narrows the result to the v2 structured arm at a single
// audited point instead of scattering assertions.
type HandlerResult = Awaited<ReturnType<typeof handler>>;

function asV2Result(result: HandlerResult): APIGatewayProxyStructuredResultV2 {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test sent a real v2 event, so the result is the v2 structured arm
  return result as APIGatewayProxyStructuredResultV2;
}

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: "/",
    rawQueryString: "",
    headers: { host: "example.com", "x-origin-token": originToken },
    requestContext: {
      accountId: "123456789",
      apiId: "test",
      domainName: "example.com",
      domainPrefix: "test",
      http: {
        method: "GET",
        path: "/",
        protocol: "HTTP/1.1",
        sourceIp: "1.2.3.4",
        userAgent: "test",
      },
      requestId: "test-request-id",
      routeKey: "$default",
      stage: "$default",
      time: "01/Jan/2024:00:00:00 +0000",
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    ...overrides,
  };
}

function makeContext(overrides: Partial<Context> = {}): Context {
  return {
    functionName: "test-function",
    functionVersion: "$LATEST",
    invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789:function:test",
    memoryLimitInMB: "128",
    awsRequestId: "test-request-id",
    logGroupName: "/aws/lambda/test",
    logStreamName: "2024/01/01/[$LATEST]test",
    getRemainingTimeInMillis: () => 5000,
    callbackWaitsForEmptyEventLoop: false,
    ...overrides,
  };
}

describe("bun handler", () => {
  beforeEach(() => {
    originalToken = process.env.ORIGIN_TOKEN;
    process.env.ORIGIN_TOKEN = originToken;
    mockRespond.mockReset();
    mockRespond.mockImplementation(
      async () => new Response("ok", { headers: { "content-type": "text/plain" } }),
    );
  });

  afterEach(() => {
    if (originalToken == null) {
      delete process.env.ORIGIN_TOKEN;
      return;
    }
    process.env.ORIGIN_TOKEN = originalToken;
  });

  it("returns the response status code", async () => {
    mockRespond.mockImplementation(async () => new Response("not found", { status: 404 }));

    const result = asV2Result(await handler(makeEvent(), makeContext()));

    expect(result.statusCode).toBe(404);
  });

  it("returns response headers", async () => {
    mockRespond.mockImplementation(
      async () =>
        new Response("ok", {
          headers: { "content-type": "text/plain", "x-custom": "value" },
        }),
    );

    const result = asV2Result(await handler(makeEvent(), makeContext()));

    expect(result.headers?.["content-type"]).toBe("text/plain");
    expect(result.headers?.["x-custom"]).toBe("value");
  });

  it("routes set-cookie to cookies array, not headers", async () => {
    mockRespond.mockImplementation(async () => {
      const res = new Response("ok");
      res.headers.append("set-cookie", "sessionId=abc; Path=/");
      res.headers.append("set-cookie", "theme=dark; Path=/");
      return res;
    });

    const result = asV2Result(await handler(makeEvent(), makeContext()));

    expect(result.headers?.["set-cookie"]).toBeUndefined();
    expect(result.cookies).toEqual(["sessionId=abc; Path=/", "theme=dark; Path=/"]);
  });

  it("returns text body as a plain string", async () => {
    mockRespond.mockImplementation(
      async () => new Response("hello world", { headers: { "content-type": "text/plain" } }),
    );

    const result = asV2Result(await handler(makeEvent(), makeContext()));

    expect(result.body).toBe("hello world");
    expect(result.isBase64Encoded).toBeUndefined();
  });

  it("base64-encodes binary responses", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    mockRespond.mockImplementation(
      async () => new Response(bytes, { headers: { "content-type": "image/png" } }),
    );

    const result = asV2Result(await handler(makeEvent(), makeContext()));

    expect(result.isBase64Encoded).toBe(true);
    expect(result.body).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("passes x-forwarded-for as the client address", async () => {
    let capturedAddress = "";
    mockRespond.mockImplementation(async (_req, opts) => {
      capturedAddress = opts.getClientAddress();
      return new Response("ok");
    });

    await handler(
      makeEvent({
        headers: {
          host: "example.com",
          "x-forwarded-for": "1.2.3.4",
          "x-origin-token": originToken,
        },
      }),
      makeContext(),
    );

    expect(capturedAddress).toBe("1.2.3.4");
  });

  it("returns empty string when x-forwarded-for is absent", async () => {
    let capturedAddress = "sentinel";
    mockRespond.mockImplementation(async (_req, opts) => {
      capturedAddress = opts.getClientAddress();
      return new Response("ok");
    });

    await handler(makeEvent(), makeContext());

    expect(capturedAddress).toBe("");
  });

  it("makes the event accessible via getAwsEvent() inside the handler", async () => {
    let capturedEvent: unknown;
    mockRespond.mockImplementation(async () => {
      capturedEvent = getAwsEvent();
      return new Response("ok");
    });

    const event = makeEvent();
    await handler(event, makeContext());

    expect(capturedEvent).toBe(event);
  });

  it("makes the Lambda context accessible via getAwsContext() inside the handler", async () => {
    let capturedContext: unknown;
    mockRespond.mockImplementation(async () => {
      capturedContext = getAwsContext();
      return new Response("ok");
    });

    const context = makeContext();
    await handler(makeEvent(), context);

    expect(capturedContext).toBe(context);
  });

  it("short-circuits keep-active pings without rendering", async () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keep-active pings arrive as a non-HTTP event payload
    const pingEvent = { $$keepActivePing$$: true } as unknown as APIGatewayProxyEventV2;

    const result = await handler(pingEvent, makeContext());

    expect(result).toBeUndefined();
    expect(mockRespond).not.toHaveBeenCalled();
  });

  describe("origin token", () => {
    it("rejects requests without a valid origin token", async () => {
      const result = asV2Result(
        await handler(makeEvent({ headers: { host: "example.com" } }), makeContext()),
      );

      expect(result.statusCode).toBe(403);
      expect(mockRespond).not.toHaveBeenCalled();
    });

    it("passes requests through when ORIGIN_TOKEN is not configured", async () => {
      delete process.env.ORIGIN_TOKEN;

      const result = asV2Result(
        await handler(makeEvent({ headers: { host: "example.com" } }), makeContext()),
      );

      expect(result.statusCode).toBe(200);
      expect(mockRespond).toHaveBeenCalled();
    });
  });
});
