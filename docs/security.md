# Security and privacy checklist

## Required before production

- Set `AUTH_MODE=entra`; the server rejects `AUTH_MODE=none` when `NODE_ENV=production`.
- Register a single-tenant Microsoft Entra application, expose `access_as_user`, and configure the service audience/tenant values.
- Approve the Copilot Component's delegated `access_as_user` request in SharePoint Admin Center.
- Use managed identity plus site-scoped Graph permission for `SensorHealth` where possible.
- Store `CAMERA_SIGNING_SECRET` and any client secret in Azure Key Vault/Container Apps secrets. Production startup rejects known placeholders and values shorter than 32 bytes.
- Restrict `ALLOWED_HOSTS` to the deployed hostname.
- Put the service behind HTTPS only and enable platform access/application logs.
- Run the container as the unprivileged `node` user (the checked-in Dockerfile does this).
- Keep `TRUST_PROXY_HOPS` aligned with the actual ingress topology; rate limiting relies on Express's resolved client IP.
- Confirm privacy and retention rules for license plates and camera imagery with the data owner.
- Validate tenant DLP policies because Copilot Studio MCP connectivity uses Power Platform connectors.

## Data minimization implemented

- Plate input is normalized and limited to 3–16 characters.
- Full plates are returned by occupied-bay plate searches and by the Entra-protected occupied dashboard drill-down. Both partial and exact searches return the full matching plate (masking was deliberately disabled; confirm this still matches the data owner's privacy rules before wider rollout).
- Availability, stale-camera, and out-of-service results omit machine-readable plate text. Occupied drill-down model context is bounded to the listed/selected spaces, rather than every occupied vehicle.
- The agent is read-only and has no mutation tools.
- Camera previews expire and are scoped to a configured bay.
- Upstream image URLs remain server-side.
- The visual-QA preview contains generated SVG fixtures, not production imagery.

## Recommended operational controls

- Limit agent sharing to an operations group for the pilot.
- Test first in a 1:1 Teams chat; expand to channels only after reviewing group-chat data exposure.
- Apply Conditional Access to the Entra enterprise application.
- Keep the built-in per-replica rate limit enabled and add a distributed WAF/ingress policy before scaling broadly.
- Avoid logging raw query plate text or image bodies.
- Define an incident procedure for a lost signing secret or unexpectedly public endpoint.
