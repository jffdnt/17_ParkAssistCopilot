# ADR 0001: Use MCP Apps instead of a new SPFx Web Chat shell

Status: accepted

## Context

`12_CopilotWebpart` proves the earlier Direct Line + SSO approach and remains useful as a tenant-authentication reference. The target experience, however, is speaking to an agent in Copilot inside Microsoft Teams and seeing rich inline camera results.

## Decision

Use one Streamable HTTP MCP service with a React MCP App resource. Connect it to Copilot Studio for Power Platform ownership and publish that agent to Teams. Also ship a Microsoft 365 declarative-agent package for hosts that support inline MCP Apps.

## Consequences

- Live tools have one contract across Copilot Studio and Microsoft 365 Copilot.
- The React camera view renders in the conversation instead of in a separate SharePoint web part.
- The host dynamically discovers current tool schemas.
- Teams/Copilot support depends on tenant policy, licensing, custom-app upload, and MCP feature availability.
- Copilot Studio hosts that do not render the MCP App still receive text and Adaptive Card-shaped structured data.
