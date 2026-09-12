import type {
  ICopilotComponentHostContext,
  ISPCopilotBridge,
  SPCopilotDisplayMode
} from '@microsoft/sp-copilot-component';
import type { IStaleFeedResult } from '../../../services/StaleFeedService';

export interface IStaleCameraFeedsStrings {
  ExpandButtonLabel: string;
  CompactButtonLabel: string;
  GeneratedPrefix: string;
  NoTelemetryLabel: string;
  EmptyStateLabel: string;
  ErrorStatePrefix: string;
  LoadingLabel: string;
}

export interface IStaleCameraFeedsProps {
  /** Stale-feed snapshot from the ParkAssist service, or undefined while loading/failed. */
  result: IStaleFeedResult | undefined;
  /** Message to show when the lookup failed. */
  errorMessage: string | undefined;
  /** Floor filter Copilot supplied, if any. */
  floor: number | undefined;
  /** Host context (theme, display mode) from the Copilot host. */
  hostContext: ICopilotComponentHostContext;
  /** Bridge to communicate with the Copilot host. */
  bridge: ISPCopilotBridge;
  /** Request the host to change display mode (e.g. 'fullscreen'). */
  onRequestDisplayMode: (mode: SPCopilotDisplayMode) => Promise<void>;
  /**
   * Document the FluentProvider injects theme styles into. Pass
   * `domElement.ownerDocument` so Griffel writes CSS into the component's
   * iframe document rather than the top-level page.
   */
  targetDocument: Document | undefined;
  /** Localized strings for UI labels. */
  strings: IStaleCameraFeedsStrings;
}
