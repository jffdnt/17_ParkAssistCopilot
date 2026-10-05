import { convertToModelMessages, safeValidateUIMessages, stepCountIs, streamText, type LanguageModel, type UIMessage } from "ai";
import type { Request, Response } from "express";
import type { ParkingDataService } from "../services/parking-data.js";
import { genUiSystemPrompt } from "./prompt.js";
import { TurnSnapshot } from "./snapshot.js";
import { createGenUiTools } from "./tools.js";

/** Most messages taken from the client per turn. Older context is dropped rather than rejected. */
const MAX_HISTORY = 30;
/** Model steps per turn: a few data reads, a render, maybe one corrected render, then the reply. */
const MAX_STEPS = 8;

/**
 * POST /api/genui/chat: one chat turn, streamed back as AI SDK UI messages.
 *
 * The browser sends its history, which is untrusted input. It is validated
 * against the tool schemas before it reaches the model. Earlier views arrive as
 * summaries only (see the client's request preparation). Each turn gets a fresh
 * `TurnSnapshot`, so data never leaks between users or turns.
 */
export function createGenUiChatHandler(parking: ParkingDataService, model: LanguageModel, garage: string) {
  const system = genUiSystemPrompt(garage);

  return async (request: Request, response: Response): Promise<void> => {
    const snapshot = new TurnSnapshot(parking);
    const tools = createGenUiTools(snapshot, parking);

    const history: unknown = request.body?.messages;
    if (!Array.isArray(history) || history.length === 0) {
      response.status(400).json({ error: "messages must be a non-empty array." });
      return;
    }
    const validated = await safeValidateUIMessages<UIMessage>({ messages: history.slice(-MAX_HISTORY), tools });
    if (!validated.success) {
      response.status(400).json({ error: "messages are not valid chat messages." });
      return;
    }

    const abort = new AbortController();
    // Stop paying for model calls once the user has gone.
    response.on("close", () => {
      if (!response.writableFinished) abort.abort();
    });

    const result = streamText({
      model,
      system,
      messages: await convertToModelMessages(validated.data, { tools, ignoreIncompleteToolCalls: true }),
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: abort.signal,
      // Logged once, below, where the browser-facing message is chosen. The default prints it a second time.
      onError: () => {},
    });

    await result.pipeUIMessageStreamToResponse(response, {
      onError: (error) => {
        console.error("Generative UI turn failed.", error);
        // Upstream and model errors can carry internal detail; the browser gets a fixed message.
        return "ParkAssist could not complete that answer. Try again in a moment.";
      },
    });
  };
}
