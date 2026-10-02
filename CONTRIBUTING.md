# Contributing

This is a private, single-maintainer repository. It isn't open to outside
contributions, but this file documents the workflow so changes stay
consistent.

## Before you start

Read [README.md](README.md) for the architecture overview and local setup.
Check [docs/architecture.md](docs/architecture.md) for data semantics and
[docs/deployment-state.md](docs/deployment-state.md) for current production
state before changing behavior that spans the server, SPFx component, or
infrastructure.

## Local checks

Run these before opening a PR; CI (`.github/workflows/ci.yml`) runs the
same checks on every push and pull request:

```powershell
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate

Push-Location copilotComponent
npm ci
npm run build
npm audit --audit-level=moderate
Pop-Location

az bicep build --file infra/foundation.bicep --stdout > $null
az bicep build --file infra/container-app.bicep --stdout > $null
```

Also run `npm run release:check` before anything intended for deployment.

## Commits and PRs

- Keep commit subjects short and imperative (e.g. "Promote interactive
  ParkAssist dashboard"), matching the existing `git log`.
- One logical change per commit; avoid bundling unrelated server, SPFx, and
  infrastructure edits together when they can be split.
- Never commit secrets, `.env`, or real tenant/subscription identifiers
  beyond what's already tracked in `docs/` for operational history.

## Deployment changes

Deployment is driven by [scripts/deploy-azure.ps1](scripts/deploy-azure.ps1)
and the Bicep templates in `infra/`. `infra/*.json` are generated ARM
output (`az bicep build`) and are gitignored — don't hand-edit or commit
them. `.azure/deployment-plan.md` is the live deployment plan and
validation record; keep it current when changing the release process.
