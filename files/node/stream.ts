// adjusted code from nitro project
// @see https://github.com/nitrojs/nitro/blob/dfdff9e93d0fa16b48afe5d9f0c44a87b4b5d249/src/presets/aws-lambda/runtime/aws-lambda-streaming.ts
import { createReadableStream } from "@sveltejs/kit/node";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { manifest } from "MANIFEST";
import process from "node:process";
import type { Readable } from "node:stream";
import { Server } from "SERVER";
import { awsRequest, awsResponseHeaders } from "./util.js";

const server = new Server(manifest);
await server.init({
  env: process.env as Record<string, string>,
  read: createReadableStream,
});

export const handler = awslambda.streamifyResponse(
  async (event: APIGatewayProxyEventV2, responseStream, context) => {
    const request = awsRequest(event, context);

    const response = await server.respond(request, {
      getClientAddress() {
        return request.headers.get("x-forwarded-for") ?? "";
      },
    });

    const httpResponseMetadata = {
      statusCode: response.status,
      ...awsResponseHeaders(response, "v2"),
    };

    if (!httpResponseMetadata.headers!["transfer-encoding"]) {
      httpResponseMetadata.headers!["transfer-encoding"] = "chunked";
    }

    const body =
      response.body ??
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue("");
          controller.close();
        },
      });

    const writer = awslambda.HttpResponseStream.from(
      responseStream,
      httpResponseMetadata,
    );

    const reader = body.getReader();
    await streamToNodeStream(reader, responseStream);
    writer.end();
  },
);

async function streamToNodeStream(
  reader: Readable | ReadableStreamDefaultReader,
  writer: NodeJS.WritableStream,
) {
  let readResult = await reader.read();
  while (!readResult.done) {
    writer.write(readResult.value);
    readResult = await reader.read();
  }
  writer.end();
}
