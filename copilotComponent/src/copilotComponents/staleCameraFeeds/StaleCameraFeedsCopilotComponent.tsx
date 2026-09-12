import * as React from 'react';
import type { ISPCopilotModelContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';

import { BaseGarageComponent } from '../../components/BaseGarageComponent';
import { ParkAssistService, type IGarageResult } from '../../services/ParkAssistService';
import StaleCameraFeeds from './components/StaleCameraFeeds';
import type { IStaleCameraFeedsCopilotComponentProperties } from './StaleCameraFeedsCopilotComponentProperties';

import * as strings from 'StaleCameraFeedsCopilotComponentStrings';

/** Stale and missing camera feeds for the 5 Bell garage. */
export default class StaleCameraFeedsCopilotComponent extends BaseGarageComponent<IStaleCameraFeedsCopilotComponentProperties> {
  protected loadAsync(service: ParkAssistService): Promise<IGarageResult> {
    return service.getStaleFeeds({
      floor: this.properties.floor,
      thresholdMinutes: this.properties.thresholdMinutes
    });
  }

  protected buildModelContext(result: IGarageResult): ISPCopilotModelContext {
    const floorLabel = this.properties.floor === undefined ? 'all floors' : `floor ${this.properties.floor}`;
    const lines = result.bays.map((bay) => {
      const age =
        bay.feedState === 'missing' || bay.thumbnailAgeMinutes === undefined
          ? 'no telemetry'
          : `${Math.round(bay.thumbnailAgeMinutes)} min old`;
      return `- Space ${bay.spaceNumber ?? bay.bayId} (bay ${bay.bayId}, floor ${bay.floor ?? 'unknown'}): ${age}`;
    });

    return {
      content: [
        {
          type: 'text',
          text:
            `ParkAssist found ${result.totalMatches} stale or missing camera feeds across ${floorLabel} ` +
            `in the 5 Bell garage (threshold ${result.staleAfterMinutes} minutes, generated ${result.generatedAt}). ` +
            `Showing ${result.bays.length}:\n${lines.join('\n')}`
        }
      ],
      structuredContent: {
        garage: result.garage,
        generatedAt: result.generatedAt,
        staleAfterMinutes: result.staleAfterMinutes,
        totalMatches: result.totalMatches,
        floor: this.properties.floor ?? null,
        bays: result.bays.map((bay) => ({
          bayId: bay.bayId,
          spaceNumber: bay.spaceNumber,
          floor: bay.floor,
          feedState: bay.feedState,
          thumbnailAgeMinutes: bay.thumbnailAgeMinutes
        }))
      }
    };
  }

  protected renderBody(): React.ReactElement {
    return React.createElement(StaleCameraFeeds, {
      result: this.result,
      errorMessage: this.errorMessage,
      floor: this.properties.floor,
      hostContext: this.hostContext,
      targetDocument: this.context.domElement.ownerDocument,
      onRequestDisplayMode: async (mode: SPCopilotDisplayMode) => {
        await this.requestDisplayModeAsync(mode);
      },
      strings
    });
  }
}
