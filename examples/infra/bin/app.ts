import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { App } from "aws-cdk-lib";

import { BasicBunNodeStack } from "../lib/basic-bun-node-stack.js";
import { BasicEsbNodeStack } from "../lib/basic-esb-node-stack.js";
import { BasicHttpApiNodeStack } from "../lib/basic-httpapi-node-stack.js";
import { LocalNodeStack } from "../lib/local-node-stack.js";
import { StreamingBunBunStack } from "../lib/streaming-bun-bun-stack.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, "../..");

const app = new App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? "000000000000",
  region: process.env.CDK_DEFAULT_REGION ?? "eu-central-1",
};

if (process.env.LOCAL_INTEG) {
  new LocalNodeStack(app, "LocalEsbNode", join(examplesDir, "basic/build-esb"), { env });
  new LocalNodeStack(app, "LocalBunNode", join(examplesDir, "basic/build-bun"), { env });
} else {
  const ts = process.env.INTEG_TIMESTAMP ?? Date.now().toString();
  new BasicEsbNodeStack(app, `KitOnLambdaInteg-EsbNode-${ts}`, { env });
  new BasicBunNodeStack(app, `KitOnLambdaInteg-BunNode-${ts}`, { env });
  new BasicHttpApiNodeStack(app, `KitOnLambdaInteg-HttpApiNode-${ts}`, { env });
  new StreamingBunBunStack(app, `KitOnLambdaInteg-BunBun-${ts}`, { env });
}
