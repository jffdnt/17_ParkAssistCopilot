import * as React from 'react';
import { Body1, Caption1, Card, makeStyles, tokens, Title2 } from '@fluentui/react-components';

import GarageShell from '../../../components/GarageShell';
import LiveMetrics from '../../../components/LiveMetrics';
import type { IGarageOverviewProps } from './IGarageOverviewProps';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: tokens.spacingHorizontalS
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalM
  },
  attention: {
    color: tokens.colorPaletteRedForeground1
  }
});

/** Garage-wide metrics tiles for the 5 Bell garage. */
export default function GarageOverview(props: IGarageOverviewProps): JSX.Element {
  const styles = useStyles();
  const { result, strings } = props;

  const subtitle = result
    ? `${result.garage} · ${strings.GeneratedPrefix} ${new Date(result.generatedAt).toLocaleTimeString()}`
    : undefined;

  let body: JSX.Element;

  if (!result) {
    body = <Body1>{strings.LoadingLabel}</Body1>;
  } else {
    const m = result.metrics;
    const tiles: { label: string; value: string; attention?: boolean }[] = [
      { label: strings.TotalSpacesLabel, value: String(m.configured ?? '—') },
      { label: 'Reporting live', value: String(m.live ?? '—') },
      { label: strings.ReservedLabel, value: String(m.reserved ?? '—') },
      {
        label: strings.OfflineSensorsLabel,
        value: String(m.offlineSensors ?? '—'),
        attention: (m.offlineSensors ?? 0) > 0
      }
    ];

    body = (
      <>
        <LiveMetrics result={result} />
        <div className={styles.grid}>
          {tiles.map((tile) => (
            <Card key={tile.label} className={styles.stat}>
              <Title2 className={tile.attention ? styles.attention : undefined}>{tile.value}</Title2>
              <Caption1>{tile.label}</Caption1>
            </Card>
          ))}
        </div>
      </>
    );
  }

  return (
    <GarageShell
      title="Garage overview"
      subtitle={subtitle}
      hostContext={props.hostContext}
      targetDocument={props.targetDocument}
      idPrefix="parkassist-overview-"
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
