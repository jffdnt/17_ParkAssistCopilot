# Security and privacy checklist

## Required before production

- Set `AUTH_MODE=entra`; never expose a production `/mcp` endpoint with `none`.
- Register a single-tenant Microsoft Entra application, expose `access_as_user`, and configure the service audience/tenant values.
- Create the Microsoft 365 SSO authentication registration and place its ID in the generated plugin package, not in source control.
- Use managed identity plus site-scoped Graph permission for `SensorHealth` where possible.
- Store `CAMERA_SIGNING_SECRET` and any client secret in Azure Key Vault/Container Apps secrets.
- Restrict `ALLOWED_HOSTS` to the deployed hostname.
- Put the service behind HTTPS only and enable platform access/application logs.
- Confirm privacy and retention rules for license plates and camera imagery with the data owner.
- Validate tenant DLP policies because Copilot Studio MCP connectivity uses Power Platform connectors.

## Data minimization implemented

- Plate input is normalized and limited to 3–16 characters.
- Partial plate results reveal only a masked representation.
- Full plates are returned only for exact normalized matches.
- The agent is read-only and has no mutation tools.
- Camera previews expire and are scoped to a configured bay.
- Upstream image URLs remain server-side.
- The visual-QA preview contains generated SVG fixtures, not production imagery.

## Recommended operational controls

- Limit agent sharing to an operations group for the pilot.
- Test first in a 1:1 Teams chat; expand to channels only after reviewing group-chat data exposure.
- Apply Conditional Access to the Entra enterprise application.
- Add rate limiting/WAF rules at the Azure ingress for a broader rollout.
- Avoid logging raw query plate text or image bodies.
- Define an incident procedure for a lost signing secret or unexpectedly public endpoint.
