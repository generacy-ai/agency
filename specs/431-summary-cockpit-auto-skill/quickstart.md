# Quickstart: Retire the second poll loop in `/cockpit:auto`

Operator-facing usage guide for the post-#431 `/cockpit:auto` loop. No behavior change in the *typed-event dispatch* surface (same gates, same merges, same terminal states); only in the sensor CLI verb and the removal of the skill-side re-spawn state machine.

## What changed

Before #431, `/cockpit:auto` armed **two independent 30 s poll loops** against the same epic:

1. `generacy cockpit watch <epic-ref>` under harness `Monitor` — the sensor. Although the parent treated stdout as a doorbell only (never parsed content), the subprocess still ran a full `runOnePoll` cycle every 30 s on its own.
2. `cockpit_await_events` — whose event-bus registry spins up its own poll loop server-side.

Both loops re-derived the same live state, and both counted against the shared `christrudelpw` token's GraphQL quota. On idle auto runs, this contributed to rate-limit exhaustion.

After #431 (paired with **generacy#970**, which ships the engine-side half):

1. **`generacy cockpit doorbell <epic-ref>` runs under harness `Monitor`** in place of `generacy cockpit watch`. The doorbell subprocess attaches to the shared event-bus poll loop that `cockpit_await_events` drains — **no independent poll cycle**. Idle cost is zero.
2. **`cockpit_await_events` remains the sole typed-batch source** — on each Monitor-delivered wake, the loop drains events via `cockpit_await_events(maxWaitMs=1, coalesceWindowMs=3000)`, unchanged from #420.
3. **The 5-minute `ScheduleWakeup` heartbeat** fires belt-and-braces when Monitor is silent, unchanged from #420.
4. **The skill no longer re-spawns the sensor on Monitor exit.** Doorbell transport resilience lives engine-side (behind the doorbell surface). If the doorbell subprocess dies, the loop degrades to heartbeat-only recovery (~5 min) until the engine restores signal.
5. **Pre-flight refuses to run without the engine's doorbell surface** — a mismatched engine build (one that doesn't ship generacy#970 yet) hard-fails with an actionable error; no silent fallback to `generacy cockpit watch`.

## Installation

No install step required if you're already running `/cockpit:auto`, but there is a **cross-repo prerequisite**: your cluster's `generacy` build must ship the `generacy cockpit doorbell` subcommand (delivered by **generacy-ai/generacy#970**). Verify with:

```bash
generacy cockpit doorbell --help
```

- Exit 0 = surface present; `/cockpit:auto` will run.
- Non-zero = surface missing; `/cockpit:auto` will hard-fail at pre-flight with an actionable error. Upgrade the cluster's `generacy` build, or use the manual assist commands (below).

## Usage

Unchanged from #420. Three invocation forms:

```bash
# Epic mode — drive an epic to `epic-complete`
/cockpit:auto owner/repo#431

# Epic-less: existing tracking issue
/cockpit:auto --tracking owner/repo#500

# Epic-less: file a new tracking issue interactively
/cockpit:auto --new "Stabilize summary generation"
```

The loop's tick pattern is:

- **Pre-flight** now includes a `generacy cockpit doorbell --help` probe (see § Troubleshooting for failure cases).
- **Startup sweep** as before (status table, synthetic events for open work).
- **Quiet phases**: no visible model output for minutes at a time — that's the point. The doorbell sensor idles at zero background GraphQL cost; the harness re-invokes the model when a transition fires.
- **On any real transition**: the loop wakes, drains events, dispatches per the existing table, writes ledger lines. Same as #420, just driven by the doorbell sensor.
- **Every 5 minutes without a doorbell wake**: a heartbeat fires — one drain call, ledger line `<epic-ref> · heartbeat · schedule-wakeup · fired · drain empty`, and re-arm.
- **If the doorbell dies**: no user-visible `[watch] Monitor reported exit` line (post-#431 the skill is passive here); no re-spawn attempt; no `watch-lifecycle · watch-respawn` ledger lines. The loop degrades to heartbeat-only cadence until the engine restores signal.

## Available commands

Unchanged. The full cockpit surface remains:

| Command | Purpose |
|---|---|
| `/cockpit:auto <ref>` | Full autonomy loop (this feature) |
| `/cockpit:watch <ref>` | Manual per-line watch stream (still uses `generacy cockpit watch`) |
| `/cockpit:status <ref>` | Point-in-time status snapshot |
| `/cockpit:advance <ref> --gate <name>` | Advance a specific gate |
| `/cockpit:clarify <ref>` | Handle a single clarification |
| `/cockpit:review <ref> --gate <name>` | Review an artifact or PR |
| `/cockpit:merge <ref>` | Merge one PR |
| `/cockpit:queue <ref> --phase <name>` | Queue a phase's issues |
| `/cockpit:resume <ref>` | Requeue after failure |

If `/cockpit:auto` refuses to run because the engine's doorbell surface is unavailable, the assist commands above are the supported manual path — `/cockpit:watch` gives you the same NDJSON stream and copy-paste next-command suggestions, and the rest are drop-in replacements for individual dispatch actions.

## Troubleshooting

### `Engine doorbell surface not available. /cockpit:auto needs a generacy build that ships \`generacy cockpit doorbell\` (generacy#970).`

Your cluster's `generacy` build predates generacy#970's release. Two options:

- **Upgrade the cluster's `generacy` build** to a version that ships `generacy cockpit doorbell`. Verify with `generacy cockpit doorbell --help` (exit 0 expected).
- **Use the assist commands** — `/cockpit:watch owner/repo#N` gives you the same stream with copy-paste suggestions; `/cockpit:advance`, `/cockpit:merge`, `/cockpit:clarify`, etc. drive individual gates.

### `Monitor tool is required for /cockpit:auto but is not available in this harness.`

Unchanged from #420 — you're running in a harness that doesn't provide the `Monitor` tool (usually an older Claude Code build, a headless remote agent, or a non-Claude-Code runner). Upgrade Claude Code, or fall back to the assist commands as above.

### Doorbell died mid-run, loop looks stuck

**Post-#431**, the skill does not re-spawn the doorbell subprocess on Monitor exit (Q3=A) — there is no `[watch] Monitor reported exit …` transcript line, no `watch-lifecycle · watch-respawn · …` ledger entries. If the doorbell dies:

- Within ~5 minutes, the `ScheduleWakeup` heartbeat fires and drains via `cockpit_await_events`. If the engine restored signal, work resumes normally. If not, the drain returns empty and the loop re-arms the heartbeat.
- Persistently-dead doorbell degrades to heartbeat cadence indefinitely (once every 5 minutes, no other traffic). Ledger will show a run of `heartbeat · schedule-wakeup · fired · drain empty` lines with no other dispatches.
- If you see this pattern for more than a few consecutive heartbeats and expect progress, exit auto (`Ctrl-C`) and investigate engine-side (generacy#970 owns doorbell-transport resilience) — the manual assist commands are your bridge.

### Heartbeat fires but the loop is stuck on a gate

Unchanged from #420 — the heartbeat is orthogonal to gates. If the loop is waiting on an operator decision, that's normal and the heartbeat won't unstick it. Answer the gate to advance.

### Long quiet phase — is the loop still alive?

Yes. The doorbell sensor is idling at zero background cost; the heartbeat will fire every 5 minutes and produce a visible ledger line even in dead-air stretches. If you don't see a heartbeat within 5m30s of the last transition, something's wrong — the sensor doesn't ledger arm-ups post-#431 (see `data-model.md § Retired ledger vocabulary`), so investigate via `ps -ef | grep 'generacy cockpit doorbell'` on the operator's shell.

### Background GraphQL rate hasn't dropped as expected

The ~50% reduction target (SC-001) is **primarily verified by generacy#970's `GhWrapper` instrumentation** — a markdown skill cannot count GraphQL requests itself. If your soak on the snappoll fixture shows less than expected:

- Confirm the doorbell surface is actually in use: `ps -ef | grep 'generacy cockpit'` on the auto session should show `generacy cockpit doorbell <ref>` and **not** `generacy cockpit watch <ref>` (that's SC-002).
- Confirm the pre-flight probe passed (you shouldn't see the `Engine doorbell surface not available` error) — a mismatched engine build silently reverting to a hybrid mode would defeat the fix, but this PR intentionally rejects that surface (pre-flight is hard-fail).
- Cross-reference against generacy#970's own instrumentation output in the PR body — that's the load-bearing measurement.

### PR body did not include an SC-001 sanity number

The one-time SC-001 soak on snappoll is a sanity check, not a merge gate (Q5=D). The agency PR's actual merge gates are SC-002 (process inventory), SC-004 (epic-completion parity), and SC-007 (playbook-verification test re-pin). Confirm those in the PR body.

## Reference

- Spec: `specs/431-summary-cockpit-auto-skill/spec.md`
- Clarifications: `specs/431-summary-cockpit-auto-skill/clarifications.md`
- Plan: `specs/431-summary-cockpit-auto-skill/plan.md`
- Research + decisions: `specs/431-summary-cockpit-auto-skill/research.md`
- Data model: `specs/431-summary-cockpit-auto-skill/data-model.md`
- Existing playbook: `packages/claude-plugin-cockpit/commands/auto.md`
- Playbook drift tests: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
- Companion (engine-side): [generacy-ai/generacy#970](https://github.com/generacy-ai/generacy/issues/970) — ships the `generacy cockpit doorbell` surface and the shared event-bus poll loop deduplication.
