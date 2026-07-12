# Quickstart: verifying #406

**Feature**: #406
**Date**: 2026-07-11
**Status**: Complete

## Purpose

A runbook for verifying the #406 migration end-to-end. Three surfaces: (1) static prose greps that a reviewer can run without a live cluster, (2) the Vitest suite that runs at build time, (3) the operator smoke-test one-liner for empirical verification once cluster-base#75 lands.

## Prerequisites

- Repository checked out at branch `406-follow-up-generacy-ai`.
- Node.js (repository-standard) + pnpm.
- For the operator smoke-test only: a Generacy test cluster carrying cluster-base#75 (post-merge).

## Static verification (no cluster needed)

### 1. Verb migration completeness (VR-2 / FR-001 / SC-001)

Every migrated playbook shows zero residual Bash-form cockpit-CLI invocations for the six migrated verbs:

```bash
# Expect: empty output (zero hits).
grep -nE 'generacy cockpit (status|context|queue|advance|resume|merge)\b' \
  packages/claude-plugin-cockpit/commands/{auto,clarify,review,merge,queue,status}.md
```

`watch.md` retains its verb:

```bash
# Expect: >= 1 hit (`generacy cockpit watch`).
grep -nE 'generacy cockpit watch\b' packages/claude-plugin-cockpit/commands/watch.md
```

### 2. `cockpit_await_events` loop presence (VR-3 / FR-002)

`auto.md` uses `cockpit_await_events` as its event-consumption verb:

```bash
# Expect: >= 1 hit under § Instructions step 4.
grep -n 'cockpit_await_events' packages/claude-plugin-cockpit/commands/auto.md
```

The retired watch-process spawn is gone:

```bash
# Expect: zero hits in auto.md (watch.md retains its own spawn shape).
grep -nE 'run_in_background: true' packages/claude-plugin-cockpit/commands/auto.md
```

The Monitor tool primitive reference is gone:

```bash
# Expect: zero hits in auto.md's step-4 vicinity.
grep -n 'Monitor' packages/claude-plugin-cockpit/commands/auto.md
```

### 3. Cursor is in-memory only (VR-4 / FR-003)

Positive assertion (recovery convergence sentence is present):

```bash
# Expect: >= 1 hit — the sentence stating cursor is in-memory only.
grep -niE 'cursor.*in.?memory only' packages/claude-plugin-cockpit/commands/auto.md
```

Negative assertion (no on-disk cursor form):

```bash
# Expect: zero hits.
grep -nE '\.cockpit/cursor|state/cursor|cursor\.json' packages/claude-plugin-cockpit/commands/auto.md
```

### 4. Startup sweep tool-presence check (VR-5 / FR-006 / SC-005)

The ledger-line-on-abort format is present verbatim:

```bash
# Expect: >= 1 hit — the load-bearing ledger-line string.
grep -nF 'startup · cockpit-mcp-tools-missing · abort · see cluster-base#75' \
  packages/claude-plugin-cockpit/commands/auto.md
```

The guidance sentence is present:

```bash
# Expect: >= 1 hit.
grep -nF 'cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75' \
  packages/claude-plugin-cockpit/commands/auto.md
```

`AskUserQuestion` does not appear in the fail path (grep the tool-presence-check paragraph):

```bash
# Expect: zero hits within +/- 10 lines of the fail-loud paragraph.
grep -nB 5 -A 10 'cockpit-mcp-tools-missing' packages/claude-plugin-cockpit/commands/auto.md | \
  grep -c AskUserQuestion
# Result should be 0.
```

### 5. Invariant §9 present (VR-6 / FR-005)

```bash
# Expect: exactly one match for the load-bearing §9 opening substring.
grep -nF 'After the migration, `auto.md` invokes no `generacy cockpit <migrated-verb>` Bash form —' \
  packages/claude-plugin-cockpit/commands/auto.md
```

Verify §1–§8 numbering survives:

```bash
# Expect: exactly 9 numbered invariants (1. through 9.).
awk '/^## Invariants/,/^## /' packages/claude-plugin-cockpit/commands/auto.md | \
  grep -cE '^[1-9]\. '
# Result should be 9.
```

### 6. `watch.md` untouched (FR-006 boundary)

```bash
# Expect: zero diff on watch.md vs develop.
git diff origin/develop -- packages/claude-plugin-cockpit/commands/watch.md
```

### 7. `lib/*.ts` and `scripts/refresh-help-snapshots.sh` untouched (scope boundary)

```bash
# Expect: zero diff on all three files vs develop.
git diff origin/develop -- \
  packages/claude-plugin-cockpit/lib/reference-consumption.ts \
  packages/claude-plugin-cockpit/lib/gate-vocabulary.ts \
  packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts \
  packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh
```

## Behavioral verification (Vitest suite)

Run the full playbook-verification suite:

```bash
cd packages/claude-plugin-cockpit
pnpm test
```

Expected outcome: all describe blocks pass, including the new `describe("406 — cockpit MCP tool migration + await-events loop", …)` block with seven assertions (406-1 through 406-7).

### Running the 406 block in isolation

```bash
cd packages/claude-plugin-cockpit
pnpm test -- -t "406 — cockpit MCP tool migration"
```

### Interpreting failures

| Assertion | Failure means | Common fix |
|-----------|---------------|------------|
| 406-1 | A `cockpit_*` tool call in a migrated playbook names a tool or parameter not in `406-tool-schemas.json`. | Fix the playbook to match the schema (parameter name typo; tool name typo); OR update the fixture if generacy#917 exported a new schema. |
| 406-2 | A residual `generacy cockpit <migrated-verb>` Bash form remains in a migrated playbook. | Migrate the site to the matching `cockpit_*` MCP tool call. |
| 406-3 | `auto.md` step 4 doesn't use `cockpit_await_events`, or step 2 still spawns the watch process, or step 4 references the Monitor primitive. | Follow the rewrite in `contracts/cockpit-await-events-loop.md`. |
| 406-4 | Cursor prose is missing or contains an on-disk cursor form. | Fix `auto.md` step 4/5 per `contracts/cockpit-await-events-loop.md` § Cursor lifecycle. |
| 406-5 | Startup sweep tool-presence check is missing or malformed. | Fix `auto.md` step 3 top per `contracts/fail-loud-tools-missing.md`. |
| 406-6 | § Invariants doesn't have exactly nine numbered items, or §9 opening substring is wrong. | Restore §9 per plan.md's stated wording. |
| 406-7 | Typed-error parser doesn't preserve `code`/`message`/`details` verbatim, or fixture inputs/outputs don't match. | Fix the parser or update the fixture per `contracts/mcp-tool-migration.md` § Typed error surface. |

### Related historical assertions (regression protection)

The 398-1 assertion's known-verb list narrows to `["watch"]` on this branch. If 398-1 fails, it likely means either (a) a migrated playbook still invokes a migrated verb via Bash — 406-2 will also fail; fix the underlying playbook, or (b) the `refresh-help-snapshots.sh` script's captured snapshot for `watch` diverged from `commands/watch.md`'s invocation — regenerate via `scripts/refresh-help-snapshots.sh` inside a cluster session.

## Operator smoke test (post cluster-base#75)

### One-liner

Once cluster-base#75 has landed in a Generacy test cluster:

```bash
# From the operator's working directory inside a cluster session:
/cockpit:auto <epic-ref>
```

### Success criteria (SC-001 / SC-003 / SC-004 / SC-005)

- **SC-001**: The session transcript shows zero `Bash` tool calls of the form `generacy cockpit <migrated-verb> …`.
- **SC-003**: On a comparable 12-issue epic, count `cockpit_await_events` calls that returned ≥1 event. Target: ≤ ~50. Baseline: ~100 (see spec § SC-003 and `research.md` § D3).
- **SC-004**: Malformed refs (test by intentionally supplying an invalid ref like `owner/repo!N`) surface as typed errors at the tool boundary — one round-trip, no engine call, no `cockpit status` diagnosis turn.
- **SC-005**: Pre-registration cluster (before cluster-base#75) — the session prints the guidance sentence, writes the ledger line, and exits non-zero. Post-registration cluster — the session proceeds normally.

### Measuring dispatch rounds against the baseline

The count for SC-003 is derived from the session transcript by:

```bash
# In the operator's shell, after the run:
grep -c 'cockpit_await_events' /path/to/session-transcript.jsonl
# Compare against ~100 baseline for the equivalent watch-derived event count.
```

The baseline of ~100 is documented in `generacy-ai/tetrad-development#92`, `issuecomment-4948309408` (2026-07-11), and copied into the spec's SC-003 text so it's self-contained.

## Troubleshooting

### "`cockpit_await_events` returns an empty batch every call"

Cluster likely doesn't have any streamed events (idle epic). This is normal — `maxWaitMs=55000` bounds each call, and idle-time returns are cheap. Verify the epic is actionable via `cockpit_status`.

### "`invalid-cursor` fires immediately after the startup sweep"

Session started with a cursor from a prior session (shouldn't happen — cursor is in-memory only). Verify no cursor persistence exists in `auto.md` — 406-4's negative anchor should catch this at test time. If runtime behavior differs from the playbook, file a finding against the tool server (generacy#917) or the runtime cursor handling.

### "Fail-loud path fires but the cluster claims to have cluster-base#75"

Check whether the `cockpit_*` tools are registered in the session's tool binding: the harness lists available tools at session start. If the tools are absent but cluster-base#75 is deployed, the registration path itself is broken — file against cluster-base.

### "Tool-contract audit (406-1) fails after a generacy#917 schema update"

Refresh the fixture:

```bash
# In a cluster session (or with generacy CLI installed globally):
# Capture the current tool schema exports and update 406-tool-schemas.json.
generacy cockpit --export-tool-schemas > packages/claude-plugin-cockpit/tests/fixtures/406-tool-schemas.json
```

(The exact export flag is generacy#917's, not this branch's; the shape is fixed by contract.)

### "Static grep for `cursor.*in.?memory only` finds nothing"

The invariant sentence may have been rephrased. Update the regex in 406-4 to match the current phrasing. The intent — that the cursor is not persisted — is the load-bearing rule; the exact phrasing is defense-in-depth. Consider tightening the assertion to grep for both the intent sentence and the negative anchor (no on-disk cursor path).
