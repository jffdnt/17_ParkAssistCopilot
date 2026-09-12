import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { BaseCopilotComponent } from '@microsoft/sp-copilot-component';
import type { SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';

import StaleCameraFeeds from './components/StaleCameraFeeds';
import type { IStaleCameraFeedsProps } from './components/IStaleCameraFeedsProps';
import type { IStaleCameraFeedsCopilotComponentProperties } from './StaleCameraFeedsCopilotComponentProperties';
import { StaleFeedService, type IStaleFeedResult } from '../../services/StaleFeedService';

import * as strings from 'StaleCameraFeedsCopilotComponentStrings';

/**
 * Renders the 5 Bell garage's stale camera feeds inside the Microsoft 365
 * Copilot canvas.
 *
 * Data comes from the ParkAssist MCP service over `AadHttpClient`, so the call
 * carries the signed-in user's delegated token rather than going through the
 * declarative-agent `OAuthPluginVault` path (see docs/deployment-state.md for
 * why that path is unusable today).
 *
 * After loading, the component pushes a summary back to the model through
 * `updateModelContextAsync` so Copilot can answer follow-up questions about the
 * numbers it just rendered.
 */
export default class StaleCameraFeedsCopilotComponent extends BaseCopilotComponent<IStaleCameraFeedsCopilotComponentProperties> {
  private _result: IStaleFeedResult | undefined;
  private _errorMessage: string | undefined;
  private _root: Root | undefined;

  protected async onInit(): Promise<void> {
    const service = new StaleFeedService(this.context.aadHttpClientFactory);

    try {
      this._result = await service.getStaleFeeds({
        floor: this.properties.floor,
        thresholdMinutes: this.properties.thresholdMinutes
      });
      await this._publishModelContext(this._result);
    } catch (error) {
      this._errorMessage = error instanceof Error ? error.message : String(error);
      console.error('ParkAssist stale-feed lookup failed.', error);
    }
  }

  /**
   * Hand the model the same facts the card shows. The host keeps only the most
   * recent call and surfaces it on the user's next message, so this makes
   * follow-up questions answerable without a second tool round-trip.
   */
  private async _publishModelContext(result: IStaleFeedResult): Promise<void> {
    const floorLabel = this.properties.floor === undefined ? 'all floors' : `floor ${this.properties.floor}`;
    const lines = result.bays.map((bay) => {
      const age =
        bay.feedState === 'missing' || bay.thumbnailAgeMinutes === undefined
          ? 'no telemetry'
          : `${Math.round(bay.thumbnailAgeMinutes)} min old`;
      return `- Space ${bay.spaceNumber ?? bay.bayId} (bay ${bay.bayId}, floor ${bay.floor ?? 'unknown'}): ${age}`;
    });

    try {
      await this.context.copilotBridge.updateModelContextAsync({
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
          garage: '5 Bell',
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
      });
    } catch (error) {
      // Model context is an enhancement, never a reason to fail the render.
      console.warn('Could not publish ParkAssist model context.', error);
    }
  }

  protected render(): void {
    const props: IStaleCameraFeedsProps = {
      result: this._result,
      errorMessage: this._errorMessage,
      floor: this.properties.floor,
      hostContext: this.hostContext,
      bridge: this.context.copilotBridge,
      onRequestDisplayMode: async (mode: SPCopilotDisplayMode) => {
        await this.requestDisplayModeAsync(mode);
      },
      targetDocument: this.context.domElement.ownerDocument,
      strings
    };

    if (!this._root) {
      this._root = createRoot(this.context.domElement);
    }

    this._root.render(React.createElement(StaleCameraFeeds, props));
  }

  protected async onTeardown(): Promise<void> {
    this._root?.unmount();
    this._root = undefined;
  }
}
