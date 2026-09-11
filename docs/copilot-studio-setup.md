# Copilot Studio and Teams setup

This guide keeps the Power Platform agent as the primary ownership surface and uses the Microsoft 365 package when inline React MCP Apps are required.

## 1. Deploy the MCP service

Deploy the container to a public HTTPS endpoint, for example `https://parkassist-copilot.<region>.azurecontainerapps.io`.

Production values:

```text
PUBLIC_BASE_URL=https://parkassist-copilot.<region>.azurecontainerapps.io
ALLOWED_HOSTS=parkassist-copilot.<region>.azurecontainerapps.io
PARKING_GARAGE=5 Bell
STALE_AFTER_MINUTES=15
AUTH_MODE=entra
ENTRA_TENANT_ID=<tenant id>
ENTRA_CLIENT_ID=<API application client id>
ENTRA_REQUIRED_SCOPE=access_as_user
CAMERA_SIGNING_SECRET=<random 32+ character secret>
SHAREPOINT_SITE_URL=https://castletonstage.sharepoint.com/sites/Development
SHAREPOINT_LIST_NAME=SensorHealth
```

Verify `GET /health` and run `npm run smoke` with `MCP_SERVER_URL` set to the deployed `/mcp` URL.

For an initial Copilot Studio-only pilot, `AUTH_MODE=api-key` can be used with an `x-api-key` header. Do not use anonymous authentication outside local development. The Microsoft 365 MCP plugin route does not support API-key authentication, so use Entra SSO there.

## 2. Add the MCP server to Copilot Studio

The current recommended path is the MCP onboarding wizard:

1. Open **ParkAssist Copilot** (`fivebell_ParkAssistCopilot`) in the target Copilot Studio environment. The initial agent already exists in the development tenant.
2. Enable generative orchestration.
3. Go to **Tools** → **Add a tool** → **New tool** → **Model Context Protocol**.
4. Enter:
   - Server name: `ParkAssist Garage MCP`
   - Description: `Live read-only parking availability, authorized license-plate lookup, and stale camera-feed review for 5 Bell.`
   - Server URL: the public `https://.../mcp` endpoint.
5. Choose authentication:
   - Pilot: **API key**, Header, name `x-api-key`.
   - Production: **OAuth 2.0**, Manual, using the Entra API registration and its `access_as_user` scope.
6. Create a connection and select **Add to agent**.
7. Open the MCP tool settings and confirm all four tools appear. Keep **Allow all** on unless the pilot should omit plate search.

Copilot Studio requires Streamable HTTP; SSE is not supported. This server uses Streamable HTTP.

### Power Apps custom-connector fallback

If the onboarding wizard is unavailable in the environment:

1. Replace `host` in `connector/mcp-connector.swagger.yaml` with the deployed hostname.
2. In Power Apps, create a custom connector by importing that OpenAPI file.
3. Configure the connection secret for header `x-api-key`.
4. Return to Copilot Studio and add the custom connector as the agent's MCP tool.

## 3. Set agent behavior

Use the contents of `appPackage/instruction.txt` as the agent instruction baseline. Confirm these test prompts in the Copilot Studio test pane:

- `Which cameras have stale feeds? Show me the bay previews.`
- `Show available General spaces on floor 5.`
- `Find plate ABC123.`
- `Give me a live overview of the 5 Bell garage.`

For stale feeds, verify the answer includes the space, bay ID, floor, camera age/missing timestamp, and preview. For a partial plate query, verify result lists stay masked.

## 4. Publish to Teams and Microsoft 365 Copilot

1. Publish the agent at least once.
2. Open **Channels** → **Teams and Microsoft 365 Copilot**.
3. Keep **Make agent available in Microsoft 365 Copilot** selected and add the channel.
4. Edit the details and use `appPackage/color.png` as the agent icon, accent `#0078D4`, and the descriptions from `appPackage/manifest.json`.
5. Select **See agent in Teams** and install it for yourself first.
6. In a new 1:1 conversation, repeat the four prompts above. Use **Start over** after republishing so Teams uses the newest agent version.
7. Only after personal validation, use **Availability options** to share with a small operations group or submit for admin approval.

Teams and Copilot Studio cache published agent versions. If a new build appears stale, start a new conversation, refresh/sign out and back in, and then retest before diagnosing the MCP server.

## 5. Enable inline React in Microsoft 365 Copilot

The declarative-agent package in `appPackage/` directly binds the MCP tools to the React `ui://` resource.

1. Register a single-tenant Entra API application and expose `access_as_user`.
2. In Microsoft 365 Agents Toolkit or Teams Developer Portal, create an Entra SSO authentication registration for the public MCP base URL.
3. Copy `env/.env.local.example` to `env/.env.local` and enter the Teams app ID, Entra client ID, SSO registration ID, endpoint, publisher URLs, and email.
4. Run `./scripts/package-agent.ps1` or use the **Provision** lifecycle in Microsoft 365 Agents Toolkit.
5. Sideload `appPackage/build/appPackage.local.zip` for the pilot.
6. In Microsoft 365 Copilot, select the agent and ask the stale-camera prompt. The Fluent UI camera grid should appear inline.

The package uses an OAuth token-store reference; it never contains a client secret.

## 6. Acceptance checklist

- The response is based on a live `/bays` request and names the generated time.
- A stale feed older than 15 minutes appears; a newer feed does not.
- A missing thumbnail timestamp is shown as `No telemetry`.
- Each returned stale bay has a valid preview or a clear preview-unavailable state.
- A preview URL expires and rejects a modified bay ID/signature.
- Available-space results exclude occupied, reserved, out-of-service, and missing-live bays.
- Partial plate results are masked; an exact match may reveal the full plate.
- Light and dark Teams themes are readable.
- An unauthenticated production MCP request is rejected.
- The agent works in a new 1:1 Teams conversation.

## References

- [Connect Copilot Studio to an existing MCP server](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent)
- [Add MCP tools and resources to a Copilot Studio agent](https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-components-to-agent)
- [Connect and configure an agent for Teams and Microsoft 365](https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-add-bot-to-microsoft-teams)
- [MCP Apps in Microsoft 365 Copilot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-mcp-apps)
- [Configure MCP plugin authentication](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication)
