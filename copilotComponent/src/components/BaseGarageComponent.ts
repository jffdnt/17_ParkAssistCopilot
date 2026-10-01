import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BaseCopilotComponent } from '@microsoft/sp-copilot-component';
import type { ISPCopilotModelContext } from '@microsoft/sp-copilot-component';
import { ParkAssistService, type IGarageResult } from '../services/ParkAssistService';
import { DrilldownHostContext, type IDrilldownHost } from './DrilldownHost';
import type { IDrilldownContext } from './drilldownModel';

/** Filter clicks arrive in bursts; publish once the user settles. */
const DRILLDOWN_PUBLISH_DELAY_MS = 400;

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
  /** What the open drill-down shows, published alongside the dashboard facts. */
  private _drilldown: IDrilldownContext | undefined;
  private _drilldownTimer: number | undefined;
  private _isTornDown: boolean = false;

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

  /** Ask Copilot to describe the drill-down on screen, from the context just published. */
  protected async requestDrilldownNarrationAsync(): Promise<void> {
    await this._flushDrilldownContext();
    await this.context.copilotBridge.sendFollowUpMessageAsync([
      {
        type: 'text',
        text:
          'Describe the ParkAssist drill-down I am looking at. Lead with the total and where those spaces are ' +
          'concentrated by floor, call out anything notable, and mention my current filters and selected space if ' +
          'there is one. Use the drill-down context; do not call another tool.'
      }
    ]);
  }

  /** Drill-down callbacks for the React tree. One object, so its identity is stable across renders. */
  private readonly _drilldownHost: IDrilldownHost = {
    load: (status) => new ParkAssistService(this.context.aadHttpClientFactory).getStatusDetail(status),
    publishView: (view) => {
      this._drilldown = view;
      this._clearDrilldownTimer();
      this._drilldownTimer = window.setTimeout(() => {
        this._drilldownTimer = undefined;
        this._publishCurrentContext().catch(() => undefined);
      }, DRILLDOWN_PUBLISH_DELAY_MS);
    },
    askAboutView: () => this.requestDrilldownNarrationAsync()
  };

  /** Publish a pending drill-down update now, so a follow-up message sees it. */
  private async _flushDrilldownContext(): Promise<void> {
    if (this._drilldownTimer === undefined) return;
    this._clearDrilldownTimer();
    await this._publishCurrentContext();
  }

  private _clearDrilldownTimer(): void {
    if (this._drilldownTimer !== undefined) {
      window.clearTimeout(this._drilldownTimer);
      this._drilldownTimer = undefined;
    }
  }

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
      await this._publishCurrentContext();
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

  /**
   * The host keeps only the latest model context, so the dashboard facts and
   * the open drill-down are always published together: opening a drill-down
   * must not make Copilot forget the dashboard, and vice versa.
   */
  private async _publishCurrentContext(): Promise<void> {
    if (!this.result || this._isTornDown) return;
    const dashboard = this.buildModelContext(this.result);
    const drilldown = this._drilldown;
    const context: ISPCopilotModelContext = drilldown
      ? {
          content: [...(dashboard.content ?? []), { type: 'text', text: drilldown.text }],
          structuredContent: { ...(dashboard.structuredContent ?? {}), drilldown: drilldown.structured }
        }
      : dashboard;
    try {
      await this.context.copilotBridge.updateModelContextAsync(context);
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
      React.createElement(DrilldownHostContext.Provider, { value: this._drilldownHost }, this.renderBody())
    );
  }

  protected async onTeardown(): Promise<void> {
    this._isTornDown = true;
    this._clearDrilldownTimer();
    this._root?.unmount();
    this._root = undefined;
  }
}
