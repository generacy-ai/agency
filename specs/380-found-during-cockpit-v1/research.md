# Phase 0 Research: `/cockpit:queue` two-argument alignment

**Feature**: 380-found-during-cockpit-v1
**Status**: Complete
**Scope**: This is a prompt-copy fix in a single Markdown file. Research is scoped to (a) the flag / gate policy that avoids double-prompting under Claude Code's non-interactive Bash tool, (b) why the confirm wording states the *action* rather than the argv, (c) why `epic-ref` remains opaque to the plugin, (d) why the six sibling cockpit commands are deliberately not co-fixed, and (e) why the shared error-handling blocks stay untouched.

## Decision 1 — Plugin's `AskUserQuestion` is the sole gate; CLI is invoked with `--yes`

**Decision**: Step 4's Bash invocation is `generacy cockpit queue <epic-ref> <phase> --yes`. Step 2's `AskUserQuestion` remains as the sole user-facing confirm; the CLI's own stdin confirm is suppressed.

**Rationale**:
- The plugin runs the CLI through Claude Code's Bash tool, which is non-interactive and has no TTY. In that environment, the CLI's stdin confirm cannot receive input — it would either block waiting on a stdin that never arrives or read EOF and treat that as an abort. In either case option B (CLI-sole-gate) is unworkable.
- `--yes` exists in the CLI (`packages/generacy/src/cli/commands/cockpit/queue.ts:482 — .addOption(new Option('--yes', 'Skip the interactive confirmation prompt.'))`) precisely for programmatic callers that provide their own gate. The plugin is exactly that caller. Using the flag as-intended is preferable to closing stdin or piping `yes` into the process.
- The CLI's own confirm remains correct for humans invoking `generacy cockpit queue` directly in a terminal. This fix does not affect that path.

**Alternatives considered**:
- **Option B — CLI is the sole gate (drop `--yes`, drop `AskUserQuestion`)**: unworkable under Claude Code's Bash tool per above. Would leave the plugin with only the tokenization gate (FR-002) and no per-invocation confirm; the user's `/cockpit:queue 1 P1` would silently proceed to the CLI, which would then hang or abort on missing TTY.
- **Both prompts fire (double-prompt)**: worst UX outcome — the user confirms once in the plugin's `AskUserQuestion`, then the CLI opens a second confirm they cannot answer (no TTY), which hangs the Bash call. Explicitly rejected by clarification Q1.
- **Introduce a `--dry-run` mode on the CLI so the plugin can show a resolved preview before confirming**: a genuine improvement to the confirmation ergonomics, but it requires a CLI change (Out of Scope §1) and does not address the double-prompt question. Left as a future generacy-side enhancement.

**References**:
- Clarifications Q1 (2026-07-07).
- CLI verb: `packages/generacy/src/cli/commands/cockpit/queue.ts:482`.
- Spec FR-008.

## Decision 2 — Confirm wording states the *action*, not the argv

**Decision**: The `AskUserQuestion` question is ``Assign phase `<phase>`'s issues of `<epic-ref>` to the cluster account and add label `process:speckit-feature`?`` with both tokens interpolated. The prior wording (``Run `generacy cockpit queue <phase>`?`` — an argv echo) is discarded.

**Rationale**:
- With `--yes` (Decision 1) the CLI's own resolved preview is suppressed. The CLI's normal flow prints "will assign these three specific issues" *after* resolving the phase; with `--yes`, that preview never reaches the user. If the plugin's confirm merely echoed the argv, the user would be confirming a string, not an action.
- Naming the effects (assign + label) gives the user enough to say "no, that's the wrong epic" or "no, wrong phase" without cross-referencing docs. FR-003 codifies this.
- Wording is scoped to the effects that are *guaranteed* by the CLI verb's behavior. It does not claim to know *which* three issues (that requires resolution the plugin cannot do without the CLI).

**Alternatives considered**:
- **Echo-only wording** (``Run `generacy cockpit queue <epic-ref> <phase>`?``): simplest to write, but confirms a string rather than a consequence, and is misleading because with `--yes` the CLI will not stop for review. Rejected.
- **Full-resolution preview inside the plugin** (list the three issue numbers before asking): requires the plugin to duplicate CLI phase-resolution logic (querying manifest, filtering by tier/name, matching eligibility). Bigger blast radius than a text fix warrants; also creates a second drift site. Out of Scope §1 spirit. Rejected.
- **Ask two questions** (one for epic-ref confirmation, one for phase): doubles the prompt count for no gain — both tokens are already user-typed in the invocation and are echoed back in the single question. Rejected.

**References**:
- Clarifications Q1 (wording rationale).
- Spec FR-003.

## Decision 3 — `epic-ref` is opaque; the plugin does not parse it

**Decision**: The plugin captures `<epic-ref>` byte-for-byte from the user's input and passes it to the CLI unchanged. It does not distinguish bare numbers (`1`), `owner/repo#N` refs (`christrudelpw/sniplink#1`), or full URLs (`https://github.com/christrudelpw/sniplink/issues/1`). All three are the CLI's job to resolve.

**Rationale**:
- The CLI already resolves the three ref forms per [generacy#822](https://github.com/generacy-ai/generacy/issues/822). Duplicating that logic in the plugin would create a second source of truth for ref resolution, guaranteeing drift when the CLI adds a fourth form or changes bare-number semantics.
- Opacity mirrors the pattern the existing `queue.md` already uses for `<phase>` (line 24: *"capture it as `<phase>` byte-for-byte. Do NOT validate, parse, normalize, lowercase, expand, or strip inner punctuation."*). Applying the same rule to `<epic-ref>` keeps the two arguments symmetric.
- Any parsing the plugin did would need to know the current working directory's default repo, the user's `gh` config, etc. — state the CLI is already set up to consult. The plugin has no business duplicating that.

**Alternatives considered**:
- **Plugin-side normalization to `owner/repo#N`**: would require reading `git remote`, calling `gh api`, etc. All state the CLI already accesses. Rejected as a second drift site.
- **Plugin-side rejection of bare numbers when no repo context is discernible**: would front-load an error that the CLI already handles clearly. Adds no value and creates a divergence risk. Rejected.

**References**:
- Spec FR-001, FR-002.
- Spec Assumption §3.
- Existing `commands/queue.md:24` (byte-for-byte capture pattern for `<phase>`, extended here to `<epic-ref>`).

## Decision 4 — Only `queue.md` changes; sibling cockpit commands are out of scope

**Decision**: The fix touches only `packages/claude-plugin-cockpit/commands/queue.md`. `/cockpit:next`, `/cockpit:status`, `/cockpit:merge`, `/cockpit:review`, `/cockpit:watch`, `/cockpit:clarify` are not part of this change.

**Rationale**:
- Each sibling command wraps a distinct CLI verb with its own argument shape. Some may have analogous arg-count mismatches; others may be fine. Bundling all of them into one fix would (a) enlarge the review surface, (b) defer per-command clarification that hasn't been done, and (c) risk regressing commands that are currently correct.
- The upstream smoke test ([tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) finding #6) surfaced *only* the `/cockpit:queue` case. Bundling a preemptive audit of the other five is speculative work; each should have its own issue and its own smoke-test data point before rewriting.
- Spec Out of Scope §3 explicitly excludes the sibling commands.

**Alternatives considered**:
- **Audit and fix all six commands in one PR**: rejected — speculative, and no clarification has been done for the others. If a sibling turns out to need a similar fix, it belongs in its own numbered issue with its own spec and clarifications.
- **Add a shared "argument contract" helper referenced by all six commands**: a build-step-shaped refactor the plugin deliberately avoids (see [#378](https://github.com/generacy-ai/agency/issues/378) plan Decision 1 — inline-verbatim convention). Rejected as premature.

**References**:
- Spec Out of Scope §3.
- [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) finding #6.
- [#378](https://github.com/generacy-ai/agency/issues/378) plan Decision 1 (inline-verbatim convention).

## Decision 5 — MISSING_BINARY / AUTH_FAILURE / OTHER blocks stay byte-identical

**Decision**: The rewrite does not touch the `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block, the `Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling` marker, or the three error-class list items inside them.

**Rationale**:
- [#378](https://github.com/generacy-ai/agency/issues/378) established a byte-identical invariant for the MISSING_BINARY payload across seven files (README + six `commands/*.md`). Editing that block in `queue.md` — even to change surrounding context — risks introducing drift that #378's grep check catches only after the fact.
- The failure classes and their remedies are independent of the two-argument contract change. The classes fire on CLI exit code and stderr regex, both of which are unaffected by whether the CLI took one arg or two.
- FR-007 codifies this constraint. Spec Out of Scope §5 reinforces it.

**Alternatives considered**:
- **Refresh the error block "while we're in there"**: rejected. Any edit — even whitespace — inside the byte-identical zone can cascade into a drift-check failure and would require re-running the seven-file sweep from [#378](https://github.com/generacy-ai/agency/issues/378).
- **Move the error block above the invocation for readability**: rejected — restructuring the file is out of scope and would not help the reader (the block is already at the natural narrative position, immediately after step 4's invocation).

**References**:
- Spec FR-007, Out of Scope §5.
- [#378](https://github.com/generacy-ai/agency/issues/378) plan Decision 4 (byte-identical text scope).
- Existing `commands/queue.md:37-43` (the untouched block).
