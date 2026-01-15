import { Adapter } from "@sveltejs/kit";
import { CompileBuildConfig } from "bun";

declare global {
  const ENV_PREFIX: string;
}

interface AdapterOptions {
  out?: string;
  precompress?: boolean;
  /**
   * @default { minify: true, sourcemap: 'linked', splitting: true }
   */
  buildOptions?: Pick<CompileBuildConfig, "minify" | "sourcemap" | "splitting">;
}

export default function plugin(options?: AdapterOptions): Adapter;
