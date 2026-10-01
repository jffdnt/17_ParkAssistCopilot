import * as React from 'react';
import {
  FluentProvider,
  IdPrefixProvider,
  webLightTheme,
  webDarkTheme,
  Title3,
  Caption1,
  Button,
  Spinner,
  makeStyles,
  tokens
} from '@fluentui/react-components';
import { ArrowClockwise24Regular, ArrowExpand24Regular, Chat24Regular } from '@fluentui/react-icons';
import type { ICopilotComponentHostContext, SPCopilotDisplayMode } from '@microsoft/sp-copilot-component';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM
  },
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS
  },
  error: {
    color: tokens.colorPaletteRedForeground1
  }
});

export interface IGarageShellProps {
  title: string;
  subtitle?: string;
  hostContext: ICopilotComponentHostContext;
  targetDocument: Document | undefined;
  idPrefix: string;
  onRequestDisplayMode: (mode: SPCopilotDisplayMode) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onSummarize?: () => Promise<void>;
  isRefreshing?: boolean;
  expandLabel: string;
  /** Rendered instead of children when the lookup failed. */
  errorMessage?: string;
  children?: React.ReactNode;
}

/**
 * Shared chrome for every ParkAssist Copilot Component: host theming, the
 * title/subtitle block, and the refresh, narration, and fullscreen actions.
 * Each component supplies only its own body.
 */
export default function GarageShell(props: IGarageShellProps): JSX.Element {
  const styles = useStyles();
  const { hostContext, onRequestDisplayMode } = props;

  const theme = hostContext.theme === 'dark' ? webDarkTheme : webLightTheme;
  const isFullscreen = hostContext.displayMode === 'fullscreen';

  return (
    <IdPrefixProvider value={props.idPrefix}>
      <FluentProvider theme={theme} targetDocument={props.targetDocument}>
        <div className={styles.root}>
          <div className={styles.headerRow}>
            <div className={styles.header}>
              <Title3>{props.title}</Title3>
              {props.subtitle ? <Caption1>{props.subtitle}</Caption1> : undefined}
            </div>
            <div className={styles.actions}>
              {props.onRefresh ? (
                <Button
                  appearance="subtle"
                  icon={props.isRefreshing ? <Spinner size="tiny" /> : <ArrowClockwise24Regular />}
                  disabled={props.isRefreshing}
                  aria-label="Refresh live garage data"
                  onClick={() => {
                    props.onRefresh?.().catch((error: unknown) =>
                      console.error('Garage refresh failed.', error)
                    );
                  }}
                >
                  Refresh
                </Button>
              ) : undefined}
              {props.onSummarize ? (
                <Button
                  appearance="subtle"
                  icon={<Chat24Regular />}
                  onClick={() => {
                    props.onSummarize?.().catch((error: unknown) =>
                      console.error('Dashboard narration request failed.', error)
                    );
                  }}
                >
                  Summarize
                </Button>
              ) : undefined}
              {!isFullscreen ? (
                <Button
                  appearance="subtle"
                  icon={<ArrowExpand24Regular />}
                  onClick={() => {
                    onRequestDisplayMode('fullscreen').catch((error: unknown) =>
                      console.error('Display-mode request failed.', error)
                    );
                  }}
                >
                  {props.expandLabel}
                </Button>
              ) : undefined}
            </div>
          </div>
          {props.errorMessage ? (
            <Caption1 className={styles.error}>{props.errorMessage}</Caption1>
          ) : (
            props.children
          )}
        </div>
      </FluentProvider>
    </IdPrefixProvider>
  );
}
