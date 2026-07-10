# Data Model: #396 — `auto.md` structural edits + `lib/gate-vocabulary.ts` module

Playbook structural model (pre/post layout) and TypeScript module shape. This is the design-time reference the implementer follows; each numbered contract invariant (C.1 – C.12) is a machine-checkable claim reflected in either the static grep list ([quickstart.md](./quickstart.md)) or the behavioral assertions in `tests/playbook-verification.test.ts`.

## 1. § Dispatch table — pre/post layout

### 1.1 Pre-state (current `auto.md`, lines ~60-71)

```markdown
| # | Event | Action shape |
|---|-------|--------------|
| D.1 | `waiting-for:clarification` | ... |
| D.2 | `waiting-for:<artifact>-review` | ... |
| D.3 | `waiting-for:implementation-review` | ... |
| D.4 | `waiting-for:manual-validation` | ... |
| D.5 | `completed:validate` + green | ... |
| D.6 | `completed:validate` + red / merge red | ... |
| D.7 | `agent:error` / `failed:*` | ... |
| D.8 | `phase-complete` | ... |
| D.9 | `waiting-for:address-pr-feedback` | Ledger line only (server-side owns it) |
| D.10 | Unrecognized / ambiguous | Escalation gate (Skip / Stop only, never Retry) |
```

### 1.2 Post-state (proposed)

```markdown
| # | Event | Action shape |
|---|-------|--------------|
| D.1 | `waiting-for:clarification` | ... |
| D.2 | `waiting-for:<artifact>-review` | ... |
| D.3 | `waiting-for:implementation-review` | ... |
| D.4 | `waiting-for:manual-validation` | ... |
| D.5 | `completed:validate` + green | ... |
| D.6 | `completed:validate` + red / merge red | ... |
| D.7 | `agent:error` / `failed:*` | ... |
| D.8 | `phase-complete` | ... |
| D.9 | `waiting-for:address-pr-feedback` | Ledger line only (server-side owns it) |
| D.9a | `waiting-for:pr-feedback` | Ledger line only (legacy alias) |
| D.9b | `waiting-for:children-complete` | Ledger line only (epic-container state) |
| D.9c | `waiting-for:dependencies` | Ledger line only (engine-owned cross-issue wait) |
| D.11 | `waiting-for:merge-conflicts` | Escalation gate (`I've resolved it` / `Skip` / `Stop`) |
| D.10 | Unrecognized / ambiguous | Escalation gate (Skip / Stop only, never Retry) |
```

**Contract invariants**:
- **C.1**: The § Dispatch table's last row is D.10. (Catch-all last.)
- **C.2**: D.9a, D.9b, D.9c appear immediately after D.9 and before D.11. (Named ledger-only family grouping.)
- **C.3**: D.11 appears between D.9c and D.10. (Named escalation row before catch-all.)

## 2. § Dispatch prose sections — new/edited subheadings

### 2.1 D.9a — `waiting-for:pr-feedback` (NEW subheading)

```markdown
### D.9a — `waiting-for:pr-feedback` → ledger only

**Trigger**: An issue enters `waiting-for:pr-feedback`. Verbatim event string: `waiting-for:pr-feedback`. Legacy alias of the engine-owned feedback loop (D.9 `waiting-for:address-pr-feedback` is the modern shape; some pre-migration epics still emit the shorter `pr-feedback` label).

**Dispatch**: **Ledger line only.** No CLI verb, no subagent, no gate — server-side-owned. Same handling as D.9.

**Ledger line**: `<issue-ref> · waiting-for:pr-feedback · (no-op) · server-side-owned`.
```

### 2.2 D.9b — `waiting-for:children-complete` (NEW subheading)

```markdown
### D.9b — `waiting-for:children-complete` → ledger only

**Trigger**: An epic-container issue enters `waiting-for:children-complete`. Verbatim event string: `waiting-for:children-complete`. Epic-container state — the running auto loop *is* its resolution (children dispatch as they transition; on the last child's completion, this label transitions naturally to `epic-complete` without operator input).

**Dispatch**: **Ledger line only.** No CLI verb, no subagent, no gate — server-side-owned.

**Ledger line**: `<issue-ref> · waiting-for:children-complete · (no-op) · server-side-owned`.
```

### 2.3 D.9c — `waiting-for:dependencies` (NEW subheading)

```markdown
### D.9c — `waiting-for:dependencies` → ledger only

**Trigger**: An issue enters `waiting-for:dependencies`. Verbatim event string: `waiting-for:dependencies`. Engine-owned cross-issue wait — resolved server-side when the depended-on issue transitions.

**Dispatch**: **Ledger line only.** No CLI verb, no subagent, no gate — server-side-owned.

**Ledger line**: `<issue-ref> · waiting-for:dependencies · (no-op) · server-side-owned`.
```

### 2.4 D.10 — Unrecognized / ambiguous state (EDIT — tightened trigger)

**Pre-state** (current):
> **Trigger**: The re-check step reads a live state whose transition class is not one of D.1–D.9. This can happen when: (a) S8 adds a new transition class the playbook doesn't know, (b) the streamed event conflicts with the live state and neither is dispatchable, (c) `cockpit status --json` returns an unexpected shape.

**Post-state** (tightened):
> **Trigger**: The re-check step reads a live state whose transition class is not one of D.1–D.9 (including D.9a/b/c) or D.11. This can happen when: (a) S8 adds a new transition class the playbook doesn't know, (b) the streamed event conflicts with the live state and neither is dispatchable, (c) `cockpit status --json` returns an unexpected shape, **(d) the live state is a `waiting-for:*` label that does not match a Trigger in any § Dispatch row (D.1–D.9c or D.11)**.
>
> **Any `waiting-for:*` label without a matching dispatch row IS an unrecognized state.** "Known but not actionable" is not a permissible classification outcome — the § Dispatch table is the exhaustive list of `waiting-for:*` states the loop may treat as no-ops (via the named ledger-only rows D.9, D.9a, D.9b, D.9c). "Wait for someone else to handle it" is never a permissible dispatch outcome for a `waiting-for:*` state unless the table explicitly names it ledger-only. If the table does not name it, D.10 fires — verbatim state in the presentation block.

**Contract invariants**:
- **C.4**: D.10 trigger prose contains the verbatim phrase `Any \`waiting-for:*\` label without a matching dispatch row IS an unrecognized state.` (Greppable anchor.)
- **C.5**: D.10 trigger prose enumerates the four trigger cases (a)–(d) with case (d) being the `waiting-for:*`-without-dispatch-row case.

### 2.5 D.11 — `waiting-for:merge-conflicts` (NEW subheading)

```markdown
### D.11 — `waiting-for:merge-conflicts` → escalation gate (I've resolved it / Skip / Stop)

**Trigger**: An issue enters `waiting-for:merge-conflicts` (base-sync produced a merge conflict; the branch cannot be advanced without an operator-authored resolution). Verbatim event string: `waiting-for:merge-conflicts`.

**Dispatch**:
1. **Fetch context.** Read the pause-alert comment posted by the engine when the label was set (via `gh issue view --comments <issue-ref>`). Extract the list of conflicted paths.
2. **Present escalation gate** (see § Gate contract G.4d). In one assistant response: presentation block including the conflicted paths + single `AskUserQuestion` with options `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`.
3. **Apply verdict**:
   - `I've resolved it — advance the gate` → run `generacy cockpit advance --gate merge-conflicts <issue-ref>`. On zero exit: ledger `advanced`; continue. **On non-zero exit: re-present the D.11 gate with the CLI stderr prepended verbatim to the presentation block** (see § Gate contract G.4d re-present shape). The operator may retry, skip, or stop from the re-presented gate.
   - `Skip` → add `<issue-ref>` to session mute set; ledger line `skip (session-local mute)`; continue.
   - `Stop` → kill watch; summary; exit.

**Future degradation**: Once the engine-side merge-conflicts resolver ships (companion finding in generacy dead-end-gate), this row degrades to ledger-only (D.9-shape) — the label becomes server-side-owned. Until then, this escalation gate is the operator's resolution surface.

**Ledger line**: `<issue-ref> · waiting-for:merge-conflicts · escalation-gate · <advanced | advance failed: <description> | skip (session-local mute) | stop (exit)>`.
```

**Contract invariants**:
- **C.6**: D.11 subheading contains the exact string `### D.11 — \`waiting-for:merge-conflicts\``.
- **C.7**: D.11 dispatch step 3 contains the verbatim phrase `On non-zero exit: re-present the D.11 gate with the CLI stderr prepended verbatim to the presentation block`. (Greppable anchor for Q3=A.)
- **C.8**: D.11 ledger-line row lists all four outcomes exactly: `advanced`, `advance failed: <description>`, `skip (session-local mute)`, `stop (exit)`.

## 3. § Gate contract G.4 — pre/post layout

### 3.1 Pre-state (contract table, lines ~271-273)

```markdown
| G.4 (a) | Escalation: validate-red / merge-red | `Retry` / `Skip` / `Stop` (single call) | Fixer summary + reason + failing checks |
| G.4 (b) | Escalation: agent:error / failed:*    | `Requeue` / `Skip` / `Stop` (single call) | Failure evidence |
| G.4 (c) | Escalation: unrecognized state         | `Skip (Recommended)` / `Stop` (single call, no Retry) | Observed state |
```

### 3.2 Post-state (contract table)

```markdown
| G.4 (a) | Escalation: validate-red / merge-red | `Retry` / `Skip` / `Stop` (single call) | Fixer summary + reason + failing checks |
| G.4 (b) | Escalation: agent:error / failed:*    | `Requeue` / `Skip` / `Stop` (single call) | Failure evidence |
| G.4 (d) | Escalation: Merge-conflicts            | `I've resolved it — advance the gate` / `Skip` / `Stop` (single call) | Conflicted paths (+ CLI stderr on re-present) |
| G.4 (c) | Escalation: unrecognized state         | `Skip (Recommended)` / `Stop` (single call, no Retry) | Observed state |
```

**Contract invariants**:
- **C.9**: § Gate contract table's `G.4 (d)` row appears between `G.4 (b)` and `G.4 (c)`.

### 3.3 G.4 presentation-block sub-sections — pre/post

**Pre-state** (lines ~394-429):
- `(a) Validate-red / merge-red` presentation block
- `(b) agent:error / failed:*` presentation block
- `(c) Unrecognized state` presentation block

**Post-state**:
- `(a) Validate-red / merge-red` presentation block (unchanged)
- `(b) agent:error / failed:*` presentation block (unchanged)
- `(d) Merge-conflicts` presentation block (NEW — inserted between (b) and (c))
- `(c) Unrecognized state` presentation block (unchanged position: terminal)

### 3.4 G.4 (d) Merge-conflicts presentation block (NEW)

**Initial presentation**:

```markdown
Merge conflicts on <issue-ref>:

Conflicted paths (from engine pause alert):
- <path 1>
- <path 2>
- ...

The branch cannot advance until the conflicts are resolved and the branch is pushed conflict-free. Resolve locally (e.g., `git checkout <branch>; git rebase origin/main; git mergetool; git push --force-with-lease`), then select `I've resolved it — advance the gate` to run `generacy cockpit advance --gate merge-conflicts <issue-ref>`.
```

**Re-presentation on non-zero CLI exit** (Q3=A shape):

```markdown
Advance failed for <issue-ref>:

<CLI stderr verbatim, from `generacy cockpit advance --gate merge-conflicts <issue-ref>`>

Merge conflicts on <issue-ref>:

Conflicted paths (from engine pause alert):
- <path 1>
- <path 2>
- ...

The branch cannot advance until the conflicts are resolved and the branch is pushed conflict-free. ...
```

**Contract invariants**:
- **C.10**: G.4 (d) presentation-block sub-section heading appears between `(b) \`agent:error\` / \`failed:*\`` and `(c) Unrecognized state`.
- **C.11**: G.4 (d) re-presentation shape includes the CLI stderr verbatim as a prefixed block above the original conflicted-paths block.

### 3.5 G.4 § Options-per-subtype table (extension, lines ~437-441)

**Pre-state**:
```markdown
| Subtype | Options |
|---------|---------|
| (a) validate-red / merge-red | `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)` |
| (b) agent:error / failed:*    | `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` |
| (c) unrecognized state         | `Skip (session-local mute) (Recommended)` / `Stop (exit auto)` — **NEVER Retry** |
```

**Post-state**:
```markdown
| Subtype | Options |
|---------|---------|
| (a) validate-red / merge-red | `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)` |
| (b) agent:error / failed:*    | `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` |
| (d) merge-conflicts            | `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)` |
| (c) unrecognized state         | `Skip (session-local mute) (Recommended)` / `Stop (exit auto)` — **NEVER Retry** |
```

### 3.6 G.4 § Post-gate mechanism sentences (extension, lines ~444-448)

**Pre-state (verbatim)**:
```markdown
**Post-gate mechanism sentences** (verbatim per Q3=D):
- `Retry` (subtype a only) → re-run the fixer subagent **once**. If `{fixed: true}`, loop back to D.5; if `{fixed: false}`, re-present the escalation gate.
- `Requeue` (subtype b only) → `generacy cockpit resume <issue-ref>` (Assumption A2). If verb missing, degrade to Skip with explicit ledger note.
- `Skip` (all subtypes) → add `<issue-ref>` to the in-memory **session mute set**; ledger line; continue. **Labels untouched.**
- `Stop` (all subtypes) → kill watch process; print run summary; exit auto cleanly. **No label writes.**
```

**Post-state (add one line)**:
```markdown
**Post-gate mechanism sentences** (verbatim per Q3=D):
- `Retry` (subtype a only) → re-run the fixer subagent **once**. If `{fixed: true}`, loop back to D.5; if `{fixed: false}`, re-present the escalation gate.
- `Requeue` (subtype b only) → `generacy cockpit resume <issue-ref>` (Assumption A2). If verb missing, degrade to Skip with explicit ledger note.
- `I've resolved it — advance the gate` (subtype d only) → `generacy cockpit advance --gate merge-conflicts <issue-ref>`. On zero exit, ledger `advanced` and continue. On non-zero exit, re-present the D.11 gate with the CLI stderr prepended verbatim to the presentation block (see § D.11 dispatch step 3).
- `Skip` (all subtypes) → add `<issue-ref>` to the in-memory **session mute set**; ledger line; continue. **Labels untouched.**
- `Stop` (all subtypes) → kill watch process; print run summary; exit auto cleanly. **No label writes.**
```

## 4. § Action + outcome vocabulary — pre/post layout

### 4.1 Pre-state (ledger-format table, lines ~513-528)

```markdown
| D.9 address-pr-feedback | `(no-op)` | `server-side-owned` |
| D.10 unrecognized | `unrecognized-state` | `skip (session-local mute)`, `stop (exit)` |
```

### 4.2 Post-state

```markdown
| D.9 address-pr-feedback | `(no-op)` | `server-side-owned` |
| D.9a pr-feedback | `(no-op)` | `server-side-owned` |
| D.9b children-complete | `(no-op)` | `server-side-owned` |
| D.9c dependencies | `(no-op)` | `server-side-owned` |
| D.11 merge-conflicts | `escalation-gate` | `advanced`, `advance failed: <description>`, `skip (session-local mute)`, `stop (exit)` |
| D.10 unrecognized | `unrecognized-state` | `skip (session-local mute)`, `stop (exit)` |
```

**Contract invariants**:
- **C.12**: § Action + outcome vocabulary table's rows appear in the order D.9, D.9a, D.9b, D.9c, D.11, D.10 (mirroring the § Dispatch table's row order).

## 5. `packages/claude-plugin-cockpit/lib/gate-vocabulary.ts`

### 5.1 File shape

```typescript
/**
 * gate-vocabulary.ts
 *
 * Plugin-local declared vocabulary of `waiting-for:*` labels the auto.md
 * playbook must dispatch. The drift audit (see tests/playbook-verification.test.ts,
 * assertion 396-3) asserts every token in this list appears as a Trigger in
 * auto.md's § Dispatch table.
 *
 * Upstream sources (sync obligation — this file must be re-synced when
 * upstream changes, otherwise the audit fails at build time; runtime safety
 * is preserved by auto.md D.10's tightened trigger regardless of sync state):
 *
 * - /workspaces/tetrad-development/.github/labels.yml
 *   (canonical machine-readable list consumed by scripts/sync-labels.sh; 11
 *   `waiting-for:*` tokens as of #396)
 * - /workspaces/tetrad-development/docs/label-protocol.md
 *   (human-facing reference; author-curated; may lag labels.yml)
 *
 * The 12th token (`waiting-for:merge-conflicts`) is registered in the two
 * upstream sources by the operator as a same-day docs/config edit companion
 * to #396 (see specs/396-found-during-cockpit-v1/plan.md § Companion
 * operator-side edits).
 */

export const GATE_VOCABULARY = [
  "waiting-for:clarification",
  "waiting-for:spec-review",
  "waiting-for:clarification-review",
  "waiting-for:plan-review",
  "waiting-for:tasks-review",
  "waiting-for:implementation-review",
  "waiting-for:manual-validation",
  "waiting-for:address-pr-feedback",
  "waiting-for:pr-feedback",
  "waiting-for:children-complete",
  "waiting-for:dependencies",
  "waiting-for:merge-conflicts",
] as const;

export type GateVocabularyToken = (typeof GATE_VOCABULARY)[number];
```

### 5.2 Export contract

- **Named export `GATE_VOCABULARY`**: a `readonly string[]` (typed as `readonly ["waiting-for:clarification", ...]` via `as const`) of exactly 12 tokens in the listed order.
- **Named export `GateVocabularyToken`**: a union type derived from the array.
- **Consumers**: `tests/playbook-verification.test.ts` (assertion 396-3 reads the array + reads `auto.md` and asserts subset containment). No runtime code path imports this module.

### 5.3 Sync-obligation contract

When the operator adds a `waiting-for:*` token to `tetrad-development/.github/labels.yml`:
1. Add the token to the `GATE_VOCABULARY` array in `lib/gate-vocabulary.ts` (in the order it appears in `labels.yml` if practical, or appended).
2. Add a dispatch row in `packages/claude-plugin-cockpit/commands/auto.md` — named ledger-only D.9-shape or named escalation-gate D.11-shape depending on semantics.
3. Run the drift audit locally (`pnpm --filter claude-plugin-cockpit test`) to confirm the audit passes.

Missing step 2 → audit fails at build time → PR is blocked. Missing step 1 → runtime behavior unchanged (D.10 catches the token as unrecognized); audit still passes; the vocabulary drifts silently. This is the load-bearing asymmetry: **the runtime rule is the safety net; the audit is completeness hygiene**.

## 6. Fixture shapes

### 6.1 `tests/fixtures/396-merge-conflicts-live-state.json`

Shape (matches the `cockpit status --json` schema used by #394's `394-actionable-live-state.json`):

```json
{
  "epic_ref": "christrudelpw/epic#42",
  "issues": [
    {
      "issue_ref": "christrudelpw/epic#43",
      "labels": ["waiting-for:merge-conflicts"],
      "transition_class": "waiting-for:merge-conflicts",
      "conflicted_paths": ["packages/foo/src/bar.ts", "packages/foo/tests/bar.test.ts"]
    }
  ]
}
```

Used by assertion 396-1 to drive the D.11 reference-dispatch handler.

### 6.2 `tests/fixtures/396-someday-gate-live-state.json`

Shape:

```json
{
  "epic_ref": "christrudelpw/epic#42",
  "issues": [
    {
      "issue_ref": "christrudelpw/epic#43",
      "labels": ["waiting-for:someday-gate"],
      "transition_class": "waiting-for:someday-gate"
    }
  ]
}
```

Deliberately: `waiting-for:someday-gate` is **not** in `GATE_VOCABULARY` AND **not** in `auto.md`'s § Dispatch table. Used by assertion 396-2 to confirm the D.10 catch-all fires at runtime even when the vocabulary is out-of-sync.

## 7. Test-file extensions

`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (created by #394; extend, don't rewrite):

- Add a new `describe("396 — auto.md D.11 dispatch + tightened D.10 trigger + drift audit", …)` block below the existing `describe("394 — …", …)` block.
- Inside, three `it(…)` assertions (396-1, 396-2, 396-3) per the contracts in [contracts/](./contracts/).

No changes to the existing `describe("394 — …")` block, its imports, or its two assertions — the 394 assertions must continue to pass unchanged. The 396 block imports from `../commands/auto.md` (raw read) and `../lib/gate-vocabulary.ts` (typed import); the D.11 / D.10 reference-dispatch handlers are colocated in the test file (not in `lib/`) since the runtime is the playbook prose, not a runtime module.

## 8. Sibling-playbook byte-identity check

Files that must remain byte-identical across the branch:

```
packages/claude-plugin-cockpit/commands/clarify.md
packages/claude-plugin-cockpit/commands/review.md
packages/claude-plugin-cockpit/commands/merge.md
packages/claude-plugin-cockpit/commands/queue.md
packages/claude-plugin-cockpit/commands/watch.md
packages/claude-plugin-cockpit/commands/status.md
```

Verification: `git diff origin/develop -- packages/claude-plugin-cockpit/commands/{clarify,review,merge,queue,watch,status}.md` returns empty. Included in [quickstart.md § Static checks](./quickstart.md).

## 9. Contract-invariant checklist

| # | Location | Verifier |
|---|----------|----------|
| C.1 | § Dispatch table last row = D.10 | Static grep + Vitest assertion 396-3 (indirectly, via subset check) |
| C.2 | D.9a/b/c between D.9 and D.11 | Static grep on line ordering |
| C.3 | D.11 between D.9c and D.10 | Static grep on line ordering |
| C.4 | D.10 tightened trigger prose contains verbatim anchor | Static grep |
| C.5 | D.10 trigger enumerates (a)-(d) with (d) = the `waiting-for:*`-no-row case | Static grep |
| C.6 | D.11 subheading present | Static grep |
| C.7 | D.11 re-present-on-non-zero prose present | Static grep |
| C.8 | D.11 ledger row lists 4 outcomes | Static grep |
| C.9 | Gate contract table `G.4 (d)` between (b) and (c) | Static grep on line ordering |
| C.10 | G.4 (d) presentation-block heading between (b) and (c) | Static grep on line ordering |
| C.11 | G.4 (d) re-presentation shape has CLI stderr prefix | Static grep |
| C.12 | § Action + outcome vocabulary table row order | Static grep on line ordering |

Behavioral:
- **396-1**: D.11 gate fires on the merge-conflicts fixture. (Runtime rule at the load-bearing surface.)
- **396-2**: D.10 gate fires on a novel `waiting-for:someday-gate` fixture. (Tightened trigger safety net.)
- **396-3**: Every `GATE_VOCABULARY` token appears in `auto.md`'s § Dispatch table. (Drift audit / completeness hygiene.)
