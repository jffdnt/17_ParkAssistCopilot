import type { ICopilotComponentHostContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';
import type { IGarageResult } from '../../../services/ParkAssistService';

export interface IAvailableSpacesStrings {
  ExpandButtonLabel: string;
  CompactButtonLabel: string;
  GeneratedPrefix: string;
  LoadingLabel: string;
  ErrorStatePrefix: string;
  EmptyStateLabel: string;
  NoTelemetryLabel: string;
  CompleteListLabel: string;
  MoreResultsSuffix: string;
}

export interface IAvailableSpacesProps {
  result: IGarageResult | undefined;
  errorMessage: string | undefined;
  /** Floors the request was scoped to; undefined means the whole garage. */
  floors: number[] | undefined;
  designation: string | undefined;
  hostContext: ICopilotComponentHostContext;
  targetDocument: Document | undefined;
  onRequestDisplayMode: (mode: SPCopilotDisplayMode) => Promise<void>;
  strings: IAvailableSpacesStrings;
}
