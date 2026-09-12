import * as React from 'react';
import { Badge, Body1, Caption1, makeStyles, tokens } from '@fluentui/react-components';
import type { IFloorCount } from '../services/ParkAssistService';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS
  },
  answer: {
    fontWeight: tokens.fontWeightSemibold
  },
  breakdown: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS
  }
});

export interface IResultSummaryProps {
  /**
   * The server's own answer sentence. Rendered verbatim so the card, the model
   * context, and the MCP tool result all state the same number.
   */
  answer: string;
  /** Per-floor counts, shown when more than one floor is in scope. */
  floorBreakdown?: IFloorCount[];
  /** Says how much of the match set the grid below actually shows. */
  coverage?: string;
}

/**
 * The stated answer at the top of a result card.
 *
 * A grid of bay cards shows *examples*; on its own it cannot answer "how many,
 * and where?" — the grid is one page, and its length is not the count. This
 * block carries the count in words, splits it by floor, and says whether the
 * grid below is the whole set, so the card is readable without a follow-up
 * question.
 */
export default function ResultSummary(props: IResultSummaryProps): JSX.Element {
  const styles = useStyles();
  const { answer, floorBreakdown, coverage } = props;
  const showBreakdown = floorBreakdown !== undefined && floorBreakdown.length > 1;

  return (
    <div className={styles.root}>
      <Body1 className={styles.answer}>{answer}</Body1>
      {showBreakdown ? (
        <div className={styles.breakdown}>
          {floorBreakdown.map((entry) => (
            <Badge
              key={entry.floor}
              appearance="tint"
              color={entry.count === 0 ? 'success' : 'informative'}
            >
              {`Floor ${entry.floor}: ${entry.count} of ${entry.configured}`}
            </Badge>
          ))}
        </div>
      ) : undefined}
      {coverage ? <Caption1>{coverage}</Caption1> : undefined}
    </div>
  );
}
