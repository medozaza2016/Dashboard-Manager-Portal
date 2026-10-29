import { defineConfig } from "vite";

export default defineConfig({
  // Keep the initial self-contained HTML prototype as the build entry point.
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
