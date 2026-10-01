import * as React from 'react';
import {
  Badge,
  Body1,
  Button,
  Caption1,
  Card,
  Spinner,
  Subtitle2,
  ToggleButton,
  makeStyles,
  mergeClasses,
  tokens
} from '@fluentui/react-components';
import { Dismiss20Regular } from '@fluentui/react-icons';
import type { GarageStatus, IStatusDetail, IStatusSpace } from '../services/ParkAssistService';
import type { StatusDetailLoader } from './StatusDetailContext';

/** Griffel rejects the `border-color` shorthand; one colour on three sides, a stripe on the left. */
function edgeColors(edge: string, stripe: string): Record<string, string> {
  return { borderTopColor: edge, borderRightColor: edge, borderBottomColor: edge, borderLeftColor: stripe };
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2
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
  layout: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalL
  },
  floors: {
    flex: '1 1 240px',
    maxWidth: '320px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS
  },
  floorRow: {
    display: 'grid',
    gridTemplateColumns: '60px minmax(64px, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    width: '100%',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    border: `1px solid transparent`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase200,
    textAlign: 'left',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover
    },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`
    }
  },
  floorRowSelected: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    border: `1px solid ${tokens.colorNeutralStroke1}`
  },
  floorCount: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums'
  },
  track: {
    display: 'block',
    height: '8px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground5,
    overflow: 'hidden'
  },
  fill: {
    display: 'block',
    height: '100%',
    borderRadius: tokens.borderRadiusCircular
  },
  map: {
    flex: '999 1 320px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS
  },
  scroll: {
    maxHeight: '420px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalXS
  },
  floorGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS
  },
  tiles: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
    gap: tokens.spacingHorizontalXS
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '44px',
    padding: tokens.spacingHorizontalXXS,
    borderRadius: tokens.borderRadiusMedium,
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '4px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    cursor: 'pointer',
    ':hover': {
      filter: 'brightness(1.08)'
    },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '1px'
    }
  },
  tileSelected: {
    outline: `2px solid ${tokens.colorNeutralForeground1}`,
    outlineOffset: '1px'
  },
  tileNumber: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase300
  },
  tileNote: {
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    color: tokens.colorNeutralForeground2
  },
  legendSwatch: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    marginRight: tokens.spacingHorizontalXXS,
    borderRadius: tokens.borderRadiusSmall,
    verticalAlign: 'middle'
  },
  detail: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingHorizontalM
  },
  detailImage: {
    width: '240px',
    maxWidth: '100%',
    height: '150px',
    objectFit: 'cover',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3
  },
  detailFacts: {
    flex: '1 1 200px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS
  },
  error: {
    color: tokens.colorPaletteRedForeground1
  },

  // Tile tones. Background plus a stronger left stripe, so the encoding
  // survives both themes and does not rely on hue alone (each tile also
  // carries a text note).
  toneSuccess: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    ...edgeColors(tokens.colorPaletteGreenBorder1, tokens.colorPaletteGreenBorder2)
  },
  toneBrand: {
    backgroundColor: tokens.colorBrandBackground2,
    ...edgeColors(tokens.colorBrandStroke2, tokens.colorBrandStroke1)
  },
  toneTeal: {
    backgroundColor: tokens.colorPaletteLightTealBackground2,
    ...edgeColors(tokens.colorPaletteLightTealBorderActive, tokens.colorPaletteLightTealBorderActive)
  },
  toneMarigold: {
    backgroundColor: tokens.colorPaletteMarigoldBackground1,
    ...edgeColors(tokens.colorPaletteMarigoldBorder1, tokens.colorPaletteMarigoldBorder2)
  },
  toneWarning: {
    backgroundColor: tokens.colorPaletteDarkOrangeBackground1,
    ...edgeColors(tokens.colorPaletteDarkOrangeBorder1, tokens.colorPaletteDarkOrangeBorder2)
  },
  toneDanger: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    ...edgeColors(tokens.colorPaletteRedBorder1, tokens.colorPaletteRedBorder2)
  },
  // Legend swatches use the stripe colour: the tile backgrounds are too dark
  // to read at swatch size in the dark theme.
  swatchSuccess: { backgroundColor: tokens.colorPaletteGreenBorder2 },
  swatchBrand: { backgroundColor: tokens.colorBrandStroke1 },
  swatchTeal: { backgroundColor: tokens.colorPaletteLightTealBorderActive },
  swatchMarigold: { backgroundColor: tokens.colorPaletteMarigoldBorder2 },
  swatchWarning: { backgroundColor: tokens.colorPaletteDarkOrangeBorder2 },
  swatchDanger: { backgroundColor: tokens.colorPaletteRedBorder2 },
  fillSuccess: { backgroundColor: tokens.colorPaletteGreenBorder2 },
  fillBrand: { backgroundColor: tokens.colorBrandStroke1 },
  fillWarning: { backgroundColor: tokens.colorPaletteDarkOrangeBorder2 },
  fillDanger: { backgroundColor: tokens.colorPaletteRedBorder2 }
});

type Tone = 'success' | 'brand' | 'teal' | 'marigold' | 'warning' | 'danger';

/** A legend entry: one way a tile in this drill-down can be coloured. */
interface ICategory {
  key: string;
  label: string;
  tone: Tone;
}

/**
 * How each status is broken down visually. Every space falls in exactly one
 * category, so the legend counts always add up to the total.
 */
function categoriesFor(status: GarageStatus): ICategory[] {
  switch (status) {
    case 'available':
      return [{ key: 'available', label: 'Ready to park', tone: 'success' }];
    case 'occupied':
      return [
        { key: 'lt1h', label: 'Under 1h', tone: 'teal' },
        { key: '1to4h', label: '1–4h', tone: 'brand' },
        { key: '4to12h', label: '4–12h', tone: 'marigold' },
        { key: '12h', label: '12h+', tone: 'warning' },
        { key: 'unknown', label: 'Entry time unknown', tone: 'brand' }
      ];
    case 'stale-or-missing':
      return [
        { key: 'stale', label: 'Stale feed', tone: 'warning' },
        { key: 'missing', label: 'No telemetry', tone: 'danger' }
      ];
    case 'out-of-service':
      return [{ key: 'out-of-service', label: 'Out of service', tone: 'danger' }];
  }
}

function categoryOf(status: GarageStatus, space: IStatusSpace): string {
  switch (status) {
    case 'available':
      return 'available';
    case 'occupied': {
      const minutes = space.parkedMinutes;
      if (minutes === undefined) return 'unknown';
      if (minutes < 60) return 'lt1h';
      if (minutes < 240) return '1to4h';
      if (minutes < 720) return '4to12h';
      return '12h';
    }
    case 'stale-or-missing':
      return space.feedState === 'missing' ? 'missing' : 'stale';
    case 'out-of-service':
      return 'out-of-service';
  }
}

/** Compact duration: "45m", "3h 10m", "2d 4h". */
export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;
  if (rounded < 1440) {
    const remainder = rounded % 60;
    return remainder === 0 ? `${Math.floor(rounded / 60)}h` : `${Math.floor(rounded / 60)}h ${remainder}m`;
  }
  const hours = Math.floor((rounded % 1440) / 60);
  return hours === 0 ? `${Math.floor(rounded / 1440)}d` : `${Math.floor(rounded / 1440)}d ${hours}h`;
}

/** The short second line on a tile: what an operator scans for in this view. */
function tileNote(status: GarageStatus, space: IStatusSpace): string {
  switch (status) {
    case 'occupied':
      return space.parkedMinutes === undefined ? '—' : formatDuration(space.parkedMinutes);
    case 'stale-or-missing':
      return space.feedState === 'missing' || space.thumbnailAgeMinutes === undefined
        ? 'none'
        : formatDuration(space.thumbnailAgeMinutes);
    case 'out-of-service':
      return space.health?.issueType ?? space.designation;
    default:
      return space.designation;
  }
}

function describeSpace(status: GarageStatus, space: IStatusSpace, floor: number): string {
  const parts = [`Space ${space.spaceNumber}`, `floor ${floor}`, space.designation];
  if (status === 'occupied' && space.parkedMinutes !== undefined) {
    parts.push(`parked ${formatDuration(space.parkedMinutes)}`);
  }
  if (status === 'stale-or-missing') {
    parts.push(
      space.feedState === 'missing' || space.thumbnailAgeMinutes === undefined
        ? 'no camera telemetry'
        : `camera ${formatDuration(space.thumbnailAgeMinutes)} old`
    );
  }
  if (space.health?.issueType) parts.push(space.health.issueType);
  return parts.join(', ');
}

export interface IStatusDrilldownProps {
  status: GarageStatus;
  /** The tile label, e.g. "Available". */
  label: string;
  load: StatusDetailLoader;
  /** Changes when the dashboard refreshes, so the drill-down reloads with it. */
  refreshKey: string;
  onClose: () => void;
}

const ALL_FLOORS = 0;

/**
 * The bays behind one dashboard tile, laid out as a garage map: a per-floor
 * bar list to pick a floor, then every matching space as a tile, coloured by
 * what matters for that status. Picking a tile opens its camera preview.
 */
export default function StatusDrilldown(props: IStatusDrilldownProps): JSX.Element {
  const styles = useStyles();
  const { status, label, load, refreshKey, onClose } = props;

  const [detail, setDetail] = React.useState<IStatusDetail | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [attempt, setAttempt] = React.useState(0);
  const [floor, setFloor] = React.useState<number>(ALL_FLOORS);
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(new Set());
  const [designation, setDesignation] = React.useState<string | undefined>(undefined);
  const [selected, setSelected] = React.useState<{ space: IStatusSpace; floor: number } | undefined>(undefined);

  // The parent keys this component by status, so switching tiles starts clean;
  // a dashboard refresh reloads in place and keeps the floor and filters.
  React.useEffect(() => {
    let cancelled = false;
    setError(undefined);
    load(status)
      .then((loaded) => {
        if (cancelled) return;
        setDetail(loaded);
        // Keep the selection only if that space is still in this status.
        setSelected((current) => {
          if (!current) return current;
          const match = loaded.floors
            .find((entry) => entry.floor === current.floor)
            ?.spaces.find((space) => space.bayId === current.space.bayId);
          return match ? { space: match, floor: current.floor } : undefined;
        });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [status, refreshKey, attempt, load]);

  const categories = categoriesFor(status);
  const toneClass: Record<Tone, string> = {
    success: styles.toneSuccess,
    brand: styles.toneBrand,
    teal: styles.toneTeal,
    marigold: styles.toneMarigold,
    warning: styles.toneWarning,
    danger: styles.toneDanger
  };
  const swatchClass: Record<Tone, string> = {
    success: styles.swatchSuccess,
    brand: styles.swatchBrand,
    teal: styles.swatchTeal,
    marigold: styles.swatchMarigold,
    warning: styles.swatchWarning,
    danger: styles.swatchDanger
  };
  const fillClass =
    status === 'available'
      ? styles.fillSuccess
      : status === 'occupied'
        ? styles.fillBrand
        : status === 'stale-or-missing'
          ? styles.fillWarning
          : styles.fillDanger;

  const header = (
    <div className={styles.headerRow}>
      <div className={styles.header}>
        <Subtitle2>
          {detail ? `${detail.total} ${label.toLowerCase()}` : label}
        </Subtitle2>
        <Caption1>
          {detail
            ? `${detail.garage} · garage-wide · as of ${new Date(detail.generatedAt).toLocaleTimeString()}` +
              (status === 'stale-or-missing' ? ` · stale after ${detail.staleAfterMinutes} min` : '')
            : 'Loading spaces…'}
        </Caption1>
      </div>
      <Button
        appearance="subtle"
        icon={<Dismiss20Regular />}
        aria-label={`Close ${label.toLowerCase()} details`}
        onClick={onClose}
      />
    </div>
  );

  if (error) {
    return (
      <section className={styles.root} aria-label={`${label} details`}>
        {header}
        <Caption1 className={styles.error}>Could not load these spaces: {error}</Caption1>
        <div>
          <Button size="small" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </Button>
        </div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className={styles.root} aria-label={`${label} details`} aria-busy={true}>
        {header}
        <Spinner size="small" label="Loading spaces…" />
      </section>
    );
  }

  // Filters apply in a fixed order: floor scope → designation → legend toggles.
  const inScope = detail.floors.filter((entry) => floor === ALL_FLOORS || entry.floor === floor);
  const designationCounts = new Map<string, number>();
  inScope.forEach((entry) =>
    entry.spaces.forEach((space) =>
      designationCounts.set(space.designation, (designationCounts.get(space.designation) ?? 0) + 1)
    )
  );
  const categoryCounts = new Map<string, number>();
  inScope.forEach((entry) =>
    entry.spaces
      .filter((space) => designation === undefined || space.designation === designation)
      .forEach((space) => {
        const key = categoryOf(status, space);
        categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
      })
  );
  const visibleFloors = inScope
    .map((entry) => ({
      floor: entry.floor,
      spaces: entry.spaces.filter(
        (space) =>
          (designation === undefined || space.designation === designation) &&
          !hidden.has(categoryOf(status, space))
      )
    }))
    .filter((entry) => entry.spaces.length > 0);
  const shownCount = visibleFloors.reduce((sum, entry) => sum + entry.spaces.length, 0);
  const toneByKey = new Map(categories.map((category) => [category.key, category.tone]));
  const visibleCategories = categories.filter((category) => (categoryCounts.get(category.key) ?? 0) > 0);

  const toggleCategory = (key: string): void => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const floorButton = (value: number, name: string, count: number, configured: number): JSX.Element => {
    const isSelected = floor === value;
    const ratio = configured === 0 ? 0 : count / configured;
    return (
      <button
        key={value}
        type="button"
        className={mergeClasses(styles.floorRow, isSelected && styles.floorRowSelected)}
        aria-pressed={isSelected}
        aria-label={`${name}: ${count} of ${configured} spaces ${label.toLowerCase()}`}
        onClick={() => {
          setFloor(value);
          setDesignation(undefined);
          setSelected(undefined);
        }}
      >
        <span>{name}</span>
        <span className={styles.track} aria-hidden="true">
          <span className={mergeClasses(styles.fill, fillClass)} style={{ width: `${Math.round(ratio * 100)}%` }} />
        </span>
        <span className={styles.floorCount}>
          <strong>{count}</strong> / {configured}
        </span>
      </button>
    );
  };

  const configuredTotal = detail.floors.reduce((sum, entry) => sum + entry.configured, 0);

  return (
    <section className={styles.root} aria-label={`${label} details`}>
      {header}
      <div className={styles.layout}>
        <nav className={styles.floors} aria-label="Floors">
          {floorButton(ALL_FLOORS, 'All', detail.total, configuredTotal)}
          {detail.floors.map((entry) =>
            floorButton(entry.floor, `Floor ${entry.floor}`, entry.spaces.length, entry.configured)
          )}
        </nav>

        <div className={styles.map}>
          {designationCounts.size > 1 ? (
            <div className={styles.filters} role="group" aria-label="Filter by designation">
              <ToggleButton
                size="small"
                shape="circular"
                checked={designation === undefined}
                onClick={() => setDesignation(undefined)}
              >
                All types
              </ToggleButton>
              {Array.from(designationCounts.entries())
                .sort((left, right) => right[1] - left[1])
                .map(([name, count]) => (
                  <ToggleButton
                    key={name}
                    size="small"
                    shape="circular"
                    checked={designation === name}
                    onClick={() => setDesignation(designation === name ? undefined : name)}
                  >
                    {`${name} · ${count}`}
                  </ToggleButton>
                ))}
            </div>
          ) : undefined}

          {visibleCategories.length > 1 ? (
            <div className={styles.filters} role="group" aria-label="Show or hide categories">
              {visibleCategories.map((category) => (
                <ToggleButton
                  key={category.key}
                  size="small"
                  appearance="subtle"
                  checked={!hidden.has(category.key)}
                  onClick={() => toggleCategory(category.key)}
                >
                  <span
                    className={mergeClasses(styles.legendSwatch, swatchClass[category.tone])}
                    aria-hidden="true"
                  />
                  {`${category.label} · ${categoryCounts.get(category.key) ?? 0}`}
                </ToggleButton>
              ))}
            </div>
          ) : undefined}

          {selected ? (
            <SpaceDetail
              status={status}
              space={selected.space}
              floor={selected.floor}
              onClose={() => setSelected(undefined)}
            />
          ) : undefined}

          {shownCount === 0 ? (
            <Body1>
              {detail.total === 0
                ? `No spaces are ${label.toLowerCase()} right now.`
                : 'No spaces match these filters.'}
            </Body1>
          ) : (
            <div className={styles.scroll}>
              {visibleFloors.map((entry) => (
                <div key={entry.floor} className={styles.floorGroup}>
                  {floor === ALL_FLOORS ? (
                    <Caption1>
                      <strong>Floor {entry.floor}</strong> · {entry.spaces.length}
                    </Caption1>
                  ) : undefined}
                  <div className={styles.tiles} role="list">
                    {entry.spaces.map((space) => {
                      const tone = toneByKey.get(categoryOf(status, space)) ?? 'brand';
                      const isSelected = selected?.space.bayId === space.bayId;
                      const description = describeSpace(status, space, entry.floor);
                      return (
                        <button
                          key={space.bayId}
                          type="button"
                          role="listitem"
                          title={description}
                          aria-label={description}
                          aria-pressed={isSelected}
                          className={mergeClasses(styles.tile, toneClass[tone], isSelected && styles.tileSelected)}
                          onClick={() =>
                            setSelected(isSelected ? undefined : { space, floor: entry.floor })
                          }
                        >
                          <span className={styles.tileNumber}>{space.spaceNumber}</span>
                          <span className={styles.tileNote}>{tileNote(status, space)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface ISpaceDetailProps {
  status: GarageStatus;
  space: IStatusSpace;
  floor: number;
  onClose: () => void;
}

/** The selected tile: its camera preview and the facts behind its colour. */
function SpaceDetail({ status, space, floor, onClose }: ISpaceDetailProps): JSX.Element {
  const styles = useStyles();
  const [imageFailed, setImageFailed] = React.useState(false);
  React.useEffect(() => setImageFailed(false), [space.bayId]);

  const feed =
    space.feedState === 'missing' || space.thumbnailAgeMinutes === undefined
      ? 'No camera telemetry'
      : `Camera image ${formatDuration(space.thumbnailAgeMinutes)} old`;

  return (
    <Card className={styles.detail} aria-label={`Space ${space.spaceNumber} details`}>
      {space.imageUrl && !imageFailed ? (
        <img
          className={styles.detailImage}
          src={space.imageUrl}
          alt={`Camera preview for space ${space.spaceNumber}`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className={styles.detailImage} role="img" aria-label="Camera preview unavailable" />
      )}
      <div className={styles.detailFacts}>
        <div className={styles.headerRow}>
          <Subtitle2>Space {space.spaceNumber}</Subtitle2>
          <Button
            size="small"
            appearance="subtle"
            icon={<Dismiss20Regular />}
            aria-label={`Close space ${space.spaceNumber}`}
            onClick={onClose}
          />
        </div>
        <Caption1>
          Bay {space.bayId} · Floor {floor} · {space.designation}
        </Caption1>
        {status === 'occupied' ? (
          <Body1>
            {space.parkedMinutes === undefined
              ? 'Entry time not reported'
              : `Parked for ${formatDuration(space.parkedMinutes)}`}
          </Body1>
        ) : undefined}
        <Body1>{feed}</Body1>
        <div>
          {space.reserved ? (
            <Badge appearance="tint" color="informative">
              Reserved
            </Badge>
          ) : undefined}{' '}
          {space.health?.isActive && space.health.issueType ? (
            <Badge appearance="tint" color="danger">
              {space.health.issueType}
            </Badge>
          ) : undefined}
        </div>
      </div>
    </Card>
  );
}
