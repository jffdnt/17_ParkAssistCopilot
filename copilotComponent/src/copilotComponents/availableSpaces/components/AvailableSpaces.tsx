import * as React from 'react';
import { Body1 } from '@fluentui/react-components';

import GarageShell from '../../../components/GarageShell';
import BayGrid from '../../../components/BayGrid';
import LiveMetrics from '../../../components/LiveMetrics';
import ResultSummary from '../../../components/ResultSummary';
import { describeFloors } from '../../../services/floors';
import type { IAvailableSpacesProps } from './IAvailableSpacesProps';

/** Vacant, in-service spaces for the 5 Bell garage. */
export default function AvailableSpaces(props: IAvailableSpacesProps): JSX.Element {
  const { result, floors, designation, strings } = props;

  const scope = [describeFloors(floors), designation ? designation : undefined]
    .filter(Boolean)
    .join(' · ');

  const subtitle = result
    ? `${strings.GeneratedPrefix} ${new Date(result.generatedAt).toLocaleTimeString()}`
    : undefined;

  let body: JSX.Element;

  if (!result) {
    body = <Body1>{strings.LoadingLabel}</Body1>;
  } else {
    const coverage = result.hasMore
      ? `${result.totalMatches - result.bays.length} ${strings.MoreResultsSuffix}`
      : result.bays.length > 0
        ? strings.CompleteListLabel
        : undefined;

    body = (
      <>
        <LiveMetrics result={result} />
        <ResultSummary
          answer={result.summary}
          floorBreakdown={result.floorBreakdown}
          coverage={coverage}
        />
        {result.bays.length === 0 ? (
          <Body1>{strings.EmptyStateLabel}</Body1>
        ) : (
          /*
            The camera age matters here now that previews are shown: a snapshot
            can be hours stale while the sensor reports the space vacant, so a
            photo containing a car is not a contradiction — it is an
            out-of-date image. Showing the age lets an operator judge whether
            to trust it.
          */
          <BayGrid bays={result.bays} noTelemetryLabel={strings.NoTelemetryLabel} />
        )}
      </>
    );
  }

  return (
    <GarageShell
      title={`Available spaces · ${scope}`}
      subtitle={subtitle}
      hostContext={props.hostContext}
      targetDocument={props.targetDocument}
      idPrefix="parkassist-availability-"
      onRequestDisplayMode={props.onRequestDisplayMode}
      onRefresh={props.onRefresh}
      onSummarize={props.onSummarize}
      isRefreshing={props.isRefreshing}
      expandLabel={strings.ExpandButtonLabel}
      errorMessage={props.errorMessage ? `${strings.ErrorStatePrefix} ${props.errorMessage}` : undefined}
    >
      {body}
    </GarageShell>
  );
}
