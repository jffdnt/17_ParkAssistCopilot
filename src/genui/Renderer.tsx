import {
  Badge,
  Button,
  Card,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ChatSparkle16Regular, Video20Regular } from "@fluentui/react-icons";
import { useEffect, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type {
  BayRow,
  HydratedLayout,
  HydratedLeaf,
  HydratedNode,
  HydratedSpec,
  SeriesRow,
  Source,
  Tone,
} from "../shared/genui/spec.js";
import { followUpBinding, followUpQuestion } from "../shared/genui/follow-up.js";
import type { AuthHeaders } from "./auth.js";

// A local copy: importing the function from spec.ts would bundle Zod into the page.
function isLayout(node: HydratedNode): node is HydratedLayout {
  return node.type === "stack" || node.type === "row" || node.type === "grid" || node.type === "section";
}

/**
 * Renders a hydrated view. This is the allowlist on the browser side: every
 * node type maps to one component here, and anything else gets an inert
 * placeholder. Nothing in a spec is ever evaluated or injected as HTML.
 */

export interface RenderContext {
  base: string;
  authHeaders: AuthHeaders;
  /** Sends a follow-up question about one part of the view. */
  ask(question: string): void;
}

const TONE_COLORS: Record<Tone, string> = {
  neutral: tokens.colorNeutralForeground3,
  success: tokens.colorPaletteGreenForeground1,
  brand: tokens.colorBrandForeground1,
  teal: tokens.colorPaletteTealForeground2,
  marigold: tokens.colorPaletteMarigoldForeground1,
  warning: tokens.colorPaletteDarkOrangeForeground1,
  danger: tokens.colorPaletteRedForeground1,
};
const SERIES_FALLBACK: Tone[] = ["brand", "teal", "marigold", "success", "warning", "danger"];

const useStyles = makeStyles({
  view: { display: "flex", flexDirection: "column", gap: "16px" },
  header: { display: "flex", flexDirection: "column", gap: "2px" },
  stack: { display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 },
  row: { display: "flex", flexWrap: "wrap", gap: "12px", "> *": { flex: "1 1 180px", minWidth: 0 } },
  grid: { display: "grid", gap: "12px", gridTemplateColumns: "repeat(var(--cols), minmax(0, 1fr))", "@media (max-width: 640px)": { gridTemplateColumns: "1fr" } },
  section: { display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 },
  card: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 },
  cardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
  kpiValue: { fontSize: tokens.fontSizeHero800, lineHeight: tokens.lineHeightHero800, fontWeight: tokens.fontWeightSemibold },
  muted: { color: tokens.colorNeutralForeground3 },
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: "6px" },
  tile: {
    borderRadius: tokens.borderRadiusMedium,
    padding: "6px",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeftWidth: "4px",
    display: "flex",
    flexDirection: "column",
    fontSize: tokens.fontSizeBase200,
  },
  tableWrap: { overflowX: "auto" },
  camera: { width: "100%", maxWidth: "480px", borderRadius: tokens.borderRadiusMedium, display: "block" },
  plate: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  legend: { display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: tokens.fontSizeBase200 },
  swatch: { display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", marginRight: "4px" },
});

/** The app context plus the view's sources, so a tile can name its own binding. */
interface ViewContext extends RenderContext {
  sources: Source[];
}

export function ViewRenderer({ view, context: appContext }: { view: HydratedSpec; context: RenderContext }) {
  const styles = useStyles();
  const context: ViewContext = { ...appContext, sources: view.sources };
  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <Text as="h2" size={600} weight="semibold">{view.title}</Text>
        <Text size={200} className={styles.muted}>Live data as of {new Date(view.asOf).toLocaleTimeString()}</Text>
      </div>
      <Node node={view.root} context={context} />
    </div>
  );
}

function Node({ node, context }: { node: HydratedNode; context: ViewContext }): ReactNode {
  const styles = useStyles();
  if (isLayout(node)) {
    const children = node.children.map((child, index) => <Node key={index} node={child} context={context} />);
    switch (node.type) {
      case "row":
        return <div className={styles.row}>{children}</div>;
      case "grid":
        return <div className={styles.grid} style={{ ["--cols" as string]: node.columns ?? 2 }}>{children}</div>;
      case "section":
        return (
          <section className={styles.section}>
            {node.title && <Text as="h3" size={400} weight="semibold">{node.title}</Text>}
            {children}
          </section>
        );
      default:
        return <div className={styles.stack}>{children}</div>;
    }
  }
  return <Leaf leaf={node} context={context} />;
}

function Leaf({ leaf, context }: { leaf: HydratedLeaf; context: ViewContext }): ReactNode {
  const styles = useStyles();
  const resolved = leaf.resolved;
  const askButton = (topic: string) => (
    <Button
      size="small"
      appearance="subtle"
      icon={<ChatSparkle16Regular />}
      onClick={() => context.ask(followUpQuestion(topic, followUpBinding(leaf, context.sources)))}
      aria-label={`Ask about ${topic}`}
    />
  );

  switch (resolved.kind) {
    case "metric":
      return (
        <Card className={styles.card}>
          <div className={styles.cardHead}>
            <Text size={200} className={styles.muted}>{resolved.label}</Text>
            {askButton(resolved.label.toLowerCase())}
          </div>
          <span className={styles.kpiValue}>{resolved.value.toLocaleString()}{resolved.unit}</span>
        </Card>
      );
    case "gauge":
      return (
        <Card className={styles.card}>
          <div className={styles.cardHead}>
            <Text size={200} className={styles.muted}>{resolved.label}</Text>
            <Text weight="semibold">{resolved.percent}%</Text>
          </div>
          <ProgressBar value={resolved.percent / 100} thickness="large" color={resolved.percent >= 90 ? "error" : resolved.percent >= 75 ? "warning" : "brand"} />
          <Text size={200} className={styles.muted}>{resolved.occupied.toLocaleString()} of {resolved.of.toLocaleString()} spaces occupied</Text>
        </Card>
      );
    case "series":
      return (
        <Card className={styles.card}>
          <div className={styles.cardHead}>
            <Text weight="semibold">{resolved.label}</Text>
            {askButton(resolved.label.toLowerCase())}
          </div>
          {resolved.rows.length === 0
            ? <Text className={styles.muted}>Nothing to show: none of the {resolved.total.toLocaleString()} spaces in scope match.</Text>
            : leaf.type === "donutChart" ? <Donut rows={resolved.rows} total={resolved.total} /> : <Bars rows={resolved.rows} />}
        </Card>
      );
    case "bays":
      return (
        <Card className={styles.card}>
          <div className={styles.cardHead}>
            <Text weight="semibold">{resolved.label}</Text>
            {askButton(resolved.label.toLowerCase())}
          </div>
          {resolved.total === 0
            ? <Text className={styles.muted}>No matching spaces.</Text>
            : leaf.type === "bayGrid" ? <BayTiles rows={resolved.rows} /> : <BayTable rows={resolved.rows} />}
          <ListCount shown={resolved.shown} total={resolved.total} />
        </Card>
      );
    case "plates":
      return (
        <Card className={styles.card}>
          <Text weight="semibold">Vehicles matching {resolved.query}</Text>
          {resolved.total === 0 && <Text className={styles.muted}>No parked vehicle matches {resolved.query}.</Text>}
          {resolved.rows.map((row) => (
            <div key={row.bayId} className={styles.cardHead}>
              <span className={styles.plate}>{row.plateDisplay ?? "Unread plate"}</span>
              <Text>Space {row.spaceNumber}, floor {row.floor}</Text>
              {row.plateConfidence !== undefined && <Badge appearance="tint" color={row.plateConfidence >= 0.9 ? "success" : "warning"}>{Math.round(row.plateConfidence * 100)}% read</Badge>}
            </div>
          ))}
          <ListCount shown={resolved.shown} total={resolved.total} />
        </Card>
      );
    case "camera":
      return <CameraPreview bayId={resolved.bayId} label={resolved.spaceNumber ? `Space ${resolved.spaceNumber}, floor ${resolved.floor}` : resolved.bayId} context={context} />;
    case "text":
      return leaf.type === "callout"
        ? (
          <MessageBar intent={leaf.tone === "danger" ? "error" : leaf.tone}>
            <MessageBarBody>{resolved.text}</MessageBarBody>
          </MessageBar>
        )
        : <Text as="p">{resolved.text}</Text>;
    default:
      return <Card className={styles.card}><Text className={styles.muted}>This part of the view could not be shown.</Text></Card>;
  }
}

/** Every list says how much of the answer it shows, so 12 rows are never read as "12 in total". */
function ListCount({ shown, total }: { shown: number; total: number }) {
  const styles = useStyles();
  if (total === 0) return null;
  return (
    <Text size={200} className={styles.muted}>
      {shown >= total ? `All ${total.toLocaleString()} shown.` : `Showing ${shown.toLocaleString()} of ${total.toLocaleString()}; ${(total - shown).toLocaleString()} more not shown.`}
    </Text>
  );
}

/** Donut slices are categories, so untoned rows each get their own color. */
function colorFor(row: SeriesRow, index: number): string {
  return TONE_COLORS[row.tone ?? SERIES_FALLBACK[index % SERIES_FALLBACK.length]];
}

/**
 * Bars of one measure (say, stale feeds per floor) share one color: cycling
 * the palette would paint some floors green, which reads as "healthy" on a
 * chart about failures. Rows with their own tone (status mix) keep it.
 */
function barColorFor(row: SeriesRow): string {
  return TONE_COLORS[row.tone ?? "brand"];
}

function Bars({ rows }: { rows: SeriesRow[] }) {
  const height = Math.max(160, rows.length * 32);
  return (
    <div style={{ width: "100%", height }} role="img" aria-label={rows.map((row) => `${row.label}: ${row.value}`).join(", ")}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={tokens.colorNeutralStroke2} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: tokens.colorNeutralForeground3, fontSize: 12 }} stroke={tokens.colorNeutralStroke1} />
          <YAxis type="category" dataKey="label" width={110} tick={{ fill: tokens.colorNeutralForeground2, fontSize: 12 }} stroke={tokens.colorNeutralStroke1} />
          <Tooltip
            cursor={{ fill: tokens.colorNeutralBackground1Hover }}
            contentStyle={{ background: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke1}`, color: tokens.colorNeutralForeground1 }}
            formatter={(value, _name, item) => {
              const of = (item.payload as SeriesRow | undefined)?.of;
              return [of ? `${value} of ${of}` : String(value), "Spaces"];
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {rows.map((row) => <Cell key={row.label} fill={barColorFor(row)} />)}
            {/* Values at bar ends: on a linear scale, 8 beside 896 is a sliver nobody can read. */}
            <LabelList dataKey="value" position="right" fill={tokens.colorNeutralForeground2} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Donut({ rows, total }: { rows: SeriesRow[]; total: number }) {
  const styles = useStyles();
  return (
    <div>
      <div style={{ width: "100%", height: 200 }} role="img" aria-label={rows.map((row) => `${row.label}: ${row.value} of ${total}`).join(", ")}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" stroke={tokens.colorNeutralBackground1}>
              {rows.map((row, index) => <Cell key={row.label} fill={colorFor(row, index)} />)}
            </Pie>
            <Tooltip contentStyle={{ background: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke1}`, color: tokens.colorNeutralForeground1 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legend}>
        {rows.map((row, index) => (
          <span key={row.label}><span className={styles.swatch} style={{ background: colorFor(row, index) }} />{row.label} {row.value.toLocaleString()}</span>
        ))}
      </div>
    </div>
  );
}

function BayTiles({ rows }: { rows: BayRow[] }) {
  const styles = useStyles();
  return (
    <div className={styles.tiles}>
      {rows.map((row) => (
        <div key={row.bayId} className={styles.tile} style={{ borderLeftColor: TONE_COLORS[row.tone] }} title={`Space ${row.spaceNumber}, floor ${row.floor}, ${row.designation}: ${row.status}`}>
          <strong>{row.spaceNumber}</strong>
          <span className={styles.muted}>F{row.floor} · {row.plateDisplay ?? row.status}</span>
        </div>
      ))}
    </div>
  );
}

function BayTable({ rows }: { rows: BayRow[] }) {
  const styles = useStyles();
  return (
    <div className={styles.tableWrap}>
      <Table size="small" aria-label="Bays">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Space</TableHeaderCell>
            <TableHeaderCell>Floor</TableHeaderCell>
            <TableHeaderCell>Type</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Plate</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.bayId}>
              <TableCell>{row.spaceNumber}{row.reserved ? " (reserved)" : ""}</TableCell>
              <TableCell>{row.floor}</TableCell>
              <TableCell>{row.designation}</TableCell>
              <TableCell><span style={{ color: TONE_COLORS[row.tone] }}>●</span> {row.status}{row.issue ? ` · ${row.issue}` : ""}</TableCell>
              <TableCell>{row.plateDisplay ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Camera links are signed and expire within minutes, so they are never part of
 * a view. One is requested only when the user opens the preview, the same way
 * the SPFx drill-down does.
 */
function CameraPreview({ bayId, label, context }: { bayId: string; label: string; context: RenderContext }) {
  const styles = useStyles();
  const [state, setState] = useState<"idle" | "loading" | "error" | { url: string }>("idle");

  useEffect(() => setState("idle"), [bayId]);

  const open = async () => {
    setState("loading");
    try {
      const response = await fetch(`${context.base}/api/camera-preview-url?bayId=${encodeURIComponent(bayId)}`, { headers: await context.authHeaders() });
      if (!response.ok) throw new Error(String(response.status));
      const { imageUrl } = (await response.json()) as { imageUrl: string };
      setState({ url: imageUrl });
    } catch {
      setState("error");
    }
  };

  return (
    <Card className={styles.card}>
      <Text weight="semibold">Camera · {label}</Text>
      {state === "idle" && <Button icon={<Video20Regular />} onClick={open}>Show camera</Button>}
      {state === "loading" && <Spinner size="small" label="Loading camera" />}
      {state === "error" && <Text className={styles.muted}>The camera image is unavailable.</Text>}
      {typeof state === "object" && <img className={styles.camera} src={state.url} alt={`Camera view of ${label}`} onError={() => setState("error")} />}
    </Card>
  );
}
