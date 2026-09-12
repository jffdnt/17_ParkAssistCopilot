import * as React from 'react';
import {
  FluentProvider,
  IdPrefixProvider,
  webLightTheme,
  webDarkTheme,
  Title3,
  Body1,
  Caption1,
  Badge,
  Button,
  Card,
  CardHeader,
  makeStyles,
  tokens
} from '@fluentui/react-components';
import { ArrowExpand24Regular, ArrowMinimize24Regular } from '@fluentui/react-icons';

import type { IStaleCameraFeedsProps } from './IStaleCameraFeedsProps';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalS
  },
  bayCard: {
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
  },
  error: {
    color: tokens.colorPaletteRedForeground1
  }
});

/** Formats a snapshot age, or the missing-telemetry case, for display. */
function formatAge(
  ageMinutes: number | undefined,
  feedState: string,
  noTelemetryLabel: string
): string {
  if (feedState === 'missing' || ageMinutes === undefined) {
    return noTelemetryLabel;
  }
  const rounded = Math.round(ageMinutes);
  if (rounded < 60) {
    return `${rounded} min old`;
  }
  const hours = Math.floor(rounded / 60);
  return `${hours}h ${rounded % 60}m old`;
}

/**
 * Camera-health view for the 5 Bell garage, rendered inside the Copilot canvas.
 * Purely presentational — the component class owns data loading and the model
 * context push.
 */
export default function StaleCameraFeeds(props: IStaleCameraFeedsProps): JSX.Element {
  const styles = useStyles();
  const { result, errorMessage, floor, hostContext, strings, onRequestDisplayMode } = props;

  const theme = hostContext.theme === 'dark' ? webDarkTheme : webLightTheme;
  const isFullscreen = hostContext.displayMode === 'fullscreen';
  const floorLabel = floor === undefined ? 'all floors' : `floor ${floor}`;

  let body: JSX.Element;

  if (errorMessage) {
    body = (
      <Body1 className={styles.error}>
        {strings.ErrorStatePrefix} {errorMessage}
      </Body1>
    );
  } else if (!result) {
    body = <Body1>{strings.LoadingLabel}</Body1>;
  } else if (result.bays.length === 0) {
    body = <Body1>{strings.EmptyStateLabel}</Body1>;
  } else {
    body = (
      <div className={styles.grid}>
        {result.bays.map((bay) => (
          <Card key={bay.bayId} className={styles.bayCard}>
            <CardHeader
              header={<Body1><strong>Space {bay.spaceNumber ?? bay.bayId}</strong></Body1>}
              description={
                <Caption1>
                  Bay {bay.bayId}
                  {bay.floor === undefined ? '' : ` · Floor ${bay.floor}`}
                </Caption1>
              }
            />
            {bay.imageUrl ? (
              <img
                className={styles.preview}
                src={bay.imageUrl}
                alt={`Camera preview for space ${bay.spaceNumber ?? bay.bayId}`}
              />
            ) : (
              <div className={styles.previewMissing}>
                <Caption1>{strings.NoTelemetryLabel}</Caption1>
              </div>
            )}
            <Badge appearance="tint" color={bay.feedState === 'missing' ? 'danger' : 'warning'}>
              {formatAge(bay.thumbnailAgeMinutes, bay.feedState, strings.NoTelemetryLabel)}
            </Badge>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <IdPrefixProvider value="parkassist-stale-feeds-">
      <FluentProvider theme={theme} targetDocument={props.targetDocument}>
        <div className={styles.root}>
          <div className={styles.headerRow}>
            <div className={styles.header}>
              <Title3>Stale camera feeds</Title3>
              {result ? (
                <Caption1>
                  {result.totalMatches} stale or missing across {floorLabel} · threshold{' '}
                  {result.staleAfterMinutes} min · {strings.GeneratedPrefix}{' '}
                  {new Date(result.generatedAt).toLocaleTimeString()}
                </Caption1>
              ) : undefined}
            </div>
            <Button
              appearance="subtle"
              icon={isFullscreen ? <ArrowMinimize24Regular /> : <ArrowExpand24Regular />}
              onClick={() => {
                onRequestDisplayMode(isFullscreen ? 'inline' : 'fullscreen').catch(
                  (error: unknown) => console.error('Display-mode request failed.', error)
                );
              }}
            >
              {isFullscreen ? strings.CompactButtonLabel : strings.ExpandButtonLabel}
            </Button>
          </div>
          {body}
        </div>
      </FluentProvider>
    </IdPrefixProvider>
  );
}
