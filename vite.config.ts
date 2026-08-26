import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    port: 8686,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
