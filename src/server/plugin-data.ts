import type { GarageToolResult } from "../shared/contracts.js";

/**
 * The API plugin exists to ground Copilot's prose. Camera previews stay on the
 * delegated SPFx route, so the service credential never receives signed image
 * URLs. The paired UX tool renders those images for the signed-in user.
 */
export function toPluginDataResult(result: GarageToolResult): GarageToolResult {
  return {
    ...result,
    bays: result.bays.map(({ imageUrl: _imageUrl, ...bay }) => bay),
    adaptiveCard: undefined,
  };
}
