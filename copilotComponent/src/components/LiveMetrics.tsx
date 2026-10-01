import * as React from 'react';
import {
  Caption1,
  Card,
  ProgressBar,
  Title2,
  makeStyles,
  tokens
} from '@fluentui/react-components';
import type { IGarageResult } from '../services/ParkAssistService';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS
  },
  occupancy: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2
  },
  progress: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS
  },
  occupancyValue: {
    minWidth: '72px',
    textAlign: 'right'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: tokens.spacingHorizontalS
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    padding: tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`
  },
  warning: {
    color: tokens.colorPaletteDarkOrangeForeground1
  },
  danger: {
    color: tokens.colorPaletteRedForeground1
  }
});

/** Shared dashboard metrics used by every conversational result view. */
export default function LiveMetrics({ result }: { result: IGarageResult }): JSX.Element {
  const styles = useStyles();
  const metrics = result.metrics;
  const occupancy = Math.max(0, Math.min(100, metrics.occupancyPercent ?? 0));
  const staleOrMissing = (metrics.staleFeeds ?? 0) + (metrics.missingFeeds ?? 0);
  const cards: { label: string; value: number | string; tone?: string }[] = [
    { label: 'Available', value: metrics.available ?? '—' },
    { label: 'Occupied', value: metrics.occupied ?? '—' },
    { label: 'Stale or missing feeds', value: staleOrMissing, tone: staleOrMissing > 0 ? styles.warning : undefined },
    {
      label: 'Out of service',
      value: metrics.outOfService ?? '—',
      tone: (metrics.outOfService ?? 0) > 0 ? styles.danger : undefined
    }
  ];

  return (
    <section className={styles.root} aria-label="Live garage dashboard">
      <div className={styles.occupancy}>
        <div className={styles.progress}>
          <Caption1>Garage occupancy</Caption1>
          <ProgressBar value={occupancy / 100} thickness="large" />
        </div>
        <Title2 className={styles.occupancyValue}>{Math.round(occupancy)}%</Title2>
      </div>
      <div className={styles.grid}>
        {cards.map((card) => (
          <Card key={card.label} className={styles.metric}>
            <Title2 className={card.tone}>{card.value}</Title2>
            <Caption1>{card.label}</Caption1>
          </Card>
        ))}
      </div>
    </section>
  );
}
