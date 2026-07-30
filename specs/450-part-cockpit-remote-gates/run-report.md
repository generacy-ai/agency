# Cockpit Remote Gates — Dogfood Run Report (#450)

**Date:** 2026-07-23
**Driver:** human operator, answering gates from the generacy.ai UI inbox (not the local `AskUserQuestion` presenter)
**Epic under test:** a live epic driven with `/cockpit:auto <epic> --gates=ui`
**Scope note:** partial run — stopped after a couple of phases once the path was proven; the test epic was **not** driven to completion and the cluster is being torn down.

## Verdict

**Remote gates work end-to-end.** Human gates raised by `/cockpit:auto` were routed cluster → relay → generacy.ai inbox, answered from the web UI, and delivered back through `cockpit_gate_ack` to advance the engine — with no local presenter involved. Multiple phases advanced this way.

## Gate types exercised

| Gate | Exercised via UI | Notes |
|------|:---:|-------|
| Clarification (G.1) | ✅ | Answered from inbox; engine advanced. |
| Implementation-review (G.2) — approve | ✅ | Approve path advanced the PR. |
| Implementation-review (G.2) — request-changes | ⚠️ partial | Exercise if reached; confirm inline feedback round-trips. |
| Free-text "add more work" round (G.7) | ❌ not reached | Deferred — needs deliberate setup. |
| Stale-answer supersession | ❌ not reached | Deferred — answer against an advanced generation. |
| Offline redelivery (answer while disconnected → reconnect) | ❌ not reached | Deferred — network-sever test. |

## What this proves / what it doesn't

- **Proven:** the core wire path (gate open → inbox render → operator answer → ack → advance) is functional for clarification and review gates across real phases.
- **Not proven this run:** the three lower-frequency paths above (free-text, supersession, offline). They were intentionally left uncovered — completing the epic and staging those scenarios wasn't worth the cluster time.

## Follow-ups

Enhancements identified during the dogfood are being tracked separately (new work session). This run's purpose — confirm the UI-gate path works against a live cluster — is met; cluster teardown authorized.
