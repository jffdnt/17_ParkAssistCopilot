# Deployment state

Last verified: 2026-09-11

## Power Platform

- Environment: `https://orgdc7bf008.crm.dynamics.com/` (`Jeffrey Dent's Environment`)
- Existing canvas solution: `5BellParkAssist`
- Publisher prefix: `fivebell`
- Copilot solution: `fivebell_ParkAssistCopilot`
- Copilot Studio agent: `ParkAssist Copilot`
- Agent ID: `d92774c9-4171-446a-9d7c-485bb0b4a850`
- Agent state reported by `pac copilot list`: Active / Provisioned / Published
- MCP tool connection: not configured
- Teams/Microsoft 365 channel validation: not completed

The CLI 2.8.1 `pac copilot init` operation imported the minimal agent solution as part of workspace generation. The checked-in workspace contains the hardened instructions that still need to be pushed after the MCP connection is configured.

## Azure

- Subscription: `Azure subscription 1` (`7005a55f-0b9a-4c0c-9f43-5789209b0e4d`)
- Intended resource group: `rg-parkassist-prod` (East US)
- Existing stopped `parkassist-sidecar-prod-7388` is a Python 3.11 Function App and is not being overwritten.
- No Entra application named `ParkAssist Copilot` exists.
- `Microsoft.App` is not registered, so Azure Container Apps deployment requires an explicit provider registration and creates billable resources.

## Remaining deployment gates

1. Approve/register `Microsoft.App` and provision the HTTPS MCP service, or choose another host.
2. Create the Entra API/SSO registration and configure production environment variables.
3. Add the deployed MCP endpoint to the existing Copilot Studio agent.
4. Push the hardened workspace, publish, add the Teams/Microsoft 365 channel, and test a live stale-camera prompt in a new 1:1 chat.
