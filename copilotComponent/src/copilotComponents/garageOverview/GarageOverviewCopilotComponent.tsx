import * as React from 'react';
import type { ISPCopilotModelContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';

import { BaseGarageComponent } from '../../components/BaseGarageComponent';
import { ParkAssistService, type IGarageResult } from '../../services/ParkAssistService';
import GarageOverview from './components/GarageOverview';

import * as strings from 'GarageOverviewCopilotComponentStrings';

/** Garage-wide occupancy and camera-health summary for the 5 Bell garage. */
export default class GarageOverviewCopilotComponent extends BaseGarageComponent<Record<string, never>> {
  protected loadAsync(service: ParkAssistService): Promise<IGarageResult> {
    return service.getOverview();
  }

  protected buildModelContext(result: IGarageResult): ISPCopilotModelContext {
    const m = result.metrics;
    return {
      content: [
        {
          type: 'text',
          text:
            `ParkAssist 5 Bell garage overview generated ${result.generatedAt} ` +
            `(stale threshold ${result.staleAfterMinutes} minutes): ` +
            `${m.configured ?? 'unknown'} configured spaces, ${m.live ?? 'unknown'} reporting live, ` +
            `${m.available ?? 'unknown'} available, ${m.occupied ?? 'unknown'} occupied, ` +
            `${m.reserved ?? 'unknown'} reserved, ${m.outOfService ?? 'unknown'} out of service, ` +
            `${m.occupancyPercent ?? 'unknown'}% occupancy. Camera health: ` +
            `${m.staleFeeds ?? 'unknown'} stale feeds, ${m.missingFeeds ?? 'unknown'} missing feeds, ` +
            `${m.offlineSensors ?? 'unknown'} offline sensors.`
        }
      ],
      structuredContent: {
        garage: result.garage,
        generatedAt: result.generatedAt,
        staleAfterMinutes: result.staleAfterMinutes,
        metrics: m as unknown as Record<string, unknown>
      }
    };
  }

  protected renderBody(): React.ReactElement {
    return React.createElement(GarageOverview, {
      result: this.result,
      errorMessage: this.errorMessage,
      hostContext: this.hostContext,
      targetDocument: this.context.domElement.ownerDocument,
      onRequestDisplayMode: async (mode: SPCopilotDisplayMode) => {
        await this.requestDisplayModeAsync(mode);
      },
      strings
    });
  }
}
