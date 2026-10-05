import { useChat } from "@ai-sdk/react";
import {
  Button,
  Card,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Pin20Filled, Pin20Regular, Send20Filled, Stop20Regular } from "@fluentui/react-icons";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { splitFollowUp, type FollowUpBinding } from "../shared/genui/follow-up.js";
import type { HydratedSpec } from "../shared/genui/spec.js";
import type { AuthHeaders } from "./auth.js";
import { ViewRenderer, type RenderContext } from "./Renderer.js";

/** What `render_view` returns; `view` is stripped from older turns before they are sent back. */
type RenderViewOutput = { ok: true; summary: string; view?: HydratedSpec } | { ok: false; problems: string[] };

interface RenderedView {
  id: string;
  view: HydratedSpec;
}

const SUGGESTIONS = [
  "How full is the garage right now?",
  "Available spaces on floors 7 to 9",
  "Which floors have the most stale cameras?",
  "How long have occupied spaces been parked?",
];

const useStyles = makeStyles({
  shell: {
    display: "grid",
    gridTemplateColumns: "minmax(300px, 380px) minmax(0, 1fr)",
    height: "100dvh",
    background: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    "@media (max-width: 860px)": { gridTemplateColumns: "1fr", gridTemplateRows: "auto minmax(0, 1fr)", height: "auto", minHeight: "100dvh" },
  },
  chat: {
    display: "flex",
    flexDirection: "column",
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground1,
    minHeight: 0,
    "@media (max-width: 860px)": { borderRight: "none", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, maxHeight: "50dvh" },
  },
  chatHeader: { padding: "16px", borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: "flex", flexDirection: "column", gap: "2px" },
  log: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" },
  user: { alignSelf: "flex-end", background: tokens.colorBrandBackground2, padding: "8px 12px", borderRadius: tokens.borderRadiusLarge, maxWidth: "85%" },
  assistant: { alignSelf: "flex-start", maxWidth: "95%" },
  viewLink: { alignSelf: "flex-start" },
  composer: { padding: "12px 16px", borderTop: `1px solid ${tokens.colorNeutralStroke2}`, display: "flex", gap: "8px", alignItems: "flex-end" },
  canvas: { overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "24px", minWidth: 0, "@media (max-width: 640px)": { padding: "16px" } },
  empty: { margin: "auto", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "12px", textAlign: "center" },
  suggestions: { display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" },
  // flexShrink 0: Card clips its overflow, so a shrunk card hides the bottom of the view instead of scrolling.
  viewCard: { padding: "20px", flexShrink: 0, "@media (max-width: 640px)": { padding: "12px" } },
  viewToolbar: { display: "flex", justifyContent: "flex-end", marginBottom: "-8px" },
  muted: { color: tokens.colorNeutralForeground3 },
});

/**
 * Earlier views go back to the server as their text summary only. The model
 * needs what was shown, not the rows, and the full views would soon exceed
 * the server's 100 KB JSON body limit.
 */
function trimForRequest(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== "tool-render_view" || part.state !== "output-available") return part;
      const output = part.output as RenderViewOutput;
      return output.ok ? { ...part, output: { ok: true, summary: output.summary } } : part;
    }),
  }));
}

/** "staleFeeds · floors 7, 8, 9 · floorBreakdown": enough for the user to see which data a follow-up is about. */
function describeBinding(binding: FollowUpBinding): string {
  const parts: string[] = [];
  const source = binding.source;
  if (source) {
    parts.push(source.query);
    if ("floors" in source && source.floors) parts.push(`floors ${source.floors.join(", ")}`);
    if ("designation" in source && source.designation) parts.push(source.designation);
    if ("plate" in source) parts.push(source.plate.toUpperCase());
    if ("status" in source) parts.push(source.status);
  }
  if (binding.dataset) parts.push(binding.dataset);
  if (binding.metric) parts.push(binding.metric);
  return parts.length > 0 ? parts.join(" · ") : binding.component;
}

function viewsIn(message: UIMessage): RenderedView[] {
  return message.parts.flatMap((part) => {
    if (part.type !== "tool-render_view" || part.state !== "output-available") return [];
    const output = part.output as RenderViewOutput;
    return output.ok && output.view ? [{ id: part.toolCallId, view: output.view }] : [];
  });
}

export function App({ base, authHeaders }: { base: string; authHeaders: AuthHeaders }) {
  const styles = useStyles();
  const [input, setInput] = useState("");
  const [pinned, setPinned] = useState<string[]>([]);

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: `${base}/api/genui/chat`,
      prepareSendMessagesRequest: async ({ messages, body }) => ({
        body: { ...body, messages: trimForRequest(messages) },
        headers: await authHeaders(),
      }),
    }),
    [base, authHeaders],
  );
  const { messages, sendMessage, status, stop, error } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  const allViews = messages.flatMap(viewsIn);
  const latest = allViews.at(-1);
  // Pinned views stay on the canvas above the latest one, oldest first.
  const shown = [
    ...allViews.filter((entry) => pinned.includes(entry.id) && entry.id !== latest?.id),
    ...(latest ? [latest] : []),
  ];

  const ask = (text: string) => {
    if (!text.trim() || busy) return;
    void sendMessage({ text: text.trim() });
    setInput("");
  };
  const context: RenderContext = { base, authHeaders, ask };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    ask(input);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(input);
    }
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.chat} aria-label="Conversation">
        <div className={styles.chatHeader}>
          <Text as="h1" size={500} weight="semibold">ParkAssist</Text>
          <Text as="p" size={200} className={styles.muted}>Ask about the garage. Each answer is built as a live view.</Text>
        </div>
        <div className={styles.log} role="log" aria-live="polite">
          {messages.map((message) =>
            message.parts.map((part, index) => {
              const key = `${message.id}-${index}`;
              if (part.type === "text" && part.text.trim()) {
                if (message.role !== "user") {
                  return <div key={key} className={styles.assistant}><Text>{part.text}</Text></div>;
                }
                // A tile follow-up carries its binding for the model; show the question and a short note instead.
                const { question, binding } = splitFollowUp(part.text);
                return (
                  <div key={key} className={styles.user}>
                    <Text>{question}</Text>
                    {binding && <Text as="p" size={100} className={styles.muted}>About: {describeBinding(binding)}</Text>}
                  </div>
                );
              }
              if (part.type === "tool-render_view" && part.state === "output-available" && (part.output as RenderViewOutput).ok) {
                return <Text key={key} size={200} className={`${styles.viewLink} ${styles.muted}`}>Shown: {(part.output as { view?: HydratedSpec }).view?.title ?? "shown"}</Text>;
              }
              return null;
            }),
          )}
          {busy && <Spinner size="tiny" label="Building the view…" labelPosition="after" />}
          {error && (
            <MessageBar intent="error">
              <MessageBarBody>ParkAssist could not complete that answer. Try again in a moment.</MessageBarBody>
            </MessageBar>
          )}
        </div>
        <form className={styles.composer} onSubmit={onSubmit}>
          <Textarea
            value={input}
            onChange={(_event, data) => setInput(data.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. Where is plate ABC123?"
            resize="vertical"
            style={{ flex: 1 }}
            aria-label="Ask ParkAssist"
          />
          {busy
            ? <Button icon={<Stop20Regular />} onClick={() => stop()} aria-label="Stop" />
            : <Button appearance="primary" icon={<Send20Filled />} type="submit" disabled={!input.trim()} aria-label="Send" />}
        </form>
      </aside>

      <main className={styles.canvas} aria-label="Live view">
        {shown.length === 0 ? (
          <div className={styles.empty}>
            <Text size={500} weight="semibold">What do you want to see?</Text>
            <Text className={styles.muted}>Answers appear here as charts, tiles and tables built from live garage data.</Text>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <Button key={suggestion} size="small" onClick={() => ask(suggestion)} disabled={busy}>{suggestion}</Button>
              ))}
            </div>
          </div>
        ) : (
          shown.map((entry) => {
            const isPinned = pinned.includes(entry.id);
            return (
              <Card key={entry.id} className={styles.viewCard}>
                <div className={styles.viewToolbar}>
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={isPinned ? <Pin20Filled /> : <Pin20Regular />}
                    onClick={() => setPinned((current) => isPinned ? current.filter((id) => id !== entry.id) : [...current, entry.id])}
                  >
                    {isPinned ? "Unpin" : "Pin"}
                  </Button>
                </div>
                <ViewRenderer view={entry.view} context={context} />
              </Card>
            );
          })
        )}
      </main>
    </div>
  );
}
