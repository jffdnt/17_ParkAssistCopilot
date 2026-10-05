import { formatDuration } from "../status-categories.js";
import { isLayout, type HydratedNode, type HydratedSpec } from "./spec.js";

/**
 * A plain-text account of a hydrated view: what the model is told it drew.
 *
 * Two jobs. The model's closing sentence can quote these values, which came
 * from the snapshot, instead of inventing its own. And earlier turns are sent
 * back as this summary rather than the full view, which keeps chat history
 * under the server's 100 KB JSON body limit however long the conversation
 * runs.
 */
export function summarizeView(view: HydratedSpec): string {
  const lines = [`Rendered "${view.title}" (data as of ${view.asOf}).`];
  const visit = (node: HydratedNode) => {
    if (isLayout(node)) {
      node.children.forEach(visit);
      return;
    }
    const resolved = node.resolved;
    switch (resolved.kind) {
      case "metric":
        lines.push(`- ${resolved.label}: ${resolved.value}${resolved.unit ?? ""}`);
        break;
      case "duration":
        lines.push(
          resolved.minutes === undefined
            ? `- ${resolved.label}: none (no bays with this measure)`
            : `- ${resolved.label}: ${formatDuration(resolved.minutes)} (${resolved.minutes} minutes, over ${resolved.of} bays)`,
        );
        break;
      case "gauge":
        lines.push(`- ${resolved.label}: ${resolved.percent}% (${resolved.occupied} of ${resolved.of})`);
        break;
      case "series":
        lines.push(`- ${resolved.label} (total ${resolved.total}): ${resolved.rows.map((row) => `${row.label} ${row.value}`).join(", ")}`);
        break;
      case "bays":
        lines.push(
          `- ${resolved.label}: ${resolved.shown} of ${resolved.total} shown` +
            (resolved.rows.length > 0
              ? `; first: ${resolved.rows.slice(0, 5).map((row) => `space ${row.spaceNumber} (floor ${row.floor}, ${row.status})`).join("; ")}`
              : ""),
        );
        break;
      case "plates":
        lines.push(
          `- Plate search ${resolved.query}: ${resolved.total} match${resolved.total === 1 ? "" : "es"}` +
            (resolved.rows.length > 0
              ? `; ${resolved.rows.slice(0, 5).map((row) => `${row.plateDisplay ?? "?"} in space ${row.spaceNumber}, floor ${row.floor}`).join("; ")}`
              : ""),
        );
        break;
      case "camera":
        lines.push(`- Camera preview for space ${resolved.spaceNumber ?? resolved.bayId}${resolved.floor ? `, floor ${resolved.floor}` : ""}`);
        break;
      case "text":
        lines.push(`- Text: ${resolved.text}`);
        break;
    }
  };
  visit(view.root);
  return lines.join("\n");
}
