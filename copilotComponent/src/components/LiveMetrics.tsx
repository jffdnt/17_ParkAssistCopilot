import * as React from 'react';
import {
  Caption1,
  Card,
  ProgressBar,
  Title2,
  makeStyles,
  mergeClasses,
  tokens
} from '@fluentui/react-components';
import type { GarageStatus, IGarageResult } from '../services/ParkAssistService';
import { StatusDetailContext } from './StatusDetailContext';
import StatusDrilldown from './StatusDrilldown';

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
  metricInteractive: {
    cursor: 'pointer',
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px'
    }
  },
  metricSelected: {
    border: `2px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1Selected
  },
  hint: {
    color: tokens.colorNeutralForeground3
  },
  warning: {
    color: tokens.colorPaletteDarkOrangeForeground1
  },
  danger: {
    color: tokens.colorPaletteRedForeground1
  }
});

/**
 * Shared dashboard metrics used by every conversational result view. When a
 * StatusDetailContext loader is available each counter is a button that opens
 * the spaces behind it.
 */
export default function LiveMetrics({ result }: { result: IGarageResult }): JSX.Element {
  const styles = useStyles();
  const loadDetail = React.useContext(StatusDetailContext);
  const [openStatus, setOpenStatus] = React.useState<GarageStatus | undefined>(undefined);
  const metrics = result.metrics;
  const occupancy = Math.max(0, Math.min(100, metrics.occupancyPercent ?? 0));
  const staleOrMissing = (metrics.staleFeeds ?? 0) + (metrics.missingFeeds ?? 0);
  const cards: { status: GarageStatus; label: string; value: number | string; tone?: string }[] = [
    { status: 'available', label: 'Available', value: metrics.available ?? '—' },
    { status: 'occupied', label: 'Occupied', value: metrics.occupied ?? '—' },
    {
      status: 'stale-or-missing',
      label: 'Stale or missing feeds',
      value: staleOrMissing,
      tone: staleOrMissing > 0 ? styles.warning : undefined
    },
    {
      status: 'out-of-service',
      label: 'Out of service',
      value: metrics.outOfService ?? '—',
      tone: (metrics.outOfService ?? 0) > 0 ? styles.danger : undefined
    }
  ];
  const openCard = cards.find((card) => card.status === openStatus);
  const drilldownId = React.useId();

  const toggle = (status: GarageStatus): void =>
    setOpenStatus((current) => (current === status ? undefined : status));

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
        {cards.map((card) => {
          if (!loadDetail) {
            return (
              <Card key={card.label} className={styles.metric}>
                <Title2 className={card.tone}>{card.value}</Title2>
                <Caption1>{card.label}</Caption1>
              </Card>
            );
          }
          const isOpen = openStatus === card.status;
          return (
            <Card
              key={card.label}
              className={mergeClasses(styles.metric, styles.metricInteractive, isOpen && styles.metricSelected)}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              aria-controls={isOpen ? drilldownId : undefined}
              aria-label={`${card.value} ${card.label}. ${isOpen ? 'Hide' : 'Show'} spaces.`}
              onClick={() => toggle(card.status)}
              onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggle(card.status);
                }
              }}
            >
              <Title2 className={card.tone}>{card.value}</Title2>
              <Caption1>{card.label}</Caption1>
            </Card>
          );
        })}
      </div>
      {loadDetail && !openCard ? (
        <Caption1 className={styles.hint}>Select a number to see the spaces behind it.</Caption1>
      ) : undefined}
      {loadDetail && openCard ? (
        <div id={drilldownId}>
          <StatusDrilldown
            key={openCard.status}
            status={openCard.status}
            label={openCard.label}
            load={loadDetail}
            refreshKey={result.generatedAt}
            onClose={() => setOpenStatus(undefined)}
          />
        </div>
      ) : undefined}
    </section>
  );
}
