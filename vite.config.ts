import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const input = process.env.INPUT;

if (!input) {
  throw new Error("INPUT must point to the MCP App HTML entry file.");
}

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    cssMinify: true,
    emptyOutDir: false,
    minify: true,
    outDir: "dist/widget",
    rollupOptions: { input },
  },
});
