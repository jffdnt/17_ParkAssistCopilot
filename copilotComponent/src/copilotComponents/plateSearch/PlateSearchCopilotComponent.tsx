import * as React from 'react';
import type { ISPCopilotModelContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';

import { BaseGarageComponent } from '../../components/BaseGarageComponent';
import { ParkAssistService, type IGarageResult } from '../../services/ParkAssistService';
import PlateSearch from './components/PlateSearch';
import type { IPlateSearchCopilotComponentProperties } from './PlateSearchCopilotComponentProperties';

import * as strings from 'PlateSearchCopilotComponentStrings';

/** Locates a vehicle in the 5 Bell garage by full or partial license plate. */
export default class PlateSearchCopilotComponent extends BaseGarageComponent<IPlateSearchCopilotComponentProperties> {
  protected loadAsync(service: ParkAssistService): Promise<IGarageResult> {
    return service.searchPlate(this.properties.query);
  }

  protected buildModelContext(result: IGarageResult): ISPCopilotModelContext {
    const lines = result.bays.map(
      (bay) =>
        `- ${bay.plateDisplay ?? 'unknown plate'} at space ${bay.spaceNumber ?? bay.bayId} ` +
        `(bay ${bay.bayId}, floor ${bay.floor ?? 'unknown'})`
    );

    return {
      content: [
        {
          type: 'text',
          text:
            result.totalMatches === 0
              ? `ParkAssist found no occupied spaces matching plate "${this.properties.query}" in the 5 Bell garage (generated ${result.generatedAt}).`
              : `ParkAssist found ${result.totalMatches} match(es) for plate "${this.properties.query}" in the ` +
                `5 Bell garage (generated ${result.generatedAt}). Showing ${result.bays.length}:\n${lines.join('\n')}`
        }
      ],
      structuredContent: {
        garage: result.garage,
        generatedAt: result.generatedAt,
        query: this.properties.query,
        totalMatches: result.totalMatches,
        matches: result.bays.map((bay) => ({
          bayId: bay.bayId,
          spaceNumber: bay.spaceNumber,
          floor: bay.floor,
          plate: bay.plateDisplay
        }))
      }
    };
  }

  protected renderBody(): React.ReactElement {
    return React.createElement(PlateSearch, {
      result: this.result,
      errorMessage: this.errorMessage,
      query: this.properties.query,
      hostContext: this.hostContext,
      targetDocument: this.context.domElement.ownerDocument,
      onRequestDisplayMode: async (mode: SPCopilotDisplayMode) => {
        await this.requestDisplayModeAsync(mode);
      },
      onRefresh: async () => {
        await this.refreshAsync();
      },
      onSummarize: async () => {
        await this.requestNarrationAsync();
      },
      isRefreshing: this.isRefreshing,
      strings
    });
  }
}
