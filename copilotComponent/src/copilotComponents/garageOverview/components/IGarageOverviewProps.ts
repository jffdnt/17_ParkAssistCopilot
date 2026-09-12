import type { ICopilotComponentHostContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';
import type { IGarageResult } from '../../../services/ParkAssistService';

export interface IGarageOverviewStrings {
  ExpandButtonLabel: string;
  CompactButtonLabel: string;
  GeneratedPrefix: string;
  LoadingLabel: string;
  ErrorStatePrefix: string;
  TotalSpacesLabel: string;
  AvailableLabel: string;
  OccupiedLabel: string;
  ReservedLabel: string;
  OutOfServiceLabel: string;
  StaleFeedsLabel: string;
  MissingFeedsLabel: string;
  OfflineSensorsLabel: string;
  OccupancyLabel: string;
}

export interface IGarageOverviewProps {
  result: IGarageResult | undefined;
  errorMessage: string | undefined;
  hostContext: ICopilotComponentHostContext;
  targetDocument: Document | undefined;
  onRequestDisplayMode: (mode: SPCopilotDisplayMode) => Promise<void>;
  strings: IGarageOverviewStrings;
}
