/**
 * Tool parameters Copilot passes when it invokes AvailableSpacesTool.
 * Both filters are optional — "where can I park?" is the common case.
 */
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

const propertiesSchema = z.object({
  floor: z
    .number()
    .int()
    .optional()
    .describe('Restrict results to a single garage floor, for example 5.'),
  designation: z
    .string()
    .optional()
    .describe('Restrict results to a space designation, for example General, Compact, or EV.')
});

export type IAvailableSpacesCopilotComponentProperties = z.infer<typeof propertiesSchema>;

export default zodToJsonSchema(propertiesSchema);
