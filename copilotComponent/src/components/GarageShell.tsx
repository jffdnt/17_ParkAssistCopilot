import * as React from 'react';
import {
  FluentProvider,
  IdPrefixProvider,
  webLightTheme,
  webDarkTheme,
  Title3,
  Caption1,
  Button,
  makeStyles,
  tokens
} from '@fluentui/react-components';
import { ArrowExpand24Regular, ArrowMinimize24Regular } from '@fluentui/react-icons';
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
    gap: tokens.spacingHorizontalS
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS
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
  expandLabel: string;
  compactLabel: string;
  /** Rendered instead of children when the lookup failed. */
  errorMessage?: string;
  children?: React.ReactNode;
}

/**
 * Shared chrome for every ParkAssist Copilot Component: host theming, the
 * title/subtitle block, and the expand/collapse affordance. Each component
 * supplies only its own body.
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
            <Button
              appearance="subtle"
              icon={isFullscreen ? <ArrowMinimize24Regular /> : <ArrowExpand24Regular />}
              onClick={() => {
                onRequestDisplayMode(isFullscreen ? 'inline' : 'fullscreen').catch((error: unknown) =>
                  console.error('Display-mode request failed.', error)
                );
              }}
            >
              {isFullscreen ? props.compactLabel : props.expandLabel}
            </Button>
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
