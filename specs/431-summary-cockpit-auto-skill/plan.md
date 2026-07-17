# Implementation Plan: Retire the second poll loop in `/cockpit:auto`

**Feature**: Replace `/cockpit:auto`'s `generacy cockpit watch <epic-ref>` sensor with the engine-owned `generacy cockpit doorbell <epic-ref>` surface (generacy#970) so exactly one poll loop exists per epic, halving background GraphQL cost during auto runs.
**Branch**: `431-summary-cockpit-auto-skill`
**Issue**: [#431](https://github.com/generacy-ai/agency/issues/431)
**Date**: 2026-07-17
**Status**: Complete

## Summary

Today, `/cockpit:auto` arms **two independent 30 s poll loops** against the same epic:

1. `generacy cockpit watch <epic-ref>` under harness `Monitor` (`auto.md:43`) — the sensor. Although the parent treats stdout lines as a doorbell only (never parses content), the subprocess still runs a full `runOnePoll` + `resolveEpic` cycle on its own timer (`gh issue view` + per-PR `gh pr checks` — GraphQL-backed).
2. `cockpit_await_events` on every wake (`auto.md:79`) — whose event-bus registry spins up its own full poll loop in the MCP server process.

Two loops, one epic, no coordination — a flat 2× on background GraphQL cost, continuous even when the epic is idle. Both loops re-derive the same live state, and both count against the shared `christrudelpw` token's GraphQL quota.

The engine-side fix (generacy#970) exposes a new `generacy cockpit doorbell <epic-ref>` subprocess that internally attaches to the shared event-bus poll loop `cockpit_await_events` already drains — one loop, doorbell delivery only. This spec is the agency-side half of that cross-repo fix: swap the sensor CLI, retire the C5 re-spawn state machine (recovery moves engine-side), and add a pre-flight capability probe so a mismatched engine build hard-fails cleanly instead of silently double-polling.

The change is a **wake-source-cli swap only**. Cursor protocol, batch ordering, dispatch table, gate contracts, ledger semantics, and the per-event `cockpit_status(json=true)` re-check cadence are all unchanged. This is a plugin-side edit — the MCP engine, the new doorbell CLI, and other cockpit skills are not touched from this repo.

## Technical Context

- **Language / runtime**: The playbook is a Claude Code plugin markdown file (`packages/claude-plugin-cockpit/commands/auto.md`) interpreted by the harness at invocation time. No compiled code; the "implementation" is prose that the model executes tool-by-tool.
- **Framework**: Claude Code harness. Load-bearing tools (unchanged from #420): harness `Monitor` (background stdout streaming with model re-invocation per line), harness `ScheduleWakeup` (scheduled delay wake-up, no token cost until fire), harness `Bash` (for the doorbell subcommand-presence probe).
- **MCP tools consumed** (unchanged from #406/#420 shape): `cockpit_status`, `cockpit_context`, `cockpit_queue`, `cockpit_advance`, `cockpit_resume`, `cockpit_merge`, `cockpit_await_events`.
- **External CLI change**: `generacy cockpit doorbell <epic-ref>` — the engine-owned surface shipped by generacy#970 in place of `generacy cockpit watch <epic-ref>` as the auto-loop sensor. Emits a doorbell line per real state transition on stdout without running an independent poll cycle (internally attaches to the shared event-bus poll loop). `generacy cockpit watch` remains alive for `/cockpit:watch` (the manual assist skill, out of scope here).
- **Cross-repo dependency**: The doorbell surface is owned and built by **generacy#970**. This PR consumes it; the sequencing is engine-first, agency-second. Pre-flight (below) enforces that pairing so an agency-only rollout can't silently degrade.
- **Constraint (Q1 clarification)**: Sensor stays under harness `Monitor` (the #420 sensor/actuator split is preserved — Monitor = wake signal; `cockpit_await_events` at `maxWaitMs=1` = typed data). Explicitly NOT the "make `cockpit_await_events` blocking" option: that would re-introduce the long-poll #406 regressed and #420 removed.
- **Constraint (Q3 clarification)**: The skill stays passive on doorbell-transport death. The 5-minute `ScheduleWakeup` heartbeat (#420 FR-004) is the sole recovery signal. No C5-shaped re-spawn state machine on the skill side — transport resilience lives behind the doorbell surface itself (engine-owned).
- **Constraint (Q4 clarification)**: The per-event `cockpit_status(json=true)` re-check cadence is unchanged in this PR. Any narrowing (e.g., trusting the batched event's carried state for select dispatch classes) is deferred to a follow-up issue so this change doesn't touch the "live state is authoritative" trust boundary.

## Project Structure

Files touched by this feature (all under `packages/claude-plugin-cockpit/`):

```
packages/claude-plugin-cockpit/
├── commands/
│   └── auto.md                        ← MODIFY: step 1 pre-flight (doorbell subcommand probe), step 2 sensor swap (watch → doorbell), step 5 (retire C5 re-spawn), § Ledger vocabulary (retire watch-lifecycle / watch-respawn rows), § Invariants (retire watch-respawn norm-shift note), § Examples (rewrite watch-lifecycle example lines)
└── tests/
    └── playbook-verification.test.ts  ← RE-PIN: assertions that pin `generacy cockpit watch` in auto.md's step 2 (test 406-2 already exempts watch.md; auto.md's step-2 sensor pin moves to `generacy cockpit doorbell`)
```

Files not touched:

- `packages/claude-plugin-cockpit/commands/watch.md` — the `/cockpit:watch` assist skill and its `generacy cockpit watch` subprocess spawn are unchanged. The manual assist path (`/cockpit:watch`, `/cockpit:status`, `/cockpit:advance`) named in the pre-flight failure message must keep working.
- The MCP engine (`cockpit_await_events` server) — lives in the `generacy` repo. Not editable from this repo.
- `generacy cockpit doorbell` CLI itself — engine-owned per generacy#970.
- Other cockpit skills (`clarify`, `status`, `advance`, `merge`, `review`, `queue`, `resume`) — the doorbell is shared infrastructure; the observable event stream those skills consume is preserved.
- `packages/claude-plugin-cockpit/README.md` — the doorbell swap is invisible to the outward "here are the commands" section; only `auto.md`'s prose changes.

## Constitution Check

No `.specify/memory/constitution.md` file present in this repo — the project has no formal constitution to check against. The change adheres to the implicit invariants of the cockpit plugin as stated in `auto.md § Invariants`:

- **Never merge on red** (§1) — unchanged (dispatch table D.5/D.6 untouched).
- **Every gate prompts** (§6) — unchanged (no new gates, no gate changes).
- **Analysis in subagents** (§5) — unchanged (no new inline analysis).
- **Stream consumption is unfiltered** (§7) — the doorbell stdout line remains a doorbell only (never parsed for content); `cockpit_await_events` remains the sole typed-batch source. No field-based filter is introduced. Q1 anchor.
- **Ledger-only rows are cheap by contract** (§8) — restated as an invariant: ledger-only rows D.9/D.9a/D.9b/D.9c/D.9d already skip the per-event `cockpit_status(json=true)` re-check, and this PR does NOT change that (Q4 anchor).
- **MCP-tool-only invariant** (§9) — unchanged (the doorbell is a Bash subprocess sensor, not a `generacy cockpit <migrated-verb>` invocation, so §9's whitelist is untouched — `MIGRATED_VERBS` covers `status | context | queue | advance | resume | merge`; `doorbell` is a new verb outside that set).

**Norm-shift worth naming**: #420's plan.md explicitly introduced the `watch-lifecycle · spawn` / `watch-lifecycle · watch-respawn` ledger rows and noted that "watch re-arms don't count as dispatches" was retired. This PR **retires those rows entirely** — the C5 re-spawn state machine is gone, so `watch-respawn` has no producer left on the skill side. That partially reverses the #420 norm-shift: pre-#420 auto.md excluded arm-ups from the ledger; post-#420 auto.md added them for C5 accounting; post-#431 auto.md removes them again because the mechanism they accounted for is gone. `watch-lifecycle · spawn · armed` (the arm-up ledger row) is also retired for symmetry — the new spawn is engine-owned and produces no skill-side ledger line beyond the ordinary dispatch stream (see `data-model.md § Retired ledger vocabulary`).

## Key Technical Decisions

Decisions summarized here; full rationale in `research.md`.

1. **Retain the sensor-under-Monitor shape; swap only the CLI verb** (Q1=A). The #420 sensor/actuator split is preserved: harness `Monitor` = wake signal, `cockpit_await_events(maxWaitMs=1)` = typed data. The engine ships a new `generacy cockpit doorbell` subprocess that attaches to the shared event-bus poll loop internally — one poll loop per epic. Explicitly NOT the "make `cockpit_await_events` blocking" option (would re-introduce the long-poll #406 regressed and #420 removed).
2. **CLI subcommand-presence probe as pre-flight capability check** (Q2=A). `generacy cockpit doorbell --help` returns 0 iff the engine ships the doorbell surface. Simpler and more version-robust than hardcoding a semver floor (also acceptable per Q2). On probe failure: print an actionable error naming the missing engine surface + the manual assist commands (`/cockpit:watch`, `/cockpit:status`, `/cockpit:advance`) and exit non-zero. **No fallback to spawning `generacy cockpit watch`** — a silent fallback would mask engine-agency version drift and re-introduce the double-poll condition this PR exists to fix.
3. **Skill stays passive on doorbell death** (Q3=A). `ScheduleWakeup` heartbeat (#420 FR-004, 5 min) is the sole recovery signal. A dead doorbell degrades to exactly heartbeat cost until the engine restores it. `auto.md` retires all watch-lifecycle / C5 re-spawn ledger vocabulary; transport resilience lives behind the doorbell surface itself.
4. **Defer the per-event `cockpit_status` narrowing analysis** (Q4=A). This PR is wake-source consolidation only. The per-event re-check cadence for actionable dispatch classes (D.1–D.8, D.10, D.11) remains unchanged; the invariant that ledger-only classes (D.9/D.9a/D.9b/D.9c/D.9d) already skip the re-check is restated. Any further narrowing is a follow-up issue that does not gate this PR.
5. **SC-001 verification is engine-instrumented, agency-side sanity-only** (Q5=D). The ~50% GraphQL reduction is verified by generacy#970's `GhWrapper` instrumentation (a markdown skill cannot count GraphQL requests itself). A one-time manual observational soak on the snappoll fixture is captured in the PR body as a sanity check but **is not merge-gating**. The agency PR's actual merge gates are: process-inventory check (no `generacy cockpit watch` subprocess in an auto run's process tree post-fix, SC-002), playbook-verification re-pin (SC-007), and epic-completion parity vs. baseline (SC-004).

## Constraints and Assumptions

- **Doorbell CLI shape**: `generacy cockpit doorbell <epic-ref>` accepts the same positional as `generacy cockpit watch <epic-ref>` (the tracking ref under `--tracking` / `--new` invocation forms, matching the ledger header line's `Tracking ref:` field). Emits one stdout line per real state transition (doorbell only, never parsed for content). Internally attaches to the shared event-bus poll loop `cockpit_await_events` drains; no independent polling. **This shape is engine-owned by generacy#970** — if the engine ships a different verb name or a different positional style, this playbook adapts in a targeted follow-up before merge.
- **Monitor + ScheduleWakeup semantics**: unchanged from #420. Monitor idles at zero token cost; `ScheduleWakeup(delaySeconds=300, ...)` costs zero tokens until fire.
- **Engine-first sequencing**: generacy#970's release ships the doorbell surface before this PR merges. Pre-flight refuses to run when the surface is absent, so a rollback of the engine leaves auto users with a clean error rather than a silent double-poll.
- **Operator environment**: `/cockpit:auto` is intended for interactive Claude Code sessions (desktop, CLI, web). Headless remote agents or non-Claude-Code runners already hard-fail at pre-flight on Monitor absence (#420 FR-006). This PR adds one more pre-flight class: an engine that doesn't ship the doorbell surface hard-fails with an actionable error naming the manual assist commands as the fallback path.

## Out of Scope

- Rewriting the doorbell CLI or the MCP event protocol — engine-side, owned by generacy#970.
- Introducing a client-side re-spawn state machine for a dead doorbell — Q3=A explicitly rejects this.
- Narrowing any dispatch class's per-event `cockpit_status(json=true)` re-check cadence — Q4=A defers this to a follow-up issue; no dispatch class's cost profile changes here.
- Instrumenting GraphQL request counting inside the skill — Q5=D: a markdown skill cannot count GraphQL requests; instrumentation lives engine-side in generacy#970's `GhWrapper`.
- Adding a "belt-and-braces" hybrid mode that falls back to `generacy cockpit watch` when the doorbell surface is absent — decision 2 explicitly rejects this. The fallback surface is the manual assist commands (`/cockpit:watch`, `/cockpit:status`, `/cockpit:advance`), not a silent skill-side degrade.
- Migrating `/cockpit:watch` or other cockpit skills to the doorbell surface — those skills use `generacy cockpit watch` as an operator-facing NDJSON stream, a different consumer with different requirements. Out of scope here.
- Rev'ing the C5 re-spawn taxonomy into a "doorbell re-spawn" taxonomy — the retirement is intentional (Q3=A). No successor state machine.

## Success Signals

Reference SC-001–SC-007 (as named in the clarifications). Baseline is a snappoll-shaped fixture run against the pre-#431 auto skill. Targets:

- **SC-001** — ~50% drop in background GraphQL request rate during idle intervals of an auto run (verified engine-side by generacy#970's `GhWrapper` instrumentation).
- **SC-002** — Process inventory of a live auto run shows **no `generacy cockpit watch` subprocess** in the loop's process tree post-fix (`ps -ef | grep 'generacy cockpit watch'` returns zero rows for the auto session; `/cockpit:watch` invocations from a separate session are not counted).
- **SC-004** — Epic-completion parity on the snappoll fixture: same gates cleared, same merges, same terminal state (`epic-complete`) as the pre-#431 baseline. No dispatch class's behavior changes.
- **SC-007** — Playbook-verification test suite (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`) passes with re-pinned assertions reflecting the new step-2 sensor CLI (`generacy cockpit doorbell` in place of `generacy cockpit watch`) and the retired C5 vocabulary.
- **Pre-flight refusal** without the engine's doorbell surface exits non-zero, prints an actionable error naming the missing surface + the manual assist commands, and does not fall back to spawning `generacy cockpit watch`.

Not merge-gating (per Q5=D): the SC-001 manual soak on snappoll is captured in the PR body as a sanity check number, not a green/red merge signal — the engine-side instrumentation is the load-bearing verification.

## Next Step

Run `/speckit:tasks` (or `/cockpit:tasks`) to generate the task list from this plan.
