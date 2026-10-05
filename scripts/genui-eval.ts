/**
 * Golden-prompt evaluation for the generative UI, against a real Azure OpenAI
 * deployment and the live garage feed. Run manually:
 *
 *   AZURE_OPENAI_RESOURCE=... AZURE_OPENAI_DEPLOYMENT=... npx tsx scripts/genui-eval.ts
 *
 * View numbers come from the snapshot by construction, so checking them
 * against the data service would prove nothing. What this measures is the
 * model's behaviour: does it produce a valid view, how many attempts does it
 * take, and does its closing reply quote only numbers it was given, and not
 * statistics taken from the partial bay sample?
 *
 * These checks are necessary, not sufficient: the 2026-10-03 walkthrough found
 * misleading views while every check here passed. Look at real views too.
 */
import { generateText, stepCountIs } from "ai";
import { isLayout, strayNumbers, type UiNode, type UiSpec } from "../src/shared/genui/spec.js";
import { config } from "../src/server/config.js";
import { createGenUiModel } from "../src/server/genui/model.js";
import { genUiSystemPrompt } from "../src/server/genui/prompt.js";
import { TurnSnapshot } from "../src/server/genui/snapshot.js";
import { createGenUiTools, type RenderViewOutput } from "../src/server/genui/tools.js";
import { loadBayMap } from "../src/server/services/bay-map.js";
import { CameraUrlSigner } from "../src/server/services/camera-signing.js";
import { ParkingDataService } from "../src/server/services/parking-data.js";

const PROMPTS = [
  "How full is the garage right now?",
  "How many spaces are available?",
  "Available spaces on floors 7 to 9",
  "Any free Handicapped spaces?",
  "Where is plate ABC?",
  "Which floors have the most stale cameras?",
  "Show me stale camera feeds on floor 7",
  "How long have occupied spaces been parked?",
  "Break down out-of-service spaces by floor",
  "Compare availability on floor 3 and floor 9",
  "What space types are occupied?",
  "Give me a garage health dashboard",
  // Regressions from the 2026-10-03 live walkthrough: each produced a wrong or
  // misleading view while the checks above all passed.
  "I drive a company EV. Where can I park, and is the camera working there?",
  "What's the longest anyone has been parked?",
  "Which floor is worst for cameras, and how many are stale overall?",
  'Tell me more about floors with stale cameras.\n[About: {"component":"barChart","dataset":"floorBreakdown","source":{"query":"staleFeeds"}}]',
];

interface Outcome {
  prompt: string;
  rendered: boolean;
  attempts: number;
  rejectedProblems: string[];
  leaves: number;
  inventedNumbers: string[];
  /** Numbers in the closing reply found only in the bay sample: statistics over partial data. */
  sampleOnlyNumbers: string[];
  /** Numbers in the accepted view's own text. The server rejects these, so this should always be empty. */
  freeTextNumbers: string[];
  ms: number;
  usage: Usage;
  error?: string;
}

interface Usage {
  modelCalls: number;
  input: number;
  cachedInput: number;
  output: number;
  reasoning: number;
}

/**
 * USD per 1M tokens. Defaults are gpt-5.4-mini, Global Standard, Azure retail
 * price list on 2026-10-02; override when testing another deployment.
 */
const PRICE = {
  input: Number(process.env.GENUI_PRICE_INPUT ?? 0.75),
  cachedInput: Number(process.env.GENUI_PRICE_CACHED_INPUT ?? 0.075),
  output: Number(process.env.GENUI_PRICE_OUTPUT ?? 4.5),
};

/** Reasoning tokens are billed as output and are already counted in `output`. */
function costOf(usage: Usage): number {
  const uncached = usage.input - usage.cachedInput;
  return (uncached * PRICE.input + usage.cachedInput * PRICE.cachedInput + usage.output * PRICE.output) / 1_000_000;
}

const emptyUsage = (): Usage => ({ modelCalls: 0, input: 0, cachedInput: 0, output: 0, reasoning: 0 });

const REJECTION_CAUSES: [string, RegExp][] = [
  ["numbers in text", /must not state counts/],
  ["unavailable metric", /is not available from/],
  ["dataset/source mismatch", /needs a .* source, not/],
  ["overlapping donut", /cannot be a donut/],
  ["unknown source", /which is not in `sources`/],
  ["limits", /nested|leaves; the limit/],
];

/** Every piece of text the model wrote in a view: titles and callouts. */
function freeTextOf(spec: UiSpec): string[] {
  const texts: string[] = [spec.title];
  const visit = (node: UiNode) => {
    if ("title" in node && node.title) texts.push(node.title);
    if (node.type === "callout") texts.push(node.text);
    if (isLayout(node)) node.children.forEach(visit);
  };
  visit(spec.root);
  return texts;
}

async function main() {
  if (!config.azureOpenAiResource || !config.azureOpenAiDeployment) {
    throw new Error("Set AZURE_OPENAI_RESOURCE and AZURE_OPENAI_DEPLOYMENT.");
  }
  const model = createGenUiModel(config.azureOpenAiResource, config.azureOpenAiDeployment);
  const parking = new ParkingDataService({
    mapRows: await loadBayMap(),
    apiBaseUrl: config.parkAssistApiBaseUrl,
    garage: config.garage,
    staleAfterMinutes: config.staleAfterMinutes,
    cacheSeconds: config.cacheSeconds,
    signer: new CameraUrlSigner(config.publicBaseUrl, config.cameraSigningSecret, config.cameraUrlTtlSeconds),
  });
  const system = genUiSystemPrompt(config.garage);

  const outcomes: Outcome[] = [];
  for (const prompt of PROMPTS) {
    const started = performance.now();
    const outcome: Outcome = { prompt, rendered: false, attempts: 0, rejectedProblems: [], leaves: 0, inventedNumbers: [], sampleOnlyNumbers: [], freeTextNumbers: [], ms: 0, usage: emptyUsage() };
    try {
      const tools = createGenUiTools(new TurnSnapshot(parking), parking);
      const result = await generateText({ model, system, prompt, tools, stopWhen: stepCountIs(8) });
      const total = result.totalUsage;
      outcome.usage = {
        modelCalls: result.steps.length,
        input: total.inputTokens ?? 0,
        cachedInput: total.inputTokenDetails?.cacheReadTokens ?? 0,
        output: total.outputTokens ?? 0,
        reasoning: total.outputTokenDetails?.reasoningTokens ?? 0,
      };

      // What the model was shown, split into whole-set facts (totals, breakdowns,
      // stats, render summaries) and the bay sample, which is only partial.
      let given = "";
      let sample = "";
      for (const step of result.steps) {
        for (const toolResult of step.toolResults) {
          if (toolResult.toolName === "render_view") {
            const output = toolResult.output as RenderViewOutput;
            outcome.attempts += 1;
            if (output.ok) {
              outcome.rendered = true;
              given += output.summary;
              outcome.leaves = (output.summary.match(/^- /gm) ?? []).length;
              outcome.freeTextNumbers = freeTextOf(toolResult.input as UiSpec).flatMap(strayNumbers);
              // Unfilled tokens shown to the user, as "{{occ.stats.parkedMinutes.min}}" once was.
              if (/\{\{/.test(output.summary)) outcome.freeTextNumbers.push("raw {{token}} on screen");
            } else {
              outcome.rejectedProblems.push(...output.problems);
            }
          } else {
            const { sampleBays, ...facts } = toolResult.output as Record<string, unknown>;
            given += JSON.stringify(facts);
            sample += JSON.stringify(sampleBays ?? "");
          }
        }
      }
      // Floors 1-11 and numbers in the user's own prompt are not counts it could invent.
      const givenNumbers = new Set(given.match(/\d+/g) ?? []);
      const sampleNumbers = new Set(sample.match(/\d+/g) ?? []);
      const promptNumbers = new Set(prompt.match(/\d+/g) ?? []);
      const replyNumbers = [...new Set(result.text.match(/\d[\d,]*/g) ?? [])]
        .map((number) => number.replace(/,/g, ""))
        .filter((number) => !givenNumbers.has(number) && !promptNumbers.has(number) && !(Number(number) >= 1 && Number(number) <= 11));
      outcome.sampleOnlyNumbers = replyNumbers.filter((number) => sampleNumbers.has(number));
      outcome.inventedNumbers = replyNumbers.filter((number) => !sampleNumbers.has(number));
    } catch (error) {
      outcome.error = error instanceof Error ? error.message : String(error);
    }
    outcome.ms = Math.round(performance.now() - started);
    outcomes.push(outcome);
    const suspect = outcome.inventedNumbers.length + outcome.sampleOnlyNumbers.length + outcome.freeTextNumbers.length;
    const mark = outcome.error ? "ERROR" : outcome.rendered ? (suspect ? "WARN " : "PASS ") : "FAIL ";
    const u = outcome.usage;
    console.log(`${mark} ${prompt.split("\n")[0]}  [${outcome.attempts} attempt(s), ${outcome.leaves} leaves, ${outcome.ms} ms]` +
      `  tokens: ${u.modelCalls} calls, ${u.input} in (${u.cachedInput} cached), ${u.output} out (${u.reasoning} reasoning), $${costOf(u).toFixed(4)}` +
      (outcome.inventedNumbers.length ? `  invented: ${outcome.inventedNumbers.join(", ")}` : "") +
      (outcome.sampleOnlyNumbers.length ? `  from sample only: ${outcome.sampleOnlyNumbers.join(", ")}` : "") +
      (outcome.freeTextNumbers.length ? `  numbers in view text: ${outcome.freeTextNumbers.join(", ")}` : "") +
      (outcome.error ? `  ${outcome.error}` : ""));
    for (const problem of outcome.rejectedProblems) console.log(`        rejected: ${problem}`);
  }

  const rendered = outcomes.filter((outcome) => outcome.rendered).length;
  const firstTry = outcomes.filter((outcome) => outcome.rendered && outcome.attempts === 1).length;
  const clean = outcomes.filter((outcome) => outcome.rendered && outcome.inventedNumbers.length === 0).length;
  const noSample = outcomes.filter((outcome) => outcome.rendered && outcome.sampleOnlyNumbers.length === 0).length;
  const noFreeText = outcomes.filter((outcome) => outcome.rendered && outcome.freeTextNumbers.length === 0).length;
  console.log(`\nRendered ${rendered}/${outcomes.length}; first try ${firstTry}.`);
  console.log(
    `Reply numbers: grounded ${clean}/${outcomes.length}, none from the sample only ${noSample}/${outcomes.length}. ` +
      `View text free of numbers ${noFreeText}/${outcomes.length} (enforced by the server).`,
  );
  const causes = new Map<string, number>();
  for (const problem of outcomes.flatMap((outcome) => outcome.rejectedProblems)) {
    const cause = REJECTION_CAUSES.find(([, pattern]) => pattern.test(problem))?.[0] ?? "other";
    causes.set(cause, (causes.get(cause) ?? 0) + 1);
  }
  if (causes.size > 0) console.log(`Rejections by cause: ${[...causes].map(([cause, count]) => `${cause} ${count}`).join(", ")}.`);
  const sum = outcomes.reduce((acc, { usage }) => ({
    modelCalls: acc.modelCalls + usage.modelCalls,
    input: acc.input + usage.input,
    cachedInput: acc.cachedInput + usage.cachedInput,
    output: acc.output + usage.output,
    reasoning: acc.reasoning + usage.reasoning,
  }), emptyUsage());
  const runCost = costOf(sum);
  const perQuestion = runCost / outcomes.length;
  const cachedShare = Math.round((sum.cachedInput / Math.max(sum.input, 1)) * 100);
  console.log(`Tokens: ${sum.input} in (${sum.cachedInput} cached, ${cachedShare}%), ${sum.output} out (${sum.reasoning} reasoning) over ${sum.modelCalls} model calls.`);
  console.log(
    `Cost: $${runCost.toFixed(4)} this run, $${perQuestion.toFixed(4)} per question, ` +
      `~$${(perQuestion * 1250).toFixed(2)} for a 1,250-question dev month ` +
      `(at $${PRICE.input} / $${PRICE.cachedInput} / $${PRICE.output} per 1M input / cached / output).`,
  );

  process.exitCode = rendered === outcomes.length && clean === outcomes.length ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
