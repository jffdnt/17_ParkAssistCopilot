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
  floors: z
    .string()
    .optional()
    .describe(
      'Which garage floors to check, as a comma-separated list or a range: "7" for one floor, ' +
        '"7-9" for floors 7 through 9, "2,5,9" for specific floors. Always pass this when the ' +
        'user names any floor, including a range. Omit it only for the whole garage.'
    ),
  thresholdMinutes: z
    .number()
    .int()
    .optional()
    .describe(
      'Treat a camera snapshot as stale once it is older than this many minutes. Defaults to the server-configured threshold (15).'
    )
});

export type IStaleCameraFeedsCopilotComponentProperties = z.infer<typeof propertiesSchema>;

export default zodToJsonSchema(propertiesSchema);
