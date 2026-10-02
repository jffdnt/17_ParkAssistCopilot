# Security Policy

This repository is private. Access is already restricted to authorized
collaborators, but vulnerabilities (credential handling, auth bypass,
injection, data exposure, etc.) should still be reported privately rather
than filed as a public issue.

## Reporting a vulnerability

Email **jffdnt@gmail.com** with a description of the issue, steps to
reproduce, and its potential impact. Expect an initial response within a
few days. Do not open a public GitHub issue for unpatched vulnerabilities.

## Supported versions

This project does not maintain parallel release branches; only the `main`
branch and the latest deployed production release are supported. Fixes are
applied forward only.

## Related documentation

For the application's production hardening checklist (auth configuration,
secret storage, data minimization, operational controls), see
[docs/security.md](docs/security.md).
