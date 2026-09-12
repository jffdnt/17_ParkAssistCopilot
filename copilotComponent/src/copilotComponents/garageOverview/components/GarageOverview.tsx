import * as React from 'react';
import { Body1, Caption1, Card, makeStyles, tokens, Title2 } from '@fluentui/react-components';

import GarageShell from '../../../components/GarageShell';
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
      { label: strings.AvailableLabel, value: String(m.available ?? '—') },
      { label: strings.OccupiedLabel, value: String(m.occupied ?? '—') },
      { label: strings.OutOfServiceLabel, value: String(m.outOfService ?? '—') },
      { label: strings.StaleFeedsLabel, value: String(m.staleFeeds ?? '—'), attention: (m.staleFeeds ?? 0) > 0 },
      { label: strings.TotalSpacesLabel, value: String(m.totalSpaces ?? '—') },
      {
        label: strings.OccupancyLabel,
        value: m.occupancyRate === undefined ? '—' : `${Math.round(m.occupancyRate * 100)}%`
      }
    ];

    body = (
      <div className={styles.grid}>
        {tiles.map((tile) => (
          <Card key={tile.label} className={styles.stat}>
            <Title2 className={tile.attention ? styles.attention : undefined}>{tile.value}</Title2>
            <Caption1>{tile.label}</Caption1>
          </Card>
        ))}
      </div>
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
      expandLabel={strings.ExpandButtonLabel}
      compactLabel={strings.CompactButtonLabel}
      errorMessage={props.errorMessage ? `${strings.ErrorStatePrefix} ${props.errorMessage}` : undefined}
    >
      {body}
    </GarageShell>
  );
}
