# Documentation Process (Keep Docs Updated)

Requirement: update documents as you progress.

## When to update docs

Update docs in the same change as code whenever you:
- add or change an endpoint, request/response fields, or error codes
- add a screen, route, or major UI behavior
- change business rules (cutoff, preferred staff behavior, service disable workflow)

## Checklist (per change)

- [ ] Update `docs/api/CONTRACTS.md` if API contract changed
- [ ] Update `docs/frontend/customer-app.md` if customer flow changed
- [ ] Update `docs/frontend/staff-app.md` if staff workflow changed
- [ ] Update `docs/PRD.md` if requirements changed
- [ ] Add/adjust acceptance criteria in `docs/MVP_BACKLOG.md` if behavior changed

## Suggested PR template text

Include a short section in PR descriptions:

- Docs updated: (paths)
- New/changed endpoints: (paths)
- Screens changed: (routes)
