## What and why
<!-- What does this change, and why? Link the issue it fixes, e.g. "Fixes #12". -->

## How it was tested
<!-- Commands you ran. For broker or LLM integrations, say whether you tried a real account. -->

## Checklist
- [ ] One change per PR, from its own branch (not my fork's `main`)
- [ ] `python -m unittest discover -s tests` passes
- [ ] If the frontend changed: `npx tsc --noEmit` and `npm run build` pass in `frontend/`
- [ ] New or changed code has tests, with the network mocked
- [ ] No secrets, no unrelated changes, no workflow changes
- [ ] Brokers stay read-only (no order placement)
