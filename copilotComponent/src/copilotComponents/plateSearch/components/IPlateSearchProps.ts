import type { ICopilotComponentHostContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';
import type { IGarageResult } from '../../../services/ParkAssistService';

export interface IPlateSearchStrings {
  ExpandButtonLabel: string;
  CompactButtonLabel: string;
  GeneratedPrefix: string;
  LoadingLabel: string;
  ErrorStatePrefix: string;
  NoMatchLabel: string;
  NoTelemetryLabel: string;
  MatchCountSuffix: string;
}

export interface IPlateSearchProps {
  result: IGarageResult | undefined;
  errorMessage: string | undefined;
  query: string;
  hostContext: ICopilotComponentHostContext;
  targetDocument: Document | undefined;
  onRequestDisplayMode: (mode: SPCopilotDisplayMode) => Promise<void>;
  strings: IPlateSearchStrings;
}
