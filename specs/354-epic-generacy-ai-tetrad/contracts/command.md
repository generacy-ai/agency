# Contract: `/cockpit:review`

**Feature**: `/cockpit:review` slash command (A2.4)
**Branch**: `354-epic-generacy-ai-tetrad`
**Date**: 2026-06-26

This is the external contract of the slash command — the surface that calling developers and depending commands can rely on. It is binding on the implementation in `packages/claude-plugin-cockpit/commands/review.md`.

---

## Invocation

```
/cockpit:review --gate <name> [--mode <assist|auto|manual>]
/cockpit:review                         # bare → help
/cockpit:review --help                  # explicit help
```

### Arguments

| Arg | Type | Required | Default | Valid values |
|-----|------|----------|---------|--------------|
| `--gate` | string | yes (except for help) | — | `specify`, `clarify`, `plan`, `tasks`, `impl` |
| `--mode` | string | no | `assist` | `assist`, `auto`, `manual` |

### Bare / `--help` output

Lists the supported gates with their canonical artifact (or "PR via review-context" for `impl`) and the three modes with one-line descriptions. Exits without side effects. Satisfies FR-010.

---

## Behaviour — `impl` gate

1. Resolve the active feature via the current git branch (see data-model E4).
2. Call `/cockpit:review-context` (G1.3). Surface its message verbatim on failure.
3. Call `/code-review` on the diff returned by review-context. Surface its summary verbatim.
4. Append `Suggested decision: <verb>` if `/code-review`'s output does not already end with such a line; otherwise reuse the existing line.
5. **Mode dispatch**:
   - `assist` → invoke `AskUserQuestion` with options `approve` / `request-changes` / `abort`. On `approve`, invoke `/cockpit:advance --gate impl`.
   - `auto` → if suggested decision is `approve`, invoke `/cockpit:advance --gate impl` without prompting. Otherwise stop.
   - `manual` → stop after the summary.
6. On successful advance, report the `LabelTransition` (see data-model E8) as a single line, e.g. `Labels: waiting-for:impl → completed:impl on #<issue>`.

---

## Behaviour — non-`impl` gates (`specify`, `clarify`, `plan`, `tasks`)

1. Resolve the active feature via the current git branch (data-model E4).
2. Resolve the artifact path via the `GATE_ARTIFACT` mapping (data-model E3):
   - `specify` → `specs/<feature>/spec.md`
   - `clarify` → `specs/<feature>/clarifications.md`
   - `plan`    → `specs/<feature>/plan.md`
   - `tasks`   → `specs/<feature>/tasks.md`
3. Read the artifact. If missing, emit a `ReviewError` of kind `artifact-missing` naming the expected absolute path.
4. Produce a `ReviewSummary` (data-model E6) with exactly three H2 sections in order: `## Blockers`, `## Open questions`, `## Suggested decision`. Empty sections render as `- (none)`.
5. End with the standard final line: `Suggested decision: <verb>`.
6. **Mode dispatch**: identical to the `impl` branch (step 5 above), with `/cockpit:advance --gate <name>` instead.
7. **Label transition reporting**: identical to the `impl` branch (step 6 above).

---

## Output schema

### Success — summary block (always emitted, in all three modes)

For `impl`:

```
<verbatim /code-review output, possibly multi-section>

Suggested decision: <approve|request-changes|abort>
```

For non-`impl`:

```
## Blockers
- <bullet> | (none)

## Open questions
- <bullet> | (none)

## Suggested decision
<short rationale>

Suggested decision: <approve|request-changes|abort>
```

### Success — label-transition line (emitted only after a successful `/cockpit:advance`)

```
Labels: waiting-for:<gate> → completed:<gate> on #<issue>
```

### Failure — single line

```
Error: <one short, actionable sentence>
```

with no labels mutated. Concrete forms:

| Condition | Message |
|-----------|---------|
| Unknown gate | `Error: unknown gate '<value>'. Valid: specify, clarify, plan, tasks, impl.` |
| Unknown mode | `Error: unknown mode '<value>'. Valid: assist, auto, manual.` |
| Feature directory ambiguous | `Error: cannot resolve specs/ directory for branch '<branch>'. Candidates: <list>.` |
| `review-context` failure (impl) | `Error: <verbatim message from /cockpit:review-context>` |
| Artifact missing (non-impl) | `Error: artifact not found at <expected absolute path>.` |
| `/cockpit:advance` not installed | `Error: dependency '/cockpit:advance' is not available; install the cockpit plugin's G1.2 verb.` |

---

## Side-effect contract

| Side effect | When |
|-------------|------|
| Reads `specs/<feature>/<artifact>.md` | non-`impl` gates only |
| Invokes `/cockpit:review-context` | `impl` gate only |
| Invokes `/code-review` | `impl` gate only |
| Invokes `AskUserQuestion` | `assist` mode only |
| Invokes `/cockpit:advance --gate <name>` | `assist` mode after explicit `approve`; `auto` mode when suggested decision is `approve` |
| Mutates GitHub labels | **never directly** — only via `/cockpit:advance` |
| Posts PR comments | never (out of scope per spec) |
| Mutates `phase:*` labels | never (orchestrator-owned) |

---

## Compatibility & versioning

- The command's name (`cockpit:review`), arguments (`--gate`, `--mode`), and gate set (`specify`, `clarify`, `plan`, `tasks`, `impl`) are stable v1 surface.
- Adding a new gate is a backward-compatible change.
- The non-`impl` summary schema (three H2 sections + final line) is stable v1 surface; callers may grep `^Suggested decision: ` to extract the decision.
- The `impl` summary is whatever `/code-review` emits; its schema is owned by the host skill, not this command.

---

## Reference: dependency contracts (informational only)

These are **not** owned by this issue. They are listed so the implementer knows the assumed call shape.

### `/cockpit:advance --gate <name>` (G1.2 / #788)

- **Adds** `completed:<name>` to the active child issue.
- **Removes** `waiting-for:<name>` from the active child issue.
- Does **not** touch any `phase:*` label.
- Reports the transition it performed.

### `/cockpit:review-context` (G1.3 / #789)

- Resolves the open PR for the active child issue via the shared engine helper.
- Returns the PR ref and diff payload on success.
- Returns a clear, actionable message on zero / multiple / draft / missing-PR cases.

Both dependencies are runtime-resolved. If either is missing at call time, this command exits with a `ReviewError` and no labels are touched.
