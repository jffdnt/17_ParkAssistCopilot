import type { ICopilotComponentHostContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';
import type { IGarageResult } from '../../../services/ParkAssistService';

export interface IStaleCameraFeedsStrings {
  ExpandButtonLabel: string;
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
  onRefresh: () => Promise<void>;
  onSummarize: () => Promise<void>;
  isRefreshing: boolean;
  strings: IStaleCameraFeedsStrings;
}
