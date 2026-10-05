import { createAzure } from "@ai-sdk/azure";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import type { LanguageModel } from "ai";

/**
 * The Azure OpenAI model behind the generative UI, authenticated with
 * Microsoft Entra rather than an API key: the Container App's managed identity
 * in Azure, the developer's `az login` locally. With `tokenProvider` set the
 * provider sends no `api-key` header at all, so there is no key to leak or
 * rotate. The identity needs the "Cognitive Services OpenAI User" role.
 */
export function createGenUiModel(resourceName: string, deployment: string): LanguageModel {
  const tokenProvider = getBearerTokenProvider(
    new DefaultAzureCredential(),
    "https://cognitiveservices.azure.com/.default",
  );
  return createAzure({ resourceName, tokenProvider })(deployment);
}
