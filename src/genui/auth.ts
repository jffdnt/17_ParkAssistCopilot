import { PublicClientApplication, InteractionRequiredAuthError, type AccountInfo } from "@azure/msal-browser";

/** What the server says about sign-in (GET /genui/config.json). */
type ServerAuthConfig =
  | { authMode: "none" }
  | { authMode: "api-key" }
  | { authMode: "entra"; tenantId: string; clientId: string; scope: string };

/** Returns headers for an API call; rejects when the user cannot be signed in. */
export type AuthHeaders = () => Promise<Record<string, string>>;

/**
 * Sets up sign-in for the page. With AUTH_MODE=none (local development only;
 * the server refuses it in production) no token is needed. With entra, the
 * page signs the user in against the ParkAssist Copilot app registration and
 * sends a delegated token, the same check /api/* already applies.
 */
export async function initAuth(base: string): Promise<AuthHeaders> {
  const response = await fetch(`${base}/genui/config.json`);
  if (!response.ok) throw new Error("ParkAssist is not available right now.");
  const config = (await response.json()) as ServerAuthConfig;

  if (config.authMode === "none") return async () => ({});
  if (config.authMode === "api-key") {
    throw new Error("This server uses API-key auth, which a browser page cannot hold. Use AUTH_MODE=entra.");
  }

  const msal = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: `${window.location.origin}/genui`,
    },
    cache: { cacheLocation: "sessionStorage" },
  });
  await msal.initialize();
  const redirect = await msal.handleRedirectPromise();
  const account: AccountInfo | null = redirect?.account ?? msal.getAllAccounts()[0] ?? null;
  if (!account) {
    await msal.loginRedirect({ scopes: [config.scope] });
    // The page navigates away; this promise never settles.
    return new Promise(() => {});
  }
  msal.setActiveAccount(account);

  return async () => {
    try {
      const token = await msal.acquireTokenSilent({ scopes: [config.scope], account: account! });
      return { Authorization: `Bearer ${token.accessToken}` };
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        await msal.acquireTokenRedirect({ scopes: [config.scope], account: account! });
      }
      throw error;
    }
  };
}
