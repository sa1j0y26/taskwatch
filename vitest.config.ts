import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: [],
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
})
