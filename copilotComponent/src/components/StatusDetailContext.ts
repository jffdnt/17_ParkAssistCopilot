import * as React from 'react';
import type { GarageStatus, IStatusDetail } from '../services/ParkAssistService';

/**
 * Loads the drill-down behind a dashboard tile. Provided once by
 * BaseGarageComponent, so every view that renders LiveMetrics gets clickable
 * tiles without threading a callback through its own props. Undefined (the
 * default) leaves the tiles static.
 */
export type StatusDetailLoader = (status: GarageStatus) => Promise<IStatusDetail>;

export const StatusDetailContext: React.Context<StatusDetailLoader | undefined> = React.createContext<
  StatusDetailLoader | undefined
>(undefined);
