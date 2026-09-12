/**
 * Tool parameters Copilot passes when it invokes AvailableSpacesTool.
 * Both filters are optional — "where can I park?" is the common case.
 */
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

const propertiesSchema = z.object({
  floors: z
    .string()
    .optional()
    .describe(
      'Which garage floors to search, as a comma-separated list or a range: "5" for one floor, ' +
        '"7-9" for floors 7 through 9, "2,5,9" for specific floors. Always pass this when the ' +
        'user names any floor, including a range. Omit it to search the whole garage.'
    ),
  designation: z
    .string()
    .optional()
    .describe('Restrict results to a space designation, for example General, Compact, or EV.')
});

export type IAvailableSpacesCopilotComponentProperties = z.infer<typeof propertiesSchema>;

export default zodToJsonSchema(propertiesSchema);
