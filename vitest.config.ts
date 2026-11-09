import { defineConfig } from "vitest/config";

// Its own configuration on purpose. The site's vite.config.ts carries the
// Cloudflare plugin, which refuses to share an environment with the test
// runner; nothing under test needs a Worker to run.
export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "worker/**/*.test.ts", "relay/**/*.test.mjs"],
    environment: "node",
  },
});
