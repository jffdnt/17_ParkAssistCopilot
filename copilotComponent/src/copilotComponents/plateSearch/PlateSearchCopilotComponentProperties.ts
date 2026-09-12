/**
 * Tool parameters Copilot passes when it invokes PlateSearchTool.
 *
 * The three-character minimum is enforced server-side as well — the Copilot
 * v2.4 parameter subset drops constraints like `minLength`, so the schema here
 * is descriptive rather than authoritative.
 */
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

const propertiesSchema = z.object({
  query: z
    .string()
    .describe('Full or partial license plate text. At least three letters or numbers are required.')
});

export type IPlateSearchCopilotComponentProperties = z.infer<typeof propertiesSchema>;

export default zodToJsonSchema(propertiesSchema);
