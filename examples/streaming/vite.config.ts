import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "kit-on-lambda/bun";
import { defineConfig } from "vite";

export default defineConfig(async () => ({
  plugins: [await sveltekit({ adapter: adapter({ runtime: "bun" }) })],
}));
