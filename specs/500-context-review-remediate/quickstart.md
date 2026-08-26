# Quickstart: Slimmed `cockpit:auto` (engine owns review→remediate)

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

This feature edits a playbook (`packages/claude-plugin-cockpit/commands/auto.md`) and its pin suite —
there is nothing to install. This quickstart covers how an operator experiences the slimmed loop, how
to verify the change, and how to troubleshoot version skew.

## Prerequisites

- `generacy` CLI on `PATH`, at or above **`MIN_GENERACY_VERSION`** (the first release shipping epic
  #1120's post-validate `implementation-review` gate + `remediation-limit` gate).
- The Monitor tool available (existing pre-flight requirement).
- Engine epic generacy#1120 (P1–P4) merged and shipping in the running generacy package.

## What changed for operators

| Before #500 | After #500 |
|-------------|------------|
| `auto` spawned `cockpit-reviewer` and drove review→request-changes→fix rounds on impl PRs | Engine runs review/remediate/validate server-side; `auto` only reacts to gates |
| `waiting-for:implementation-review` fired **pre-validate** with `approve`/`request-changes`/`abort` | Fires **post-validate** as final approval with `approve`/`hold`/`reject` |
| `completed:validate` red → bounded `cockpit-fixer` + escalation gate | red → ledger-only; re-fires as an engine gate (remediation / remediation-limit) |
| (no remediation cap surface) | `waiting-for:remediation-limit` gate: `resume remediation` / `stop` |

## Running it

```
/cockpit:auto <epic-ref>
```

The pre-flight now additionally probes the engine version. On a supported engine the run proceeds
exactly as before for queueing, clarify relays, and artifact-gate (spec/plan/tasks) reviews — those
are **unchanged**.

### Final-approval gate (post-validate)

When an implementation PR clears validate, the engine raises `waiting-for:implementation-review`.
`auto` renders the remaining findings from the gate body and prompts:

- **`approve`** → routes into the cockpit merge path (merge on green, **never** on red).
- **`hold`** / **`reject`** → no-op; the label stays and the gate re-fires later (like D.4's `not yet`).

No reviewer subagent runs — the engine already reviewed.

### Remediation-limit gate

When the engine's remediate loop hits its cap without converging, it raises
`waiting-for:remediation-limit` with remaining findings in the gate body. `auto` prompts:

- **`resume remediation`** → `cockpit_advance(issue=<ref>, gate="remediation-limit")` — resets the
  engine's counter server-side and lets it keep going.
- **`stop`** → exits `auto` cleanly, writing no labels.

## Verifying the change

### 1. Pin suite green (SC-001)

```bash
pnpm --filter claude-plugin-cockpit test
```

Runs `tests/playbook-verification.test.ts`. All re-pinned assertions plus the new
`describe("500 slim auto to gates/queue/clarify/merge", …)` block must pass. The
`readdirSync(COMMANDS_DIR)` invocation-vs-`--help` sweep must stay green.

### 2. Zero reviewer/fixer dispatch (SC-002)

Dry-run `auto` over an engine-native epic and inspect the transcript: **no** `cockpit-reviewer` and
**no** `cockpit-fixer` invocation on any implementation-PR path.

### 3. Both new/moved gates handled (SC-003)

The same transcript shows correct handling of `waiting-for:remediation-limit`
(`resume remediation`/`stop`) and the post-validate `waiting-for:implementation-review`
(`approve`/`hold`/`reject` → merge).

### 4. Reduced GraphQL polling (SC-004)

Compare PR-state poll cadence before/after: the per-round `cockpit_status` / PR-state polling that
drove review rounds is gone; only the E3 fallback re-checks and the single D.5/D.6 fallback remain.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Pre-flight aborts naming a required generacy version | Engine below `MIN_GENERACY_VERSION` (old-engine + new-auto skew) | Upgrade the generacy package to ≥ `MIN_GENERACY_VERSION`, then re-run |
| Pre-flight aborts with the fail-closed diagnostic | `generacy --version` output unparseable/missing | Verify the `generacy` binary; the guard fails closed by design |
| New engine gate falls through to a D.10 unknown-state escalation | new-engine + **old**-auto skew (old client lacks D.13/G.8/G.9) | Update the `claude-plugin-cockpit` playbook to the #500 version |
| Artifact (spec/plan/tasks) review behaves differently | Not expected — artifact-gate handling is unchanged (FR-002) | Investigate as a regression; G.2 artifact path was not edited |

## Next step

Run `/speckit:tasks` to generate `tasks.md` from this plan and the four contracts.
