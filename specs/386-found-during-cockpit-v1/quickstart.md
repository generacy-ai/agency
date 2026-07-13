# Quickstart: apply and verify the cockpit watch.md suggestion-interpolation fix

**Feature**: 386-found-during-cockpit-v1
**Audience**: Maintainer applying the fix before opening a PR against `develop`.
**Time**: ~15 minutes (one file edited in three sections + 8 greps + 1 diff check + 1 live smoke test).

This is not a runtime feature and has no install step. What follows is the apply-and-verify sequence.

## Prerequisites

- Local checkout of `generacy-ai/agency` on branch `386-found-during-cockpit-v1`.
- `grep`, `sed`, `diff` available (any POSIX shell).
- For the smoke test only: a Claude Code session with the `@generacy-ai/claude-plugin-cockpit` plugin installed (locally linked from this checkout, or installed from a preview publish), the `generacy` CLI on `$PATH`, an active epic with a running watcher, and `gh` authenticated. The tetrad-development#88 smoke test used `christrudelpw/sniplink`.

## Overview of the change

One file, one PR:

- **`packages/claude-plugin-cockpit/commands/watch.md`** — three edits:
  1. **H1 top prose** — one clause replaced: "suggesting the next `/cockpit:*` verb" → "with the complete next-command invocation (verb + ref)", plus a rationale clause about copy-pasting (contract §2).
  2. **Step 2** — the emit rule rewritten to require verbatim ref interpolation, qualified `owner/repo#N` form, single-backtick code-span wrapping, and explicit omission on refless / error rows. Includes two examples (`/cockpit:merge owner/repo#2` and `/cockpit:review owner/repo#3 --gate implementation-review`) and an explicit "Do NOT" clause locking out cwd/origin comparison, bare-number stripping, and scope resolution (contract §3).
  3. **Verb mapping table** — every "Suggested next command" cell (seven non-error rows) updated to show the interpolated shape with `<ref>` as the placeholder (contract §4).
  4. **NEW anchor line** — one line added immediately after the mapping table, before the `<!-- BEGIN error-conv -->` line, naming the "Suggestion format" convention and tying step 2's emit rule to the mapping table's placeholder (contract §5).

The `<!-- BEGIN error-conv -->` / `<!-- END error-conv -->` block is **NOT** touched — see `contracts/watch-command.contract.md §7`.
Step 1, Step 3, and Step 4 are **NOT** touched — see `contracts/watch-command.contract.md §6`.

## Apply the fix

The canonical string content for each section is in `contracts/watch-command.contract.md`. Open that file and the current `packages/claude-plugin-cockpit/commands/watch.md` side by side, then perform the edits below. Suggested order: bottom-up (mapping table + anchor first, then step 2, then top prose), which minimizes line-number churn between edits.

### Edit 1 of 4 — Add the "Suggestion format" anchor line after the mapping table

Insert a blank line after the last mapping-table row (`| any \`error\` / \`failed\` state | (no suggestion) |`), then add the line from `contracts/watch-command.contract.md §5` verbatim, then another blank line before the `<!-- BEGIN error-conv -->` marker. The result should look like:

```markdown
| any `error` / `failed` state | (no suggestion) |

**Suggestion format**: each emitted suggestion is a single-backtick-wrapped `` `/cockpit:<verb> <ref> [flags]` `` where `<ref>` is the qualified `owner/repo#N` from the transition line, verbatim. The mapping-table cells show the same shape with `<ref>` as the placeholder — the emit rule and the table share one format.

<!-- BEGIN error-conv -->
```

### Edit 2 of 4 — Rewrite every "Suggested next command" cell in the mapping table

For each non-error row, replace the bare-verb cell with the `<ref>`-parameterized cell per `contracts/watch-command.contract.md §4`. Concretely:

| Was | Now |
|---|---|
| `` `/cockpit:clarify` `` | `` `/cockpit:clarify <ref>` `` |
| `` `/cockpit:review --gate spec-review` `` | `` `/cockpit:review <ref> --gate spec-review` `` |
| `` `/cockpit:review --gate clarification-review` `` | `` `/cockpit:review <ref> --gate clarification-review` `` |
| `` `/cockpit:review --gate plan-review` `` | `` `/cockpit:review <ref> --gate plan-review` `` |
| `` `/cockpit:review --gate tasks-review` `` | `` `/cockpit:review <ref> --gate tasks-review` `` |
| `` `/cockpit:review --gate implementation-review` `` | `` `/cockpit:review <ref> --gate implementation-review` `` |
| `` `/cockpit:merge` `` | `` `/cockpit:merge <ref>` `` |

The error row (`any error / failed state | (no suggestion)`) is unchanged.

### Edit 3 of 4 — Rewrite step 2's emit rule

Current file, step 2 (`packages/claude-plugin-cockpit/commands/watch.md:12`). Replace the current one-sentence step with the exact block from `contracts/watch-command.contract.md §3`. Key changes:

- **Insert**: `interpolate the transition line's own ref (in its qualified \`owner/repo#N\` form, verbatim as the CLI emits it) into the invocation` after "look up the next verb in the mapping table".
- **Change the print format**: from `` print `<line> · suggested: <verb>` `` to `` print `<line> · suggested: ` followed by the complete invocation wrapped in a single-backtick inline code span — e.g. `` <line> · suggested: `/cockpit:merge owner/repo#2` `` or `` <line> · suggested: `/cockpit:review owner/repo#3 --gate implementation-review` `` ``.
- **Expand the omission clause**: from "for error-state rows, omit the ` · suggested: …` segment" to "For error-state rows, and for any non-error row that carries no ref, omit the ` · suggested: …` segment entirely."
- **Append the "Do NOT" clause**: "Do NOT compare the transition's repo against the session's cwd origin, do NOT strip `owner/repo#` to bare `N` under any condition, and do NOT resolve child vs. epic scope — the transition line's own ref is the ref to interpolate."

Match the block byte-for-byte from `contracts/watch-command.contract.md §3`.

### Edit 4 of 4 — Update the H1 top prose

Current file, first paragraph under `# Watch Command` (around line 6-7). Replace the current sentence:

> Run `generacy cockpit watch <epic-ref>` and, for each transition line, print one notification suggesting the next `/cockpit:*` verb via the mapping below. On watcher exit, report and stop.

with:

> Run `generacy cockpit watch <epic-ref>` and, for each transition line, print one notification with the complete next-command invocation (verb + ref) via the mapping below, so the suggestion can be copy-pasted straight into the prompt without editing. On watcher exit, report and stop.

Match byte-for-byte from `contracts/watch-command.contract.md §2`.

## Verify — local (deterministic) checks

Run each of the following from the repo root and check the expected result. Any failure indicates the edit is incomplete or incorrect.

```bash
# 1. The bare-verb (pre-fix) mapping-table form is entirely gone.
grep -c '`/cockpit:review --gate' packages/claude-plugin-cockpit/commands/watch.md
# Expected: 0

# 2. Every non-error mapping-table row uses the `<ref>` placeholder.
grep -c '<ref>' packages/claude-plugin-cockpit/commands/watch.md
# Expected: >= 7  (7 non-error rows in the mapping table, plus 2 in step 2's clauses, plus 2 in §5's anchor line)

# 3. Step 2's emit rule mandates verbatim interpolation from the CLI's output.
grep -c "verbatim as the CLI emits it" packages/claude-plugin-cockpit/commands/watch.md
# Expected: exactly 1

# 4. Step 2's emit rule names the backtick copy affordance explicitly.
grep -c "single-backtick inline code span" packages/claude-plugin-cockpit/commands/watch.md
# Expected: exactly 1

# 5. Step 2 contains both worked examples (flagless and flagged).
grep -c '· suggested: `/cockpit:merge owner/repo#2`' packages/claude-plugin-cockpit/commands/watch.md
# Expected: >= 1
grep -c '· suggested: `/cockpit:review owner/repo#3 --gate implementation-review`' packages/claude-plugin-cockpit/commands/watch.md
# Expected: >= 1

# 6. Step 2's "Do NOT" clause locks out cwd/origin comparison.
grep -c "Do NOT compare the transition's repo" packages/claude-plugin-cockpit/commands/watch.md
# Expected: exactly 1

# 7. Refless-non-error rows are explicitly silenced.
grep -c "non-error row that carries no ref" packages/claude-plugin-cockpit/commands/watch.md
# Expected: exactly 1

# 8. The new "Suggestion format" anchor line is present.
grep -c '^\*\*Suggestion format\*\*:' packages/claude-plugin-cockpit/commands/watch.md
# Expected: exactly 1
grep -c "the emit rule and the table share one format" packages/claude-plugin-cockpit/commands/watch.md
# Expected: exactly 1

# 9. Error-conv block byte-identical between watch.md and review.md (regression guard from #378).
diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md) \
     <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md)
# Expected: (empty output)

# 10. Only watch.md is modified in this PR — no sibling command files touched.
git diff --stat --name-only develop...HEAD -- packages/claude-plugin-cockpit/
# Expected: packages/claude-plugin-cockpit/commands/watch.md   (single line)
```

If any check fails, re-open the corresponding section of `contracts/watch-command.contract.md` and reconcile against the file.

## Verify — manual smoke tests

Each smoke test below corresponds to one or more success criteria in `spec.md`. Run them in order.

### Smoke test A (US1, SC-001, SC-002, SC-003) — copy-paste executability on a live watch session

Prerequisite: an epic in a test repo with an active watcher and at least one queued child that will produce a non-error transition line within a few seconds. The tetrad-development#88 finding #23 scenario used `christrudelpw/sniplink`.

1. In a Claude Code session with the plugin installed, run:

   ```
   /cockpit:watch <epic-ref>
   ```

2. Wait for a non-error transition line to arrive. Look at the emitted notification. The full line should have the shape:

   ```
   <transition-line-as-emitted-by-CLI> · suggested: `<full-invocation-here>`
   ```

   where `<full-invocation-here>` starts with `/cockpit:` and contains an `owner/repo#N` ref. Verify:

   - The `<full-invocation-here>` region is rendered as an inline monospace code span in the chat surface (SC-002).
   - The ref inside is qualified `owner/repo#N`, not bare `N` (SC-003).

3. Select the code-span text (double-click on most chat surfaces, or drag-select), copy, and paste it into the same Claude Code session's prompt. The CLI MUST accept the invocation and dispatch it without any editing on your part (SC-001).

4. Let the watch session continue. Verify that as more transition lines arrive, each non-error, ref-carrying line has the same code-span-wrapped, qualified-ref-carrying suggestion shape.

**Pass criterion**: at least one full-line copy-paste of a suggestion executes without editing; every non-error, ref-carrying line's suggestion is code-span-wrapped and qualified-ref-carrying.

### Smoke test B (SC-004) — refless / error-row omission

Prerequisite: the same watch session as smoke test A.

1. Scroll through the session's transitions. If any line arrives with no ref (e.g., a `watcher started` banner or a schema anomaly), verify the line renders without the ` · suggested: …` segment.

2. If an error-state row arrives (e.g., a `waiting-for:*` gate that fails, or the CLI emits an `error` marker), verify the line renders without the ` · suggested: …` segment. This is unchanged behavior from today; the check confirms the fix does not accidentally start emitting suggestions for error rows.

3. If neither case naturally arises in the smoke session, rely on the grep checks in the local-verify section (specifically greps 6 and 7, which enforce the emit rule's omission clauses at the source).

**Pass criterion**: no refless or error transition line renders a ` · suggested: …` segment.

### Optional smoke test — AUTH_FAILURE parity

To confirm the error-conv block is untouched and the emit-rule changes do not leak into the error path:

1. Export `GH_TOKEN=""` (or otherwise invalidate the `gh` credential) before running `/cockpit:watch <epic-ref>`.

2. The CLI will fail at start-up with an auth error. The error-conv block's `AUTH_FAILURE` branch fires and prints exactly the block's canonical message:

   ```
   Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.
   ```

**Pass criterion**: the AUTH_FAILURE text matches `packages/claude-plugin-cockpit/README.md § Error Handling` verbatim; the byte-identical `<!-- BEGIN error-conv -->` block is confirmed intact.

## Troubleshooting

**Q: A suggestion arrives with `owner/repo#N` but the ref inside doesn't match what the transition line says.**
A: The emit rule requires "verbatim" interpolation from the transition line — no lookup, no substitution. If the emitted ref doesn't match the transition line, the fix is incomplete: the playbook is doing some form of re-shaping (which contract §3's "Do NOT" clause explicitly forbids). Re-read step 2 against contract §3 and remove any implicit re-shaping.

**Q: The chat surface shows the suggestion in bold or italics instead of monospace.**
A: Verify the emit rule uses single backticks (not asterisks, not underscores, not fenced blocks). The contract §3 example is `` <line> · suggested: `/cockpit:merge owner/repo#2` `` — one backtick before `/cockpit:`, one backtick after the ref (or the last flag). Any other wrapping renders differently.

**Q: A transition line's ref appears as bare `N` even though the CLI is on a version that emits qualified refs.**
A: Check whether step 2 is stripping `owner/repo#` from the interpolated ref. It should not. Contract §3's "Do NOT" clause explicitly forbids this ("do NOT strip `owner/repo#` to bare `N` under any condition"). If the playbook is stripping, remove the stripping logic.

**Q: I want to also fix suggestion formatting in `status.md` or `queue.md` while I'm here.**
A: No. Those are Out of Scope §6 for this PR — their output contracts are different and adopting the same emit rule there needs its own scoping. File a follow-up issue.

**Q: The verb mapping table now looks noisy with `<ref>` in every row — can I move the placeholder up to the top of the table?**
A: No. The mapping table's semantic is "one row per transition-type, showing what the runtime emits for that type." Moving `<ref>` up-and-out would decouple the doc from the runtime shape (a maintainer reading a single row would no longer see the full invocation). If the visual noise is a concern, tune the table cell formatting in a follow-up — but keep the `<ref>` placeholder per-row.

**Q: I want to add the block/rule to `clarify.md` too — should I include that here?**
A: No. `clarify.md`'s output contract is per-question, not per-transition; the same emit rule does not directly apply. Adopting analogous fixes there is a separate issue.

## After this PR merges

- The plugin republishes on next preview cycle; no manual publish step is needed.
- Watch for another live smoke test on `christrudelpw/sniplink` (or a comparable epic with an active watcher) via the tetrad-development#88 cadence.
- If the code-span rendering proves inconvenient in a specific chat surface (e.g., a viewer that strips inline code spans), tune the affordance in a follow-up PR — but keep the interpolation of the qualified ref, which is this fix's load-bearing behavior.

---

*Quickstart for /plan on issue [generacy-ai/agency#386](https://github.com/generacy-ai/agency/issues/386)*
