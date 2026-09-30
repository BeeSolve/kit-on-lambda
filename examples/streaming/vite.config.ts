import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "kit-on-lambda/bun";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter({ runtime: "bun" }) })],
});
