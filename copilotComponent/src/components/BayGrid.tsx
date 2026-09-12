import * as React from 'react';
import { Badge, Body1, Caption1, Card, CardHeader, makeStyles, tokens } from '@fluentui/react-components';
import type { IGarageBay } from '../services/ParkAssistService';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalS
  },
  card: {
    padding: tokens.spacingHorizontalS
  },
  preview: {
    width: '100%',
    height: '120px',
    objectFit: 'cover',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3
  },
  previewMissing: {
    width: '100%',
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3
  }
});

/** Formats a camera snapshot age, or the missing-telemetry case. */
export function formatFeedAge(bay: IGarageBay, noTelemetryLabel: string): string {
  if (bay.feedState === 'missing' || bay.thumbnailAgeMinutes === undefined) {
    return noTelemetryLabel;
  }
  const rounded = Math.round(bay.thumbnailAgeMinutes);
  if (rounded < 60) {
    return `${rounded} min old`;
  }
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m old`;
}

export interface IBayGridProps {
  bays: IGarageBay[];
  noTelemetryLabel: string;
  /** Show the camera preview image. Off for list-style views such as availability. */
  showPreviews?: boolean;
  /** Show the plate when the bay reports one. */
  showPlates?: boolean;
  /** Show the camera-age badge. */
  showFeedAge?: boolean;
}

/** Shared bay card grid used by the stale-feed, availability, and plate views. */
export default function BayGrid(props: IBayGridProps): JSX.Element {
  const styles = useStyles();
  const { showPreviews = true, showPlates = false, showFeedAge = true } = props;

  return (
    <div className={styles.grid}>
      {props.bays.map((bay) => (
        <Card key={bay.bayId} className={styles.card}>
          <CardHeader
            header={
              <Body1>
                <strong>Space {bay.spaceNumber ?? bay.bayId}</strong>
              </Body1>
            }
            description={
              <Caption1>
                Bay {bay.bayId}
                {bay.floor === undefined ? '' : ` · Floor ${bay.floor}`}
                {bay.designation ? ` · ${bay.designation}` : ''}
              </Caption1>
            }
          />
          {showPreviews ? (
            bay.imageUrl ? (
              <img
                className={styles.preview}
                src={bay.imageUrl}
                alt={`Camera preview for space ${bay.spaceNumber ?? bay.bayId}`}
              />
            ) : (
              <div className={styles.previewMissing}>
                <Caption1>{props.noTelemetryLabel}</Caption1>
              </div>
            )
          ) : undefined}
          {showPlates && bay.plateDisplay ? (
            <Badge appearance="tint" color="brand">
              {bay.plateDisplay}
            </Badge>
          ) : undefined}
          {showFeedAge ? (
            <Badge appearance="tint" color={bay.feedState === 'missing' ? 'danger' : 'warning'}>
              {formatFeedAge(bay, props.noTelemetryLabel)}
            </Badge>
          ) : undefined}
        </Card>
      ))}
    </div>
  );
}
