import { createRoot, type Root } from 'react-dom/client';
import { BaseCopilotComponent } from '@microsoft/sp-copilot-component';
import type { ISPCopilotModelContext } from '@microsoft/sp-copilot-component';
import { ParkAssistService, type IGarageResult } from '../services/ParkAssistService';

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
    const service = new ParkAssistService(this.context.aadHttpClientFactory);

    try {
      this.result = await this.loadAsync(service);
      await this._publishModelContext(this.result);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      console.error('ParkAssist lookup failed.', error);
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
    this._root.render(this.renderBody());
  }

  protected async onTeardown(): Promise<void> {
    this._root?.unmount();
    this._root = undefined;
  }
}
