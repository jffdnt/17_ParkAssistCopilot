# Copilot Studio workspace

`agent/` is the source-controlled workspace for the **ParkAssist Garage Text** fallback (schema `fivebell_ParkAssistCopilot`). It was generated with Power Platform CLI 2.8.1 using the existing `fivebell` publisher prefix from solution `5BellParkAssist`.

The workspace deliberately disables web browsing, model knowledge, file analysis, and semantic search. Garage facts must come from the four live MCP tools rather than general model knowledge.

After the MCP connection exists in the environment, pull the remote agent once to capture the generated connection reference, reconcile that change with this workspace, then use:

```powershell
pac copilot push --project-dir ./copilotStudio/agent
pac copilot publish --environment https://orgdc7bf008.crm.dynamics.com/ --bot d92774c9-4171-446a-9d7c-485bb0b4a850
```

Power Platform CLI 2.8.1 does not resolve the schema name for `publish` in this environment; use the immutable agent ID shown above.

Do not run `pac copilot init` as a local-only generator: in CLI 2.8.1 it packages and imports a solution into the selected environment.
