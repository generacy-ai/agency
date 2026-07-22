---
"@generacy-ai/claude-plugin-cockpit": patch
---

fix(cockpit:auto): route the fresh-epic P1 bootstrap through the UI gate under `--gates=ui`. On a fresh epic (every issue `pending`, nothing queued), the startup sweep produced no synthetic events and no `phase-complete` ever fires, so the loop improvised a local `AskUserQuestion` to confirm queueing P1 — which bypasses the operator inbox and blocks a headless UI-driven session with no answerer. The step-3 sweep now detects "no phase in flight" and dispatches a synthetic `phase-bootstrap` event through the existing D.8 / G.5 phase-queue gate (already UI-mapped, `issueRef = <epic-ref>`, distinct `gateId`), so the bootstrap confirm opens via `cockpit_gate_open` like every other gate. Adds a § G.5 Bootstrap variant presentation and a playbook-verification pin.
