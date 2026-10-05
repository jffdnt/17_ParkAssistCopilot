import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The generative UI page's build output, or undefined when it has not been built. */
export function resolveGenUiDirectory(): string | undefined {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDirectory, "../../genui"),
    path.resolve(moduleDirectory, "../../dist/genui"),
    path.resolve(process.cwd(), "dist/genui"),
  ];
  return candidates.find((candidate) => existsSync(path.join(candidate, "genui.html")));
}

export function resolveWidgetHtmlPath(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDirectory, "../../widget/mcp-app.html"),
    path.resolve(moduleDirectory, "../../dist/widget/mcp-app.html"),
    path.resolve(process.cwd(), "dist/widget/mcp-app.html"),
  ];
  const widgetPath = candidates.find((candidate) => existsSync(candidate));
  if (!widgetPath) {
    throw new Error(`The MCP App bundle is missing. Looked in: ${candidates.join(", ")}`);
  }
  return widgetPath;
}
