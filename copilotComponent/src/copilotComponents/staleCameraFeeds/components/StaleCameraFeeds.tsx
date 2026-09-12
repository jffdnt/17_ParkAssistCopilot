import * as React from 'react';
import { Body1 } from '@fluentui/react-components';

import GarageShell from '../../../components/GarageShell';
import BayGrid from '../../../components/BayGrid';
import ResultSummary from '../../../components/ResultSummary';
import { describeFloors } from '../../../services/floors';
import type { IStaleCameraFeedsProps } from './IStaleCameraFeedsProps';

/** Camera-health view for the 5 Bell garage. */
export default function StaleCameraFeeds(props: IStaleCameraFeedsProps): JSX.Element {
  const { result, floors, strings } = props;

  const scope = describeFloors(floors);
  const subtitle = result
    ? `threshold ${result.staleAfterMinutes} min · ` +
      `${strings.GeneratedPrefix} ${new Date(result.generatedAt).toLocaleTimeString()}`
    : undefined;

  let body: JSX.Element;

  if (!result) {
    body = <Body1>{strings.LoadingLabel}</Body1>;
  } else {
    /*
      The grid shows at most one page, so it cannot be read as the answer on
      its own: a card listing 12 bays out of 125 matches looked complete.
      ResultSummary states the count, splits it by floor, and says whether the
      grid below is all of it.
    */
    const coverage = result.hasMore
      ? `${result.totalMatches - result.bays.length} ${strings.MoreResultsSuffix}`
      : result.bays.length > 0
        ? strings.CompleteListLabel
        : undefined;

    body = (
      <>
        <ResultSummary
          answer={result.summary}
          floorBreakdown={result.floorBreakdown}
          coverage={coverage}
        />
        {result.bays.length === 0 ? (
          <Body1>{strings.EmptyStateLabel}</Body1>
        ) : (
          <BayGrid bays={result.bays} noTelemetryLabel={strings.NoTelemetryLabel} />
        )}
      </>
    );
  }

  return (
    <GarageShell
      title={`Stale camera feeds · ${scope}`}
      subtitle={subtitle}
      hostContext={props.hostContext}
      targetDocument={props.targetDocument}
      idPrefix="parkassist-stale-feeds-"
      onRequestDisplayMode={props.onRequestDisplayMode}
      expandLabel={strings.ExpandButtonLabel}
      compactLabel={strings.CompactButtonLabel}
      errorMessage={props.errorMessage ? `${strings.ErrorStatePrefix} ${props.errorMessage}` : undefined}
    >
      {body}
    </GarageShell>
  );
}
