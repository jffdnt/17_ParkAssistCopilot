import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const input = process.env.INPUT;

if (!input) {
  throw new Error("INPUT must point to the MCP App HTML entry file.");
}

// The generative UI page is an ordinary multi-file site served by Express at
// /genui. The MCP App widget must stay a single inlined HTML file.
const isGenUi = input === "genui.html";

export default defineConfig({
  base: isGenUi ? "/genui/" : "/",
  plugins: isGenUi ? [react()] : [react(), viteSingleFile()],
  build: {
    cssMinify: true,
    emptyOutDir: isGenUi,
    minify: true,
    outDir: isGenUi ? "dist/genui" : "dist/widget",
    rollupOptions: { input },
  },
});
