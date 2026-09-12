import * as React from 'react';
import type { ISPCopilotModelContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';

import { BaseGarageComponent } from '../../components/BaseGarageComponent';
import { ParkAssistService, type IGarageResult } from '../../services/ParkAssistService';
import { describeFloors, parseFloors } from '../../services/floors';
import AvailableSpaces from './components/AvailableSpaces';
import type { IAvailableSpacesCopilotComponentProperties } from './AvailableSpacesCopilotComponentProperties';

import * as strings from 'AvailableSpacesCopilotComponentStrings';

/** Live vacant, in-service parking spaces for the 5 Bell garage. */
export default class AvailableSpacesCopilotComponent extends BaseGarageComponent<IAvailableSpacesCopilotComponentProperties> {
  /** Floors this request was scoped to, expanded from the tool's range syntax. */
  private get _floors(): number[] | undefined {
    return parseFloors(this.properties.floors);
  }

  protected loadAsync(service: ParkAssistService): Promise<IGarageResult> {
    return service.getAvailableSpaces({
      floors: this._floors,
      designation: this.properties.designation
    });
  }

  protected buildModelContext(result: IGarageResult): ISPCopilotModelContext {
    const floors = this._floors;
    const scope = [
      describeFloors(floors),
      this.properties.designation ? `designation ${this.properties.designation}` : undefined
    ]
      .filter(Boolean)
      .join(', ');

    const breakdown = (result.floorBreakdown ?? []).map(
      (entry) => `floor ${entry.floor}: ${entry.count} of ${entry.configured} mapped spaces`
    );
    const coverage = result.hasMore
      ? `${result.bays.length} of those ${result.totalMatches} are listed below; the remainder are not in this payload.`
      : `All ${result.totalMatches} are listed below.`;

    const lines = result.bays.map(
      (bay) =>
        `- Space ${bay.spaceNumber ?? bay.bayId} (bay ${bay.bayId}, floor ${bay.floor ?? 'unknown'}` +
        `${bay.designation ? `, ${bay.designation}` : ''})`
    );

    const text = [
      result.summary,
      breakdown.length > 1 ? `By floor — ${breakdown.join('; ')}.` : undefined,
      `Scope: ${scope}. A space counts as available only when it is live, vacant, not reserved, ` +
        `and not out of service. Snapshot taken ${result.generatedAt}.`,
      result.totalMatches === 0 ? undefined : coverage,
      ...lines
    ]
      .filter(Boolean)
      .join('\n');

    return {
      content: [{ type: 'text', text }],
      structuredContent: {
        answer: result.summary,
        garage: result.garage,
        generatedAt: result.generatedAt,
        floors: floors ?? null,
        designation: this.properties.designation ?? null,
        totalMatches: result.totalMatches,
        configuredInScope: result.configuredInScope ?? null,
        floorBreakdown: result.floorBreakdown ?? null,
        listedBays: result.bays.length,
        isCompleteList: !result.hasMore,
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
      floors: this._floors,
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
