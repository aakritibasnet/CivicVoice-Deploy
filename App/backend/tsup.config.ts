import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  outDir: "dist",
  format: ["cjs"],
  target: "node22",
  splitting: false,
  sourcemap: false,
  clean: true,
  bundle: true,
  shims: true, // replaces import.meta.url with __filename equivalent
});
