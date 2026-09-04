# Quickstart: D.12 foreign-run / out-of-scope gate-answer no-op guard

## What this feature is

A playbook edit to `packages/claude-plugin-cockpit/commands/auto.md` (D.12
step 1) plus pin tests. No runtime code, no MCP tool changes.

## Verify locally

```bash
cd packages/claude-plugin-cockpit
pnpm test          # vitest run — includes playbook-verification.test.ts
```

The 519-* tests fail if:
- the D.12 step-1 no-record branch loses the foreign-run / out-of-scope
  distinction,
- either verbatim vocabulary string changes
  (`foreign-run delivery — not acked (owner run: <runId>)` /
  `out-of-scope delivery — not acked (issue: <issue-ref>)`),
- the no-op branch gains a `cockpit_gate_ack`, or
- the payload-shape `gateKey` composite doc regresses to 3 segments.

## Observe the behaviour in a run

In a `/cockpit:auto` run under `--gates=ui`, a replayed foreign answer shows in
the ledger (`.generacy/cockpit/auto-runs/<slug>-<timestamp>.ledger`) as:

```
Painworth/doc-intel#93 · — · gate-answer · foreign-run delivery — not acked (owner run: Painworth-doc-intel-93-20260902-204407) · source: ui-gate
```

and an out-of-scope historical answer as:

```
Painworth/doc-intel#5 · — · gate-answer · out-of-scope delivery — not acked (issue: Painworth/doc-intel#5) · source: ui-gate
```

No `cockpit_gate_ack` fires for either. A same-run, in-scope answer with no
record still acks `superseded (no record)` exactly as before.

## Troubleshooting

- **A pin test broke after editing auto.md**: re-pin the assertion to the new
  contract in the same PR (CLAUDE.md rule) — do not weaken or delete it.
- **Repeated identical no-op rows in a ledger**: expected — one row per
  replayed delivery, by design (Q5). Upgrading the cluster past generacy#1228
  stops the replays at the source.
- **Adopted-gate answers being no-opped**: must not happen — the guard applies
  only when `openGates[event.gateId]` is absent. If observed, the step-1 edit
  regressed C1 of `contracts/d12-noop-guard.md`.

## Next step

Run `/speckit:tasks` to generate the task list.
