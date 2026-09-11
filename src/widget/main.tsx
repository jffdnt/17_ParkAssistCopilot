import { StrictMode, useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { CallToolResult } from "@modelcontextprotocol/client";
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  FluentProvider,
  ProgressBar,
  Spinner,
  Text,
  Tooltip,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  ArrowExpand20Regular,
  Building20Regular,
  CameraOff20Regular,
  CheckmarkCircle20Filled,
  Clock20Regular,
  Location20Regular,
  VehicleCar20Regular,
  VehicleCarParking20Regular,
  ShieldError20Regular,
  VehicleCarProfileLtr20Regular,
  Warning20Filled,
} from "@fluentui/react-icons";
import type { GarageBayResult, GarageToolResult } from "../shared/contracts";
import { stalePreviewFixture } from "./preview-fixture";
import "./styles.css";

type WidgetState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: GarageToolResult };

function GarageWidget(): ReactElement {
  const [state, setState] = useState<WidgetState>({ status: "loading" });
  const [hostContext, setHostContext] = useState<McpUiHostContext>();
  const [refreshing, setRefreshing] = useState(false);

  const { app, error } = useApp({
    appInfo: { name: "ParkAssist Garage Copilot", version: "0.1.0" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      createdApp.ontoolresult = async (toolResult) => {
        const parsed = parseToolResult(toolResult);
        setState(parsed
          ? { status: "ready", result: parsed }
          : { status: "error", message: "The garage response did not contain displayable data." });
      };
      createdApp.onhostcontextchanged = (context) => {
        setHostContext((current) => ({ ...current, ...context }));
      };
      createdApp.onteardown = async () => ({});
      createdApp.onerror = (appError) => {
        console.error(appError);
        setState({ status: "error", message: "The garage experience lost its connection to Copilot." });
      };
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  useEffect(() => {
    if (error) setState({ status: "error", message: error.message });
  }, [error]);

  const theme = hostContext?.theme === "dark" ? webDarkTheme : webLightTheme;
  const canExpand = hostContext?.availableDisplayModes?.includes("fullscreen") ?? false;

  const refresh = useCallback(async () => {
    if (!app || state.status !== "ready") return;
    setRefreshing(true);
    try {
      const request = toolRequestFor(state.result);
      const toolResult = await app.callServerTool(request);
      const parsed = parseToolResult(toolResult);
      if (!parsed) throw new Error("No structured garage data was returned.");
      setState({ status: "ready", result: parsed });
    } catch (refreshError) {
      setState({
        status: "error",
        message: refreshError instanceof Error ? refreshError.message : "The garage data could not be refreshed.",
      });
    } finally {
      setRefreshing(false);
    }
  }, [app, state]);

  const expand = useCallback(async () => {
    if (app && canExpand) await app.requestDisplayMode({ mode: "fullscreen" });
  }, [app, canExpand]);

  return (
    <FluentProvider theme={theme} className="provider">
      <main
        className="app-shell"
        style={{
          paddingTop: hostContext?.safeAreaInsets?.top,
          paddingRight: hostContext?.safeAreaInsets?.right,
          paddingBottom: hostContext?.safeAreaInsets?.bottom,
          paddingLeft: hostContext?.safeAreaInsets?.left,
        }}
      >
        {state.status === "loading" && <LoadingState />}
        {state.status === "error" && <ErrorState message={state.message} onRetry={() => void refresh()} canRetry={Boolean(app)} />}
        {state.status === "ready" && (
          <ResultView
            result={state.result}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            onExpand={() => void expand()}
            canExpand={canExpand}
          />
        )}
      </main>
    </FluentProvider>
  );
}

function ResultView(props: {
  result: GarageToolResult;
  refreshing: boolean;
  onRefresh: () => void;
  onExpand: () => void;
  canExpand: boolean;
}): ReactElement {
  const { result } = props;
  return (
    <div className="result-enter">
      <header className="masthead">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><VehicleCarParking20Regular /></div>
          <div>
            <Text as="h1" size={500} weight="semibold">{result.title}</Text>
            <div className="eyebrow"><Building20Regular /> {result.garage} Garage</div>
          </div>
        </div>
        <div className="header-actions">
          {props.canExpand && (
            <Tooltip content="Open a larger garage view" relationship="label">
              <Button appearance="subtle" icon={<ArrowExpand20Regular />} aria-label="Expand garage view" onClick={props.onExpand} />
            </Tooltip>
          )}
          <Tooltip content="Refresh live garage data" relationship="label">
            <Button
              appearance="subtle"
              icon={<ArrowClockwise20Regular />}
              aria-label="Refresh live garage data"
              disabled={props.refreshing}
              onClick={props.onRefresh}
            />
          </Tooltip>
        </div>
      </header>

      <section className="summary-panel" aria-label="Garage summary">
        <div className="summary-copy">
          <Text size={300}>{result.summary}</Text>
          <Text size={200} className="updated"><Clock20Regular /> Updated {formatTime(result.generatedAt)}</Text>
        </div>
        <OccupancyGauge result={result} />
      </section>

      <Metrics result={result} />

      {result.view === "overview" && <Overview result={result} />}
      {result.view === "availability" && <AvailableSpaces result={result} />}
      {result.view === "plate-search" && <PlateMatches result={result} />}
      {result.view === "stale-feeds" && <StaleFeeds result={result} />}

      {result.hasMore && (
        <div className="more-hint">Showing {result.bays.length} of {result.totalMatches}. Ask Copilot for a floor or the next page.</div>
      )}
    </div>
  );
}

function OccupancyGauge({ result }: { result: GarageToolResult }): ReactElement {
  return (
    <div className="occupancy-gauge" aria-label={`${result.metrics.occupancyPercent}% occupied`}>
      <div className="gauge-value">{result.metrics.occupancyPercent}%</div>
      <div className="gauge-label">occupied</div>
      <ProgressBar value={result.metrics.occupancyPercent / 100} thickness="large" />
    </div>
  );
}

function Metrics({ result }: { result: GarageToolResult }): ReactElement {
  const metrics = [
    { label: "Available", value: result.metrics.available, icon: <CheckmarkCircle20Filled />, tone: "success" },
    { label: "Occupied", value: result.metrics.occupied, icon: <VehicleCar20Regular />, tone: "brand" },
    { label: "Stale feeds", value: result.metrics.staleFeeds + result.metrics.missingFeeds, icon: <CameraOff20Regular />, tone: "warning" },
    { label: "Out of service", value: result.metrics.outOfService, icon: <ShieldError20Regular />, tone: "danger" },
  ];
  return (
    <section className="metric-grid" aria-label="Live garage metrics">
      {metrics.map((metric) => (
        <div className={`metric metric-${metric.tone}`} key={metric.label}>
          <div className="metric-icon" aria-hidden="true">{metric.icon}</div>
          <div><div className="metric-value">{metric.value}</div><div className="metric-label">{metric.label}</div></div>
        </div>
      ))}
    </section>
  );
}

function Overview({ result }: { result: GarageToolResult }): ReactElement {
  const operational = Math.max(0, result.metrics.live - result.metrics.outOfService);
  return (
    <section className="overview-strip">
      <div><span className="pulse-dot" /> Live telemetry from {result.metrics.live} of {result.metrics.configured} configured bays</div>
      <Badge appearance="tint" color={operational === result.metrics.live ? "success" : "warning"}>{operational} operational</Badge>
    </section>
  );
}

function AvailableSpaces({ result }: { result: GarageToolResult }): ReactElement {
  return (
    <section className="space-grid" aria-label="Available spaces">
      {result.bays.map((bay) => (
        <Card key={bay.bayId} className="space-card" size="small">
          <CardHeader
            image={<div className="space-number">{bay.spaceNumber}</div>}
            header={<Text weight="semibold">Floor {bay.floor}</Text>}
            description={<Text size={200}>{bay.designation}</Text>}
          />
          <div className="space-meta"><Location20Regular /> Bay {bay.bayId}</div>
        </Card>
      ))}
      {result.bays.length === 0 && <EmptyState icon={<VehicleCarParking20Regular />} message="No spaces match those filters right now." />}
    </section>
  );
}

function PlateMatches({ result }: { result: GarageToolResult }): ReactElement {
  return (
    <section className="plate-list" aria-label="License plate matches">
      {result.bays.map((bay) => (
        <Card key={bay.bayId} className="plate-card">
          <div className="plate-icon" aria-hidden="true"><VehicleCarProfileLtr20Regular /></div>
          <div className="plate-main">
            <div className="plate-number">{bay.plateDisplay ?? "Plate unavailable"}</div>
            <div className="space-meta">Space {bay.spaceNumber} • Floor {bay.floor} • Bay {bay.bayId}</div>
          </div>
          <Badge appearance="filled" color={bay.occupied ? "brand" : "success"}>{bay.occupied ? "Occupied" : "Vacant"}</Badge>
        </Card>
      ))}
      {result.bays.length === 0 && <EmptyState icon={<VehicleCarProfileLtr20Regular />} message="No matching vehicle is currently parked in the mapped garage." />}
    </section>
  );
}

function StaleFeeds({ result }: { result: GarageToolResult }): ReactElement {
  return (
    <section className="camera-grid" aria-label="Stale camera feeds">
      {result.bays.map((bay) => <CameraCard key={bay.bayId} bay={bay} threshold={result.staleAfterMinutes} />)}
      {result.bays.length === 0 && <EmptyState icon={<CheckmarkCircle20Filled />} message="Every mapped camera feed is within the freshness threshold." />}
    </section>
  );
}

function CameraCard({ bay, threshold }: { bay: GarageBayResult; threshold: number }): ReactElement {
  const [imageFailed, setImageFailed] = useState(false);
  const age = bay.thumbnailAgeMinutes == null ? "No timestamp" : formatAge(bay.thumbnailAgeMinutes);
  const badges = useMemo(() => [
    bay.outOfService ? <Badge key="oos" color="danger" appearance="filled">Out of service</Badge> : null,
    bay.health?.isActive ? <Badge key="health" color="warning" appearance="tint">{bay.health.issueType ?? "Health alert"}</Badge> : null,
  ].filter(Boolean), [bay]);

  return (
    <Card className="camera-card">
      <div className="camera-preview">
        {bay.imageUrl && !imageFailed ? (
          <img src={bay.imageUrl} alt={`Last camera preview for parking space ${bay.spaceNumber}`} onError={() => setImageFailed(true)} />
        ) : (
          <div className="camera-fallback"><CameraOff20Regular /><span>Preview unavailable</span></div>
        )}
        <div className="camera-age"><Warning20Filled /> {age}</div>
      </div>
      <div className="camera-content">
        <div className="camera-title-row">
          <div>
            <Text as="h2" size={400} weight="semibold">Space {bay.spaceNumber}</Text>
            <div className="space-meta">Bay {bay.bayId} • Floor {bay.floor} • {bay.designation}</div>
          </div>
          <Badge appearance="filled" color={bay.feedState === "missing" ? "danger" : "warning"}>
            {bay.feedState === "missing" ? "No telemetry" : `>${threshold} min`}
          </Badge>
        </div>
        {badges.length > 0 && <div className="badge-row">{badges}</div>}
        <div className="camera-status-row">
          <span><span className={`status-dot ${bay.occupied ? "occupied" : "vacant"}`} /> {bay.occupied ? "Occupied" : "Vacant"}</span>
          <span>Last contact {bay.lastContactAgeMinutes == null ? "unknown" : `${formatAge(bay.lastContactAgeMinutes)} ago`}</span>
        </div>
      </div>
    </Card>
  );
}

function LoadingState(): ReactElement {
  return <div className="center-state"><div className="loading-orbit"><Spinner size="huge" /></div><Text weight="semibold">Reading live garage telemetry…</Text></div>;
}

function ErrorState({ message, onRetry, canRetry }: { message: string; onRetry: () => void; canRetry: boolean }): ReactElement {
  return (
    <div className="center-state error-state">
      <CameraOff20Regular />
      <Text as="h1" size={500} weight="semibold">Garage view unavailable</Text>
      <Text>{message}</Text>
      {canRetry && <Button appearance="primary" icon={<ArrowClockwise20Regular />} onClick={onRetry}>Try again</Button>}
    </div>
  );
}

function EmptyState({ icon, message }: { icon: ReactNode; message: string }): ReactElement {
  return <div className="empty-state"><div aria-hidden="true">{icon}</div><Text>{message}</Text></div>;
}

function parseToolResult(result: CallToolResult): GarageToolResult | null {
  const candidate = result.structuredContent as Partial<GarageToolResult> | undefined;
  if (!candidate || typeof candidate.view !== "string" || !candidate.metrics || !Array.isArray(candidate.bays)) return null;
  return candidate as GarageToolResult;
}

function toolRequestFor(result: GarageToolResult): Parameters<App["callServerTool"]>[0] {
  switch (result.view) {
    case "availability":
      return { name: "find-available-spaces", arguments: { ...result.filters, limit: 12, page: 1 } };
    case "plate-search":
      return { name: "search-license-plate", arguments: { query: result.query ?? "", limit: 12, page: 1 } };
    case "stale-feeds":
      return { name: "get-stale-camera-feeds", arguments: { ...result.filters, thresholdMinutes: result.staleAfterMinutes, limit: 12, page: 1 } };
    default:
      return { name: "garage-overview", arguments: {} };
  }
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1_440)}d`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "just now" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const previewMode = new URLSearchParams(window.location.search).get("preview");
const previewTheme = new URLSearchParams(window.location.search).get("theme") === "dark" ? webDarkTheme : webLightTheme;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {previewMode ? (
      <FluentProvider theme={previewTheme} className="provider">
        <main className="app-shell">
          <ResultView
            result={stalePreviewFixture}
            refreshing={false}
            onRefresh={() => undefined}
            onExpand={() => undefined}
            canExpand={false}
          />
        </main>
      </FluentProvider>
    ) : <GarageWidget />}
  </StrictMode>,
);
