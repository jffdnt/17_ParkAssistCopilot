/**
 * Tool parameters for GarageOverviewTool. The overview is garage-wide, so it
 * takes no arguments — the schema is intentionally empty.
 */
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

const propertiesSchema = z.object({});

export type IGarageOverviewCopilotComponentProperties = z.infer<typeof propertiesSchema>;

export default zodToJsonSchema(propertiesSchema);
