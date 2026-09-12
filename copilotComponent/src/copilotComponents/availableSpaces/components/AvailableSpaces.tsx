import * as React from 'react';
import { Body1, Caption1 } from '@fluentui/react-components';

import GarageShell from '../../../components/GarageShell';
import BayGrid from '../../../components/BayGrid';
import type { IAvailableSpacesProps } from './IAvailableSpacesProps';

/** Vacant, in-service spaces for the 5 Bell garage. */
export default function AvailableSpaces(props: IAvailableSpacesProps): JSX.Element {
  const { result, floor, designation, strings } = props;

  const scope = [
    floor === undefined ? 'all floors' : `floor ${floor}`,
    designation ? designation : undefined
  ]
    .filter(Boolean)
    .join(' · ');

  const subtitle = result
    ? `${result.totalMatches} available across ${scope} · ${strings.GeneratedPrefix} ` +
      `${new Date(result.generatedAt).toLocaleTimeString()}`
    : undefined;

  let body: JSX.Element;

  if (!result) {
    body = <Body1>{strings.LoadingLabel}</Body1>;
  } else if (result.bays.length === 0) {
    body = <Body1>{strings.EmptyStateLabel}</Body1>;
  } else {
    body = (
      <>
        <BayGrid bays={result.bays} noTelemetryLabel={strings.NoTelemetryLabel} showFeedAge={false} />
        {result.hasMore ? (
          <Caption1>
            {result.totalMatches - result.bays.length} {strings.MoreResultsSuffix}
          </Caption1>
        ) : undefined}
      </>
    );
  }

  return (
    <GarageShell
      title="Available spaces"
      subtitle={subtitle}
      hostContext={props.hostContext}
      targetDocument={props.targetDocument}
      idPrefix="parkassist-availability-"
      onRequestDisplayMode={props.onRequestDisplayMode}
      expandLabel={strings.ExpandButtonLabel}
      compactLabel={strings.CompactButtonLabel}
      errorMessage={props.errorMessage ? `${strings.ErrorStatePrefix} ${props.errorMessage}` : undefined}
    >
      {body}
    </GarageShell>
  );
}
