import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BaseCopilotComponent } from '@microsoft/sp-copilot-component';
import type { ISPCopilotModelContext } from '@microsoft/sp-copilot-component';
import {
  ParkAssistService,
  type GarageStatus,
  type IGarageResult,
  type IStatusDetail
} from '../services/ParkAssistService';
import { StatusDetailContext } from './StatusDetailContext';

/**
 * Shared lifecycle for the ParkAssist Copilot Components.
 *
 * Every one of them does the same three things: fetch a snapshot from the
 * ParkAssist service as the signed-in user, hand the model the same facts the
 * card shows, and mount a React tree. Subclasses supply only what differs —
 * which endpoint to call, what to tell the model, and what to draw.
 */
export abstract class BaseGarageComponent<TProperties> extends BaseCopilotComponent<TProperties> {
  /** Snapshot from the ParkAssist service, or undefined while loading/failed. */
  protected result: IGarageResult | undefined;
  /** Message to show when the lookup failed. */
  protected errorMessage: string | undefined;
  /** True while a user-requested live refresh is in flight. */
  protected isRefreshing: boolean = false;

  private _root: Root | undefined;

  /** Call the endpoint this component is backed by. */
  protected abstract loadAsync(service: ParkAssistService): Promise<IGarageResult>;

  /**
   * Facts to hand the model. The host keeps only the most recent call and
   * surfaces it on the user's next message, so this is what makes follow-up
   * questions answerable without a second tool round-trip.
   */
  protected abstract buildModelContext(result: IGarageResult): ISPCopilotModelContext;

  /** Build the React tree for the current state. */
  protected abstract renderBody(): React.ReactElement;

  protected async onInit(): Promise<void> {
    await this._loadResult(false);
  }

  /** Reload the current view without requiring another chat turn. */
  protected async refreshAsync(): Promise<void> {
    await this._loadResult(true);
  }

  /** Ask Copilot to narrate the model context published for this dashboard. */
  protected async requestNarrationAsync(): Promise<void> {
    await this.context.copilotBridge.sendFollowUpMessageAsync([
      {
        type: 'text',
        text:
          'Summarize the live ParkAssist dashboard that just loaded. Quote its current totals, scope, and generated time. ' +
          'Do not call another tool unless the dashboard context is unavailable.'
      }
    ]);
  }

  /** Fetch the bays behind one dashboard tile, for its drill-down. Stable identity across renders. */
  private readonly _loadStatusDetail = (status: GarageStatus): Promise<IStatusDetail> =>
    new ParkAssistService(this.context.aadHttpClientFactory).getStatusDetail(status);

  private async _loadResult(userInitiated: boolean): Promise<void> {
    const service = new ParkAssistService(this.context.aadHttpClientFactory);

    if (userInitiated) {
      this.isRefreshing = true;
      this.errorMessage = undefined;
      this.render();
    }

    try {
      this.result = await this.loadAsync(service);
      this.errorMessage = undefined;
      await this._publishModelContext(this.result);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      console.error('ParkAssist lookup failed.', error);
    } finally {
      if (userInitiated) {
        this.isRefreshing = false;
        this.render();
      }
    }
  }

  private async _publishModelContext(result: IGarageResult): Promise<void> {
    try {
      await this.context.copilotBridge.updateModelContextAsync(this.buildModelContext(result));
    } catch (error) {
      // Model context is an enhancement, never a reason to fail the render.
      console.warn('Could not publish ParkAssist model context.', error);
    }
  }

  protected render(): void {
    if (!this._root) {
      this._root = createRoot(this.context.domElement);
    }
    this._root.render(
      React.createElement(StatusDetailContext.Provider, { value: this._loadStatusDetail }, this.renderBody())
    );
  }

  protected async onTeardown(): Promise<void> {
    this._root?.unmount();
    this._root = undefined;
  }
}
