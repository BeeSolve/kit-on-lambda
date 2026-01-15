import { createReadableStream } from "@sveltejs/kit/node";
import { Server } from "SERVER";
import { manifest } from "MANIFEST";
import process from "node:process";

const server = new Server(manifest);

await server.init({
  env: /** @type {Record<string, string>} */ (process.env),
  read: createReadableStream,
});

export default {
  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  fetch: async (request) => {
    return await server.respond(request, {
      getClientAddress() {
        return /** @type {string} */ (request.headers.get("x-forwarded-for"));
      },
    });
  },
};
