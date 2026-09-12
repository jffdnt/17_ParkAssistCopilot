import * as React from 'react';
import type { ISPCopilotModelContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';

import { BaseGarageComponent } from '../../components/BaseGarageComponent';
import { ParkAssistService, type IGarageResult } from '../../services/ParkAssistService';
import AvailableSpaces from './components/AvailableSpaces';
import type { IAvailableSpacesCopilotComponentProperties } from './AvailableSpacesCopilotComponentProperties';

import * as strings from 'AvailableSpacesCopilotComponentStrings';

/** Live vacant, in-service parking spaces for the 5 Bell garage. */
export default class AvailableSpacesCopilotComponent extends BaseGarageComponent<IAvailableSpacesCopilotComponentProperties> {
  protected loadAsync(service: ParkAssistService): Promise<IGarageResult> {
    return service.getAvailableSpaces({
      floor: this.properties.floor,
      designation: this.properties.designation
    });
  }

  protected buildModelContext(result: IGarageResult): ISPCopilotModelContext {
    const filters = [
      this.properties.floor === undefined ? undefined : `floor ${this.properties.floor}`,
      this.properties.designation ? `designation ${this.properties.designation}` : undefined
    ].filter(Boolean);
    const scope = filters.length > 0 ? filters.join(' and ') : 'all floors';

    const lines = result.bays.map(
      (bay) =>
        `- Space ${bay.spaceNumber ?? bay.bayId} (bay ${bay.bayId}, floor ${bay.floor ?? 'unknown'}` +
        `${bay.designation ? `, ${bay.designation}` : ''})`
    );

    return {
      content: [
        {
          type: 'text',
          text:
            `ParkAssist found ${result.totalMatches} available spaces across ${scope} in the 5 Bell garage ` +
            `(generated ${result.generatedAt}). A space counts as available only when it is live, vacant, ` +
            `not reserved, and not out of service. Showing ${result.bays.length}:\n${lines.join('\n')}`
        }
      ],
      structuredContent: {
        garage: result.garage,
        generatedAt: result.generatedAt,
        totalMatches: result.totalMatches,
        floor: this.properties.floor ?? null,
        designation: this.properties.designation ?? null,
        bays: result.bays.map((bay) => ({
          bayId: bay.bayId,
          spaceNumber: bay.spaceNumber,
          floor: bay.floor,
          designation: bay.designation
        }))
      }
    };
  }

  protected renderBody(): React.ReactElement {
    return React.createElement(AvailableSpaces, {
      result: this.result,
      errorMessage: this.errorMessage,
      floor: this.properties.floor,
      designation: this.properties.designation,
      hostContext: this.hostContext,
      targetDocument: this.context.domElement.ownerDocument,
      onRequestDisplayMode: async (mode: SPCopilotDisplayMode) => {
        await this.requestDisplayModeAsync(mode);
      },
      strings
    });
  }
}
