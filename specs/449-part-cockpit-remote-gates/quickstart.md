# Quickstart: `/cockpit:auto --gates=ui`

Operator-facing usage guide for the new UI-mode dispatch path added in #449. Local-mode (`--gates=local`) is unchanged from today — this doc focuses on the new UI-mode behavior and its resolution rules.

## Installation

This is a plugin-side change to `packages/claude-plugin-cockpit`. No new install steps beyond a normal build:

```bash
pnpm install
pnpm build
```

Cluster-side, `cockpit_gate_open` and `cockpit_gate_ack` must be bound (owned by the epic P1–P3 phases in `generacy-ai/generacy-cloud`). Without them, `--gates=ui` refuses to run at pre-flight (see § Pre-flight errors below).

## Invocation forms

The four existing invocation forms are unchanged. `--gates=<value>` is a new orthogonal flag accepted alongside any of them:

```bash
# Epic mode + explicit UI gates
/cockpit:auto owner/repo#42 --gates=ui

# Epic-less: existing tracking + auto-detect gates
/cockpit:auto --tracking owner/repo#100 --gates=auto

# Epic-less: new tracking + explicit local gates (preserves today's byte-path)
/cockpit:auto --new "Ship the widget" --gates=local

# Epic-less: issue list + auto-detect (default)
/cockpit:auto 512,513,514
# equivalent to: /cockpit:auto 512,513,514 --gates=auto
```

## `--gates` values

| Value  | Behavior                                                                                                                                                                                       |
|--------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ui`   | Force UI mode. Every gate opens a remote record via `cockpit_gate_open`; answers arrive as `gate-answer` events on the wake paths. **Hard-fails at pre-flight** if `cockpit_gate_open` is absent. |
| `local`| Force local mode. Every gate presents via `AskUserQuestion` in-session (today's byte-path, unchanged).                                                                                          |
| `auto` | Default. Resolves to `ui` when `cockpit_gate_open` is bound AND the cluster is cloud-activated; otherwise resolves to `local`. Decision made once at pre-flight; does not flip mid-run.        |

## What UI mode looks like

For each gate the run would normally block on:

1. The loop prints one pointer line:
   ```
   gate open: Approve clarification answers for owner/repo#42 → answer in the generacy.ai inbox (https://generacy.ai/inbox/gates/gate-abc123)
   ```
2. The loop continues to the next event — it does NOT block on the operator's answer.
3. The operator answers in the generacy.ai inbox (option button + optional free-text field).
4. When the answer arrives (via the doorbell surface, delivered on the next `Monitor` line or `cockpit_await_events` batch), D.12 routes it to the same downstream action the local flow would have taken.
5. Exactly one ledger row is written per resolved gate, with `· source: ui-gate` in the outcome slot:
   ```
   [ledger] owner/repo#42 · waiting-for:clarification · clarification-batch · advanced · source: ui-gate
   ```

## Expected output (partial trace, UI mode)

```
Auto run starting · gates: ui (source: --gates=ui)
[ledger] Tracking ref: owner/repo#42 · form: epic · started: 2026-07-22 14:30 UTC
… startup sweep …
gate open: Approve clarification answers for owner/repo#42 → answer in the generacy.ai inbox (…)
gate open: Manual validation for owner/repo#44 → answer in the generacy.ai inbox (…)
… doorbell wake …
[ledger] owner/repo#44 · waiting-for:manual-validation · manual-validation-summary+advance · manually validated · source: ui-gate
… doorbell wake …
[ledger] owner/repo#42 · waiting-for:clarification · clarification-batch · advanced · source: ui-gate
… loop continues …
```

## Expected output (partial trace, `--gates=auto` resolved to local)

```
Auto run starting · gates: local (source: --gates=auto → ui-mode tools unbound)
[ledger] Tracking ref: owner/repo#42 · form: epic · started: 2026-07-22 14:30 UTC
… (byte-identical to --gates=local from here on)
```

## Pre-flight errors

### `--gates=ui` with `cockpit_gate_open` absent

```
--gates=ui specified but cockpit_gate_open is not available in this session; re-invoke with --gates=local or --gates=auto
```

Exit code: non-zero. No ledger directory created. Matches the seven-cockpit-tools presence-check precedent.

**Fix**: either invoke with `--gates=local` (immediate — accepts today's blocking behavior), `--gates=auto` (immediate — degrades to local when tools are absent), OR upgrade the cluster to a version that binds `cockpit_gate_open` (per epic P1–P3 phase ordering).

### `--gates=<value>` with unrecognized value

```
Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>
       [--gates=ui|local|auto]  (default: auto)
Reason: gates-value-invalid (<observed-value>)
```

Exit code: non-zero.

### Multiple `--gates=*` flags

```
Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>
       [--gates=ui|local|auto]  (default: auto)
Reason: gates-duplicate
```

Exit code: non-zero.

## Runtime errors and fallback

### `cockpit_gate_open` errors during a call (not pre-flight)

The specific gate falls back to local `AskUserQuestion`. The loop continues.

The FIRST such failure in a run writes a one-time ledger note:

```
[ledger] owner/repo#42 · waiting-for:clarification · gate-open · error: <error-string> — falling back to local AskUserQuestion for this gate (repeated failures suppressed) · source: ui-gate
```

The gate's local resolution row uses `· source: ui-gate-fallback` (distinct from clean UI resolutions):

```
[ledger] owner/repo#42 · waiting-for:clarification · clarification-batch · advanced · source: ui-gate-fallback
```

Subsequent failures in the same run are silent (no per-failure note); only the resolution rows carry the `-fallback` suffix.

### `gate-answer` event arrives with stale generation OR issue state has advanced

D.12 acks the gate as `superseded` and writes a ledger row:

```
[ledger] owner/repo#42 · waiting-for:clarification · clarification-batch · superseded (stale generation) · source: ui-gate
```

The loop continues. If the underlying state is still actionable, the label will re-fire and a fresh gate will open.

## G.7 Add-more-work under UI mode

In UI mode, the two-turn local flow (select `Add more work` → prose prompt → operator prose reply → intent recognizer) collapses to a one-turn flow: the inbox presents `Add more work` alongside a required free-text field. The operator selects the option AND types `also process owner/repo#99` or `file an issue for the broken widget` in the same submission. D.12 routes the freeText through the existing intent recognizer.

Under fallback (local `AskUserQuestion`), the two-turn flow reverts to today's behavior.

## Available commands (unchanged)

`/cockpit:auto` — this command. Other cockpit commands (`clarify`, `queue`, `merge`, `review`, `status`, `watch`) are unaffected by #449.

## Troubleshooting

### "I see gates open in the transcript but no answers come back"

- Verify the doorbell surface is delivering `gate-answer` events. Check `Monitor` output — a `gate-answer` line should appear when the inbox operator answers.
- Verify the cluster is emitting the events on the correct epic-ref / tracking-ref (should match the run's identity in the pointer line).
- If the events aren't arriving, the loop degrades to fallback on the NEXT wake — no data loss, but you'll see local `AskUserQuestion` fire eventually.

### "A gate keeps re-opening every time I answer"

- Likely a live-state / generation mismatch — the underlying label is still `waiting-for:*` even though the answer was applied.
- Check the ledger for `superseded` outcomes. If you see multiple `superseded (stale generation)` for the same gate, the inbox is answering an old generation — refresh the inbox and re-answer.

### "I set `--gates=ui` but the run behaves like local"

- Check pre-flight — the run should have hard-failed on absence. If it started, `cockpit_gate_open` IS bound; the mode should be `ui`.
- Check the first ledger header line — it names the resolved mode: `Auto run starting · gates: ui (source: --gates=ui)`. If it says `local`, arg parse thinks the value is `local` — re-check the invocation for typos.

### "I want to see the wire contract"

See [cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md) in tetrad-development. The plugin implements against those contracts as written; contract changes must be proposed on the epic tracking issue (`generacy-ai/generacy-cloud` — see #449 spec § Summary).
