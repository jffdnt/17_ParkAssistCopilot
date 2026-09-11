# Copilot Studio workspace

`agent/` is the source-controlled workspace for schema `fivebell_ParkAssistCopilot`. It was generated with Power Platform CLI 2.8.1 using the existing `fivebell` publisher prefix from solution `5BellParkAssist`.

The workspace deliberately disables web browsing, model knowledge, file analysis, and semantic search. Garage facts must come from the four live MCP tools rather than general model knowledge.

After the MCP connection exists in the environment, pull the remote agent once to capture the generated connection reference, reconcile that change with this workspace, then use:

```powershell
pac copilot push --project-dir ./copilotStudio/agent
pac copilot publish --environment https://orgdc7bf008.crm.dynamics.com/ --bot fivebell_ParkAssistCopilot
```

Do not run `pac copilot init` as a local-only generator: in CLI 2.8.1 it packages and imports a solution into the selected environment.
