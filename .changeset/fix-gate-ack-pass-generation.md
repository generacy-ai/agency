---
"@generacy-ai/claude-plugin-cockpit": patch
---

fix(cockpit:auto): D.12 gate-ack now passes `generation`. Every `cockpit_gate_ack` call in the D.12 gate-answer handler now sends `generation: event.generation` alongside `gateId`/`outcome`, so the MCP tool can build the full `{ kind:'gate-ack', gateId, generation, outcome, ackedAt, detail? }` envelope the orchestrator's `GateAckSchema` requires (previously the ack 400'd once a gate opened). Adds an "Ack envelope" note to § D.12, `generation` to `GateAckParams`, and a playbook pin. Pairs with the generacy MCP-tool change. Part of the gate wire-contract reconciliation (generacy#1034).
