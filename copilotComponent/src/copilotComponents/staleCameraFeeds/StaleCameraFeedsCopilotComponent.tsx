import * as React from 'react';
import type { ISPCopilotModelContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';

import { BaseGarageComponent } from '../../components/BaseGarageComponent';
import { ParkAssistService, type IGarageResult } from '../../services/ParkAssistService';
import { describeFloors, parseFloors } from '../../services/floors';
import StaleCameraFeeds from './components/StaleCameraFeeds';
import type { IStaleCameraFeedsCopilotComponentProperties } from './StaleCameraFeedsCopilotComponentProperties';

import * as strings from 'StaleCameraFeedsCopilotComponentStrings';

/** Stale and missing camera feeds for the 5 Bell garage. */
export default class StaleCameraFeedsCopilotComponent extends BaseGarageComponent<IStaleCameraFeedsCopilotComponentProperties> {
  /** Floors this request was scoped to, expanded from the tool's range syntax. */
  private get _floors(): number[] | undefined {
    return parseFloors(this.properties.floors);
  }

  protected loadAsync(service: ParkAssistService): Promise<IGarageResult> {
    return service.getStaleFeeds({
      floors: this._floors,
      thresholdMinutes: this.properties.thresholdMinutes
    });
  }

  protected buildModelContext(result: IGarageResult): ISPCopilotModelContext {
    const floors = this._floors;

    /*
      Leads with the server's own answer sentence, then the per-floor split,
      then an explicit statement of how much of the match set follows. Without
      that last part the model reads a 12-row list as the complete answer and
      reports 12 when the real count is in the hundreds — the list is one page,
      and its length is not the count.
    */
    const breakdown = (result.floorBreakdown ?? []).map(
      (entry) => `floor ${entry.floor}: ${entry.count} of ${entry.configured} mapped spaces`
    );
    const coverage = result.hasMore
      ? `The ${result.bays.length} most stale of those ${result.totalMatches} are listed below; the remainder are not in this payload.`
      : `All ${result.totalMatches} are listed below.`;

    const lines = result.bays.map((bay) => {
      const age =
        bay.feedState === 'missing' || bay.thumbnailAgeMinutes === undefined
          ? 'no telemetry'
          : `${Math.round(bay.thumbnailAgeMinutes)} min old`;
      return `- Space ${bay.spaceNumber ?? bay.bayId} (bay ${bay.bayId}, floor ${bay.floor ?? 'unknown'}): ${age}`;
    });

    const text = [
      result.summary,
      breakdown.length > 1 ? `By floor — ${breakdown.join('; ')}.` : undefined,
      `Scope: ${describeFloors(floors)}. Staleness threshold: ${result.staleAfterMinutes} minutes. ` +
        `Snapshot taken ${result.generatedAt}.`,
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
        staleAfterMinutes: result.staleAfterMinutes,
        floors: floors ?? null,
        totalMatches: result.totalMatches,
        configuredInScope: result.configuredInScope ?? null,
        floorBreakdown: result.floorBreakdown ?? null,
        listedBays: result.bays.length,
        isCompleteList: !result.hasMore,
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
      floors: this._floors,
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
