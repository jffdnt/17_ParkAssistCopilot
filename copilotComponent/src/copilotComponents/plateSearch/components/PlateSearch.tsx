import * as React from 'react';
import { Body1 } from '@fluentui/react-components';

import GarageShell from '../../../components/GarageShell';
import BayGrid from '../../../components/BayGrid';
import type { IPlateSearchProps } from './IPlateSearchProps';

/** Plate-match results for the 5 Bell garage. */
export default function PlateSearch(props: IPlateSearchProps): JSX.Element {
  const { result, query, strings } = props;

  const subtitle = result
    ? `${result.totalMatches} ${strings.MatchCountSuffix} · ${strings.GeneratedPrefix} ` +
      `${new Date(result.generatedAt).toLocaleTimeString()}`
    : undefined;

  let body: JSX.Element;

  if (!result) {
    body = <Body1>{strings.LoadingLabel}</Body1>;
  } else if (result.bays.length === 0) {
    body = <Body1>{strings.NoMatchLabel}</Body1>;
  } else {
    body = <BayGrid bays={result.bays} noTelemetryLabel={strings.NoTelemetryLabel} showPlates={true} />;
  }

  return (
    <GarageShell
      title={`Plate search: ${query}`}
      subtitle={subtitle}
      hostContext={props.hostContext}
      targetDocument={props.targetDocument}
      idPrefix="parkassist-plate-"
      onRequestDisplayMode={props.onRequestDisplayMode}
      expandLabel={strings.ExpandButtonLabel}
      compactLabel={strings.CompactButtonLabel}
      errorMessage={props.errorMessage ? `${strings.ErrorStatePrefix} ${props.errorMessage}` : undefined}
    >
      {body}
    </GarageShell>
  );
}
