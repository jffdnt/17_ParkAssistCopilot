import * as React from 'react';
import type { GarageStatus, IStatusDetail } from '../services/ParkAssistService';
import type { IDrilldownContext } from './drilldownModel';

/**
 * What a drill-down needs from the Copilot Component hosting it. Provided once
 * by BaseGarageComponent, so every view that renders LiveMetrics gets
 * clickable tiles without threading callbacks through its own props.
 * Undefined (the default) leaves the tiles static.
 */
export interface IDrilldownHost {
  /** Fetch every bay behind one dashboard tile. */
  load: (status: GarageStatus) => Promise<IStatusDetail>;
  /**
   * Tell Copilot what the drill-down is showing, or that it closed. Published
   * alongside the dashboard's own facts and debounced, so it is safe to call on
   * every filter change.
   */
  publishView: (view: IDrilldownContext | undefined) => void;
  /** Publish the latest view now, then ask Copilot to describe it. */
  askAboutView: () => Promise<void>;
}

export const DrilldownHostContext: React.Context<IDrilldownHost | undefined> = React.createContext<
  IDrilldownHost | undefined
>(undefined);
