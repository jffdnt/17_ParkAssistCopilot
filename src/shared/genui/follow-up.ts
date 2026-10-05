import type { HydratedLeaf, Source } from "./spec.js";

/**
 * "Ask about this" on a tile sends the tile's binding with the question, so
 * the model re-reads exactly the data behind it instead of guessing which
 * query "these spaces" meant. A tile reading "47" for floors 7-9 must lead to
 * a follow-up about floors 7-9, not the whole garage.
 *
 * Type-only imports: the browser uses this module, and importing values from
 * spec.ts would bundle Zod into the page.
 */

const MARKER = "[About: ";

/** Omit applied to each member of a union; plain Omit keeps only the keys they share. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface FollowUpBinding {
  component: HydratedLeaf["type"];
  metric?: string;
  dataset?: string;
  /** The source query and its arguments, without the spec-local id. */
  source?: DistributiveOmit<Source, "id">;
}

export function followUpBinding(leaf: HydratedLeaf, sources: readonly Source[]): FollowUpBinding {
  const binding: FollowUpBinding = { component: leaf.type };
  if ("metric" in leaf) binding.metric = leaf.metric;
  if ("dataset" in leaf) binding.dataset = leaf.dataset;
  if ("source" in leaf) {
    const source = sources.find((entry) => entry.id === leaf.source);
    if (source) {
      const { id: _id, ...query } = source;
      binding.source = query;
    }
  }
  return binding;
}

/** The message sent: a readable question, then the binding on its own line for the model. */
export function followUpQuestion(topic: string, binding: FollowUpBinding): string {
  return `Tell me more about ${topic}.\n${MARKER}${JSON.stringify(binding)}]`;
}

/** Splits a sent message back into the question and its binding, for display. */
export function splitFollowUp(text: string): { question: string; binding?: FollowUpBinding } {
  const at = text.lastIndexOf(`\n${MARKER}`);
  if (at === -1 || !text.endsWith("]")) return { question: text };
  try {
    const binding = JSON.parse(text.slice(at + 1 + MARKER.length, -1)) as FollowUpBinding;
    return { question: text.slice(0, at), binding };
  } catch {
    return { question: text };
  }
}
