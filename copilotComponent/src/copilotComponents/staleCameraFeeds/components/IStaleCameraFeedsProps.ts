import type { ICopilotComponentHostContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';
import type { IGarageResult } from '../../../services/ParkAssistService';

export interface IStaleCameraFeedsStrings {
  ExpandButtonLabel: string;
  CompactButtonLabel: string;
  GeneratedPrefix: string;
  NoTelemetryLabel: string;
  EmptyStateLabel: string;
  ErrorStatePrefix: string;
  LoadingLabel: string;
  CompleteListLabel: string;
  MoreResultsSuffix: string;
}

export interface IStaleCameraFeedsProps {
  result: IGarageResult | undefined;
  errorMessage: string | undefined;
  /** Floors the request was scoped to; undefined means the whole garage. */
  floors: number[] | undefined;
  hostContext: ICopilotComponentHostContext;
  targetDocument: Document | undefined;
  onRequestDisplayMode: (mode: SPCopilotDisplayMode) => Promise<void>;
  strings: IStaleCameraFeedsStrings;
}
