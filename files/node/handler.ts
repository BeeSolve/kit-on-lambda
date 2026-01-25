// adjusted code from nitro project
// @see https://github.com/nitrojs/nitro/blob/dfdff9e93d0fa16b48afe5d9f0c44a87b4b5d249/src/presets/aws-lambda/runtime/aws-lambda.ts
import { createReadableStream } from "@sveltejs/kit/node";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import { manifest } from "MANIFEST";
import process from "node:process";
import { isAPIGatewayProxyEvent } from "runtime.js";
import { Server } from "SERVER";
import { awsRequest, awsResponseBody, awsResponseHeaders } from "./util.js";

const server = new Server(manifest);

await server.init({
  env: process.env as Record<string, string>,
  read: createReadableStream,
});

export async function handler(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResult | APIGatewayProxyResultV2> {
  const request = awsRequest(event, context);

  const response = await server.respond(request, {
    getClientAddress() {
      return request.headers.get("x-forwarded-for") ?? "";
    },
  });

  return {
    statusCode: response.status,
    ...awsResponseHeaders(
      response,
      isAPIGatewayProxyEvent(event) ? "v1" : "v2",
    ),
    ...(await awsResponseBody(response)),
  };
}
