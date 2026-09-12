/**
 * Tool parameters Copilot passes when it invokes StaleCameraFeedsTool.
 *
 * Exported as JSON Schema so the Copilot host can describe and validate the
 * tool's arguments. Both fields are optional — asking "which cameras have
 * stale feeds?" with no qualifiers is the common case.
 */
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

const propertiesSchema = z.object({
  floor: z
    .number()
    .int()
    .optional()
    .describe('Restrict results to a single garage floor, for example 5.'),
  thresholdMinutes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Treat a camera snapshot as stale once it is older than this many minutes. Defaults to the server-configured threshold (15).'
    )
});

export type IStaleCameraFeedsCopilotComponentProperties = z.infer<typeof propertiesSchema>;

export default zodToJsonSchema(propertiesSchema);
