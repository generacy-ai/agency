# Contract: Fused Analysis + Approval Prompt Step

**Feature**: 388-found-during-cockpit-v1
**Target**: `packages/claude-plugin-cockpit/commands/review.md`, new step 3

This is a **structural contract** on the shape of one playbook step. The consumers are Claude at runtime (interpreting the playbook) and human reviewers (verifying the contract via grep + reading).

---

## C.0 — Scope

Applies to the new step 3 ("fused analysis + approval prompt") in `review.md`. Applies unconditionally in the non-error path; applies with the noted exception in the `/code-review` hard-error path.

## C.1 — Rule sentence

The step body opens with exactly this sentence, appearing exactly once in the file:

> The findings summary is delivered AS PART OF the same response that invokes `AskUserQuestion` — presenting findings in a response that does not invoke `AskUserQuestion` is a protocol violation. Do not end a response between completing the analysis and invoking the prompt.

**Verifier**: `grep -c "delivered AS PART OF the same response that invokes AskUserQuestion" packages/claude-plugin-cockpit/commands/review.md` → `1`.

## C.2 — `--gate` branching

Immediately below the rule sentence, the step branches on the argument value `--gate <name>`:

| `--gate` value | Sub-branch |
|----------------|------------|
| `implementation-review` | Implementation-review sub-branch (C.3) |
| `spec-review` | Artifact-review sub-branch (C.4) |
| `clarification-review` | Artifact-review sub-branch (C.4) |
| `plan-review` | Artifact-review sub-branch (C.4) |
| `tasks-review` | Artifact-review sub-branch (C.4) |

Values outside this set are rejected at step 1 (parse arguments) and never reach the fused step.

## C.3 — Implementation-review sub-branch

Executes in this order:

1. Invoke Claude Code's built-in `/code-review`. This is the sole cross-slash-command exception permitted in the cockpit plugin family.
2. Capture output verbatim.
3. Classify each finding as `Blocking? Yes` (correctness / security / data-integrity failure scenario) or `Blocking? No` (style / simplification / nit).
4. **[Inline text — MUST appear on this line, immediately before the table rendering instruction]** `MUST NOT print raw JSON under any circumstance.` If `/code-review` returns JSON, parse it and render the required summary table before printing anything else. Raw JSON is a defect.
5. Render the findings-summary table as **prose in the response body**:

   ```markdown
   | # | File:line | Finding | Blocking? |
   |---|-----------|---------|-----------|
   | 1 | <path>:<line> | <one-line finding summary> | Yes | No |
   ```

   Zero findings → single row `| (none) | | | |`.
6. Append a `Suggested decision: <approve|request-changes|abort>` line:
   - Any `Yes` in `Blocking?` → `request-changes`.
   - All `No` (findings present, none blocking) → `approve`.
   - No findings → `approve`.
7. Converge into C.5.

**Error path**: if `/code-review` exits non-zero or emits malformed output, route to **Error handling** block with class `OTHER`. Do NOT invoke `AskUserQuestion`. Do NOT emit any of the Terminal Outcome Check markers (`Labels:` / `Feedback posted:` / `Aborted:`).

## C.4 — Artifact-review sub-branch (`spec-review` / `clarification-review` / `plan-review` / `tasks-review`)

Executes in this order:

1. Read the corresponding artifact from the epic's spec directory (resolution is done by the CLI, not by this playbook): `spec.md`, `clarifications.md`, `plan.md`, or `tasks.md`.
2. Produce a terse three-section summary as **prose in the response body**:
   - `## Blockers`
   - `## Open questions`
   - `## Suggested decision`

   Empty sections render as `- (none)`.
3. Append a `Suggested decision: <approve|request-changes|abort>` line.
4. Converge into C.5.

## C.5 — Shared `AskUserQuestion` invocation (convergence)

Both sub-branches terminate in a single `AskUserQuestion` invocation in the same response as the analysis prose above. Shape:

- One question. The `question` field carries either:
  - **Normal case**: the findings-summary table (implementation-review) or the three-section summary (artifact-review), reproduced from the prose above.
  - **Digest fallback**: when the summary payload exceeds the tool's size budget (model judgment — rough guide ~4 KB). The digest MUST include: artifact/PR identifier + blocking count + non-blocking count + a "see table above" pointer. Format is illustrative — e.g., `Review of PR #<n>: N findings (B blocking, NB non-blocking) — see table above` is one valid rendering, not the only one.
- Options list, in this exact order:
  1. `approve` — Advance the gate.
  2. `request-changes` — Post an `event: COMMENT` PR review with per-finding inline comments (post-renumber step 5). Do NOT advance.
  3. `abort` — Stop without advancing and without posting any PR review.

**Invariant**: the response containing this `AskUserQuestion` call MUST also contain the prose summary (C.3.5 or C.4.2). Never one without the other. Never in separate turns.

## C.6 — Downstream side effects (renumbered steps 4/5/6)

Post-`AskUserQuestion` behavior is unchanged and lives in steps 4/5/6 (post-renumber):

| Operator choice | Executed by | Terminal marker |
|-----------------|-------------|-----------------|
| `approve` | Step 4 — runs `generacy cockpit advance --gate <name>`; posts `event: COMMENT` PR review body-only if non-blocking findings present (implementation-review only) | `Labels: waiting-for:<gate> → completed:<gate>` |
| `request-changes` (implementation-review) | Step 5 — POSTs `event: COMMENT` review with `N finding(s) requiring changes; see inline comments.` body and one inline comment per finding | `Feedback posted: N inline comment(s) on PR #<pull_number>` |
| `request-changes` (artifact gates) | Step 5 — emits single line `Changes requested at <gate>; artifact reviewer will address feedback and re-request review.` | (no PR marker) |
| `abort` | Step 6 — emits `Aborted: no changes to gate <gate>; no PR review posted.` | `Aborted:` |

The Terminal Outcome Check block (unchanged fence markers, unchanged marker list, unchanged step-5-only re-invocation fallback with renumbered reference) covers non-emission of any of the three markers by re-invoking the fused step's `AskUserQuestion` prompt (**not** re-invoking `/code-review`, **not** restarting from step 1 or step 2).

---

## Non-normative examples (informative)

### Example 1 — normal implementation-review flow (5 findings, 2 blocking)

The model's response looks like:

```
[analysis prose: file reads, classification reasoning, etc.]

MUST NOT print raw JSON under any circumstance.

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| 1 | src/foo.ts:42 | Missing null check on user.id | Yes |
| 2 | src/foo.ts:78 | SQL string concatenation | Yes |
| 3 | src/bar.ts:15 | Prefer const over let | No |
| 4 | src/bar.ts:33 | Unused import | No |
| 5 | src/baz.ts:9  | Off-by-one in loop bound | No |

Suggested decision: request-changes

[AskUserQuestion tool call in the SAME response, options: approve / request-changes / abort]
```

### Example 2 — zero-findings implementation-review

```
[analysis prose noting /code-review returned no findings]

MUST NOT print raw JSON under any circumstance.

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| (none) | | | |

Suggested decision: approve

[AskUserQuestion tool call in the SAME response]
```

### Example 3 — `/code-review` hard error

```
[error class: OTHER]
CLI failed with exit code 1.
```
```
<stderr fenced code block>
```

**No `AskUserQuestion` call.** **No `Labels:` / `Feedback posted:` / `Aborted:` marker.** This is a legitimate non-zero exit.

### Example 4 — digest fallback (implementation-review, 40 findings)

```
[analysis prose]

MUST NOT print raw JSON under any circumstance.

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| 1 | … | … | Yes |
… (39 more rows) …

Suggested decision: request-changes

[AskUserQuestion in the SAME response — question field carries:
 "Review of PR #<n>: 40 findings (12 blocking, 28 non-blocking) — see table above",
 NOT the full table.]
```

---

## Anti-patterns (each is a CONTRACT VIOLATION)

**AP-1** — Analysis prose printed in one response, `AskUserQuestion` invoked in a later response. This is the observed defect. Sole exception: `/code-review` hard error path (C.3, error clause), where no `AskUserQuestion` is invoked at all.

**AP-2** — `AskUserQuestion` invoked with an empty or placeholder `question` field while the summary prose is present. The `question` MUST carry either the full summary or a compliant digest.

**AP-3** — Raw JSON (e.g., `{"findings": [...]}`) emitted anywhere in the response body. Fusion structurally forecloses this because a valid `AskUserQuestion` payload requires the rendered summary above, and the retained `MUST NOT print raw JSON` clause enforces at the point of behavior.

**AP-4** — Rule sentence duplicated in the file (grep count > 1). SC-003 violation.

**AP-5** — Two separate fused steps with two separate `AskUserQuestion` invocations (Option B from Q4). Q4=A explicitly rejects this shape.

**AP-6** — `Suggested decision:` line omitted. FR-007 requires it in the pre-prompt prose.

**AP-7** — Terminal Outcome Check block modified in fence markers, marker list, or fallback structure. FR-010 requires preservation.

**AP-8** — Pre-fusion example (analysis in one response, prompt in the next) left in `## Examples`. FR-012 / Q7=A violation.
