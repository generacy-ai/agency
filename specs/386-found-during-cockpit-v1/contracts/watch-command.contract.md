# Contract: `commands/watch.md` — required strings after rewrite (issue #386)

**Feature**: 386-found-during-cockpit-v1
**File under contract**: `packages/claude-plugin-cockpit/commands/watch.md`
**Consumers**: The Claude Code harness (reads the file as a slash-command prompt at invocation time), the operator (reads the printed output and copy-pastes the suggested invocation).
**Purpose**: Capture, section by section, the exact strings the rewritten file MUST contain for the #386 fixes. This is the reference the quickstart, code review, and any future drift check hangs off. Sections **not touched** by this feature are listed with a byte-preservation notice and the specific verification grep.

Backticks in this document are Markdown code spans; every literal that must appear in `watch.md` byte-for-byte is enclosed in a fenced code block. The prompt text uses ASCII quotes and a single em dash `—` where indicated; smart quotes / en dashes are drift.

## §1 Frontmatter — unchanged

The YAML frontmatter is NOT modified. It remains byte-for-byte the current block:

```markdown
---
description: Watch an epic and stream one line per state transition
---
```

Verification:
- `head -n 3 packages/claude-plugin-cockpit/commands/watch.md` MUST byte-match the block above.

## §2 H1 heading and top prose — modified in one clause

The `# Watch Command` heading is NOT modified. The paragraph immediately under it currently reads:

```markdown
Run `generacy cockpit watch <epic-ref>` and, for each transition line, print one notification suggesting the next `/cockpit:*` verb via the mapping below. On watcher exit, report and stop.
```

Replace with:

```markdown
Run `generacy cockpit watch <epic-ref>` and, for each transition line, print one notification with the complete next-command invocation (verb + ref) via the mapping below, so the suggestion can be copy-pasted straight into the prompt without editing. On watcher exit, report and stop.
```

The change: "suggesting the next `/cockpit:*` verb" → "with the complete next-command invocation (verb + ref)", plus the added rationale clause "so the suggestion can be copy-pasted straight into the prompt without editing." This preserves the "Run …, for each transition line, print one notification … On watcher exit, report and stop." skeleton verbatim.

Verification:
- `grep -c "the complete next-command invocation (verb + ref)" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.
- `grep -c "suggesting the next .cockpit:.* verb" packages/claude-plugin-cockpit/commands/watch.md` MUST report 0 — the pre-fix phrasing does not remain.

## §3 Step 2 — emit rule rewritten

The current step 2 reads:

```markdown
2. Spawn `generacy cockpit watch $ARGUMENTS` via the Bash tool (long-running). For each stdout line, look up the next verb in the mapping table and print `<line> · suggested: <verb>`; for error-state rows, omit the ` · suggested: …` segment.
```

Replace with:

```markdown
2. Spawn `generacy cockpit watch $ARGUMENTS` via the Bash tool (long-running). For each stdout line, look up the next verb in the mapping table, interpolate the transition line's own ref (in its qualified `owner/repo#N` form, verbatim as the CLI emits it) into the invocation, and print `<line> · suggested: ` followed by the complete invocation wrapped in a single-backtick inline code span — e.g. `` <line> · suggested: `/cockpit:merge owner/repo#2` `` or `` <line> · suggested: `/cockpit:review owner/repo#3 --gate implementation-review` ``. For error-state rows, and for any non-error row that carries no ref, omit the ` · suggested: …` segment entirely. Do NOT compare the transition's repo against the session's cwd origin, do NOT strip `owner/repo#` to bare `N` under any condition, and do NOT resolve child vs. epic scope — the transition line's own ref is the ref to interpolate.
```

Rationale for the shape:
- **`interpolate the transition line's own ref … verbatim as the CLI emits it`** enforces Decision 2 (verbatim interpolation, no scope resolution) at the emit rule itself, not just in the mapping table.
- **`(in its qualified owner/repo#N form, verbatim as the CLI emits it)`** enforces Decision 1 (qualified form uniformly) without requiring the playbook to reason about the ref shape — the CLI emits qualified, the plugin copies verbatim, the shape is qualified by construction.
- **`wrapped in a single-backtick inline code span`** enforces Decision 3 (backtick copy affordance).
- **Two examples** (`/cockpit:merge owner/repo#2`, `/cockpit:review owner/repo#3 --gate implementation-review`) match the spec's own examples (spec §Fix, US1 Acceptance) and cover both the flagless and flagged verb shapes.
- **`For error-state rows, and for any non-error row that carries no ref, omit the ` · suggested: …` segment entirely`** enforces FR-006 (error rows unchanged) and FR-007 / Decision 4 (refless rows silenced) in one sentence, mirroring the two omission cases.
- **The final "Do NOT …" clause** locks out the machinery Decisions 1 and 2 rejected — cwd/origin comparison, bare-number stripping, scope resolution — so a future edit reads the prohibition and doesn't reintroduce it as a "cleanup."

Verification:
- `grep -c "interpolate the transition line's own ref" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.
- `grep -c "single-backtick inline code span" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.
- `grep -c "owner/repo#N" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1 (at least this occurrence in step 2; §5's anchor line may bump it higher).
- `grep -c "Do NOT compare the transition's repo" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.
- `grep -c "· suggested: \`/cockpit:merge owner/repo#2\`" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1 — the flagless example is present verbatim.
- `grep -c "· suggested: \`/cockpit:review owner/repo#3 --gate implementation-review\`" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1 — the flagged example is present verbatim.
- `grep -n "print .<line> · suggested: <verb>." packages/claude-plugin-cockpit/commands/watch.md` MUST report 0 — the pre-fix bare-verb emit-rule example is fully replaced.

## §4 Verb mapping table — every "Suggested next command" cell rewritten

The current table header and rows read:

```markdown
| Transition line contains… | Suggested next command |
|---|---|
| `waiting-for:clarification` | `/cockpit:clarify` |
| `waiting-for:spec-review` | `/cockpit:review --gate spec-review` |
| `waiting-for:clarification-review` | `/cockpit:review --gate clarification-review` |
| `waiting-for:plan-review` | `/cockpit:review --gate plan-review` |
| `waiting-for:tasks-review` | `/cockpit:review --gate tasks-review` |
| `waiting-for:implementation-review` | `/cockpit:review --gate implementation-review` |
| `completed:validate` or all green checks | `/cockpit:merge` |
| any `error` / `failed` state | (no suggestion) |
```

Replace with:

```markdown
| Transition line contains… | Suggested next command |
|---|---|
| `waiting-for:clarification` | `/cockpit:clarify <ref>` |
| `waiting-for:spec-review` | `/cockpit:review <ref> --gate spec-review` |
| `waiting-for:clarification-review` | `/cockpit:review <ref> --gate clarification-review` |
| `waiting-for:plan-review` | `/cockpit:review <ref> --gate plan-review` |
| `waiting-for:tasks-review` | `/cockpit:review <ref> --gate tasks-review` |
| `waiting-for:implementation-review` | `/cockpit:review <ref> --gate implementation-review` |
| `completed:validate` or all green checks | `/cockpit:merge <ref>` |
| any `error` / `failed` state | (no suggestion) |
```

The transformation is mechanical: for each row except the last, `<ref>` is inserted immediately after the verb (before any `--gate` flag, if present). The last row (error / failed state) is unchanged — its cell communicates a null, not an invocation.

Rationale for the placeholder position:
- **Verb-first, ref-second, flags-last**: this order matches the `/cockpit:*` command signature (`<verb> <ref> [flags]`) and matches step 2's emit rule. The reader can pattern-match one shape.
- **Space-separated, not slash-suffixed or bracket-wrapped**: the runtime interpolates a space-separated qualified ref (e.g., `/cockpit:merge owner/repo#2`); the placeholder in the doc uses the same delimiter.
- **`<ref>`, not `<child-ref>` or `<epic-ref>` or `N`**: chosen per Decision 5. One placeholder, one meaning, no scope encoding, no bare-form implication.

Verification:
- `grep -c "\`/cockpit:clarify <ref>\`" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.
- `grep -c "\`/cockpit:review <ref> --gate spec-review\`" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1 (and the same shape for `clarification-review`, `plan-review`, `tasks-review`, `implementation-review` — five total review-verb rows, each with `<ref>` present).
- `grep -c "\`/cockpit:merge <ref>\`" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.
- `grep -c "<ref>" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 7 — one per non-error mapping-table row.
- `grep -c "\`/cockpit:review --gate" packages/claude-plugin-cockpit/commands/watch.md` MUST report 0 — the pre-fix bare-verb form does not remain anywhere. (This grep uses the code-span form to avoid matching the emit-rule prose that legitimately contains the string `--gate`.)
- `grep -c "^| any .error. / .failed. state | (no suggestion) |" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1 — the error row is preserved verbatim.

## §5 New "Suggestion format" anchor line — one line, placed immediately after the mapping table

Add a new line immediately after the mapping table (before the `<!-- BEGIN error-conv -->` line), separated from the table by one blank line:

```markdown
**Suggestion format**: each emitted suggestion is a single-backtick-wrapped `` `/cockpit:<verb> <ref> [flags]` `` where `<ref>` is the qualified `owner/repo#N` from the transition line, verbatim. The mapping-table cells show the same shape with `<ref>` as the placeholder — the emit rule and the table share one format.
```

Rationale:
- **Named anchor**: the phrase "Suggestion format" is greppable and self-describing, so a future reader searching for "why is the emit shape what it is?" finds this line first.
- **Restates the composition of the three governing rules** (verb + ref + flags, qualified form, verbatim from the transition line) in one sentence, without duplicating the emit rule's prose in step 2. This is the reader-facing summary; step 2 is the emit-rule normative text.
- **Explicitly ties the emit rule to the mapping-table shape**: the final clause ("The mapping-table cells show the same shape with `<ref>` as the placeholder — the emit rule and the table share one format") makes the doc-runtime consistency an explicit, greppable claim. A future edit that changes the placeholder to `<child-ref>` (or the emit rule to bare-number) would need to touch this line too, which surfaces the drift in review.
- **Placement after the table, before error-conv**: puts the anchor next to the two artifacts it describes (step 2's rule and the table). Placing it at the top of the file would separate it from the material; placing it inside step 2 would bloat step 2.

Verification:
- `grep -c "^\*\*Suggestion format\*\*:" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.
- `grep -c "the emit rule and the table share one format" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.

## §6 Step 1, Step 3, Step 4 — unchanged

Not modified. The current text of each is preserved byte-for-byte:

- Step 1 (`If \`$ARGUMENTS\` is empty …`) — unchanged.
- Step 3 (`On watcher exit, print …`) — unchanged.
- Step 4 (`On any non-zero CLI exit, apply **Error handling** below.`) — unchanged.

Verification:
- `grep -c "If \`\$ARGUMENTS\` is empty, print \`Usage: /cockpit:watch <epic-ref>\` and exit non-zero" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.
- `grep -c "On watcher exit, print .\[cockpit:watch\] watcher exited" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.
- `grep -c "On any non-zero CLI exit, apply \*\*Error handling\*\* below" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.

## §7 `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block — unchanged

Not modified. The block established in [#378](https://github.com/generacy-ai/agency/issues/378) is preserved byte-for-byte.

Verification:
- `diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md) <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md)` MUST return empty output. Any non-empty output means the byte-identical invariant established by #378 has been broken.

## §8 Whole-file grep guardrails

The following greps run against the entire rewritten `watch.md` and are the fastest way to check that the fix landed cleanly. Each maps to a specific spec FR or SC.

- **FR-001** (per-transition suggestions are executable): `grep -c "· suggested: \`/cockpit:" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 2 — at minimum, the two examples in step 2 (§3 above). Additional occurrences (e.g., in the anchor line's illustrative example) are permitted.
- **FR-002** (backtick-wrapped code span): `grep -c "single-backtick inline code span" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.
- **FR-003** (qualified form, verbatim): `grep -c "verbatim as the CLI emits it" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.
- **FR-004** (mapping-table cells match runtime): `grep -c "<ref>" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 7 (see §4).
- **FR-005** (any presentation carries the invocation): implicitly enforced by §5's "Suggestion format" anchor line — a future presentation surface reader lands on this line and sees the requirement.
- **FR-006** (error rows unchanged): the error row in the mapping table (`any error / failed state | (no suggestion)`) is preserved verbatim (see §4).
- **FR-007** (refless non-error rows silenced): §3's emit rule includes the clause "for any non-error row that carries no ref, omit the ` · suggested: …` segment entirely" — grep for `"non-error row that carries no ref"`.

  `grep -c "non-error row that carries no ref" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly 1.

- **Regression guard — bare-verb form is gone**: `grep -c "\`/cockpit:review --gate" packages/claude-plugin-cockpit/commands/watch.md` MUST report 0 (see §4).
- **Regression guard — error-conv preserved**: see §7 diff check.
- **Scope guard — one file changed**: `git diff --stat --name-only develop...HEAD -- packages/claude-plugin-cockpit/` MUST show exactly `packages/claude-plugin-cockpit/commands/watch.md` on a single line.

## §9 Non-goals — what the contract explicitly does NOT constrain

- **The `generacy cockpit watch` CLI output format** — unchanged (spec Out of Scope §1). The plugin consumes whatever the CLI emits; this contract does not name specific NDJSON fields.
- **The exact ref-substring extraction algorithm** — the emit rule says "interpolate the transition line's own ref … verbatim as the CLI emits it," leaving the substring-extraction implementation to whatever the Claude Code harness's Markdown-instruction model does. This is intentional: hardcoding a regex would encode CLI schema knowledge into the playbook, contradicting Decision 2.
- **Click-to-copy or non-Markdown affordances** — out of scope (spec Out of Scope §2). Backtick code spans are the affordance.
- **Sibling command files** (`clarify.md`, `merge.md`, `queue.md`, `review.md`, `status.md`) — untouched (spec Out of Scope §6). Any suggestion-format analog in those files is a separate issue's job.

---

*Contract for /plan on issue [generacy-ai/agency#386](https://github.com/generacy-ai/agency/issues/386)*
