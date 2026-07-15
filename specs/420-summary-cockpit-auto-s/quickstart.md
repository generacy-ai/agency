# Quickstart: Monitor-driven wake-ups for `/cockpit:auto`

Operator-facing usage guide for the post-#420 `/cockpit:auto` loop. No behavior change in the *typed-event dispatch* surface (same gates, same merges, same terminal states); only in the wake-source model.

## What changed

Before #420, `/cockpit:auto` long-polled `cockpit_await_events` continuously. Every poll — even an empty one — cost one model turn's worth of context re-read (~380k cache-read tokens on a mid-run session). A 30-minute quiet phase cost ~12.5M cache-read tokens for zero progress.

After #420, the loop wakes only when *something happens*:

1. **`generacy cockpit watch <epic-ref>` runs under harness `Monitor`** as a background sensor. Idle cost is zero.
2. **On a state-transition line, Monitor re-invokes the model**, which then drains typed events via a fast `cockpit_await_events(maxWaitMs=1, coalesceWindowMs=3000)` call.
3. **A 5-minute `ScheduleWakeup` heartbeat** fires belt-and-braces if Monitor is silent, so a dead watch is caught within ~5m30s.
4. **On Monitor exit, the loop re-spawns the watch** with exponential backoff (1s → 2s → 4s → …, cap 5m), unbounded retries.
5. **Pre-flight refuses to run without harness `Monitor`** — no fallback long-poll path.

## Installation

No install step required if you're already running `/cockpit:auto`. The change is in `packages/claude-plugin-cockpit/commands/auto.md`. Pull the branch and the updated plugin is picked up on next invocation.

## Usage

Unchanged from pre-#420. Three invocation forms:

```bash
# Epic mode — drive an epic to `epic-complete`
/cockpit:auto owner/repo#420

# Epic-less: existing tracking issue
/cockpit:auto --tracking owner/repo#500

# Epic-less: file a new tracking issue interactively
/cockpit:auto --new "Stabilize summary generation"
```

The loop's tick pattern will now be:

- Startup sweep as before (status table, synthetic events for open work).
- **Quiet phases: no visible model output for minutes at a time** — that's the point. The Monitor sensor is running in the background; the harness will re-invoke the model when a transition fires.
- **On any real transition**: the loop wakes, drains events, dispatches per the existing table, writes ledger lines. Same as before, just triggered by Monitor instead of a poll timer.
- **Every 5 minutes without a Monitor wake**: a heartbeat fires — one drain call, ledger line `<epic-ref> · heartbeat · schedule-wakeup · fired · drain empty`, and re-arm.
- **If the watch dies**: user-visible `[watch] Monitor reported exit · code=<c>` line + ledger entry + re-spawn attempt with backoff.

## Available commands

Unchanged. The full cockpit surface remains:

| Command | Purpose |
|---|---|
| `/cockpit:auto <ref>` | Full autonomy loop (this feature) |
| `/cockpit:watch <ref>` | Manual per-line watch stream |
| `/cockpit:status <ref>` | Point-in-time status snapshot |
| `/cockpit:advance <ref> --gate <name>` | Advance a specific gate |
| `/cockpit:clarify <ref>` | Handle a single clarification |
| `/cockpit:review <ref> --gate <name>` | Review an artifact or PR |
| `/cockpit:merge <ref>` | Merge one PR |
| `/cockpit:queue <ref> --phase <name>` | Queue a phase's issues |
| `/cockpit:resume <ref>` | Requeue after failure |

If `/cockpit:auto` refuses to run because harness `Monitor` is unavailable, the assist commands above are the supported manual path — `/cockpit:watch` gives you the same NDJSON stream and copy-paste next-command suggestions, and the rest are drop-in replacements for individual dispatch actions.

## Troubleshooting

### `Monitor tool is required for /cockpit:auto but is not available in this harness.`

You're running in a harness that doesn't provide the `Monitor` tool — usually an older Claude Code build, a headless remote agent, or a non-Claude-Code runner. Two options:

- **Upgrade Claude Code** to a version that supports `Monitor` (Desktop, CLI, VS Code, and web should all have it as of 2026-Q3).
- **Use the assist commands** — `/cockpit:watch owner/repo#N` gives you the same stream with copy-paste suggestions; `/cockpit:advance`, `/cockpit:merge`, `/cockpit:clarify`, etc. drive individual gates.

### `[watch] Monitor reported exit · code=<c> · backoff=<b>s`

The watch subprocess died. The loop is re-spawning it. Nothing to do — attempts continue indefinitely, each printed to the transcript. If you see backoff climb to the 5-minute cap and stay there, investigate the underlying cause (usually `generacy` binary missing, `gh auth` expired, or the epic ref invalid).

### Heartbeat fires but the loop is stuck on a gate

The heartbeat is orthogonal to gates — it drains events on a 5-minute cadence and re-arms. If the loop is waiting on an operator decision at a gate, that's normal and the heartbeat won't unstick it. Answer the gate to advance.

### Long quiet phase — is the loop still alive?

Yes. The Monitor sensor is idling at zero token cost; the heartbeat will fire every 5 minutes and produce a visible ledger line even in dead-air stretches. If you don't see a heartbeat within 5m30s of the last transition, something's wrong — check the watch subprocess (a `[watch] Monitor reported exit` line above should tell you).

### Token cost hasn't dropped as much as I expected

Measure against the SC-001 / SC-002 targets in the spec: `≥90% drop in zero-event polling turns` and `~41.8M → ≤4M cache-read tokens on pure-polling turns` on the snappoll fixture. If your run doesn't match, check the transcript for:

- Zero-event `cockpit_await_events` calls that aren't tagged as a heartbeat fire — indicates the loop is still long-polling on some code path.
- Missing heartbeat ledger lines — indicates `ScheduleWakeup` isn't arming.
- Missing watch-lifecycle ledger lines — indicates the sensor never came up.

## Reference

- Spec: `specs/420-summary-cockpit-auto-s/spec.md`
- Clarifications: `specs/420-summary-cockpit-auto-s/clarifications.md`
- Plan: `specs/420-summary-cockpit-auto-s/plan.md`
- Research + decisions: `specs/420-summary-cockpit-auto-s/research.md`
- Data model: `specs/420-summary-cockpit-auto-s/data-model.md`
- Existing playbook: `packages/claude-plugin-cockpit/commands/auto.md`
