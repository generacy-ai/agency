# Phase 0 Research: Interpolate the issue ref into every watch-playbook suggestion so it is a one-keystroke handoff

**Feature**: 386-found-during-cockpit-v1
**Status**: Complete
**Scope**: This is a prompt-copy fix in one Markdown file (`packages/claude-plugin-cockpit/commands/watch.md`). Research is scoped to (a) which ref form the playbook emits and why the choice is uniform, (b) which ref the playbook interpolates when a transition line arrives, (c) what copy-affordance the emitted suggestion uses, (d) how the playbook handles refless-non-error and error transition lines, (e) how the verb mapping table's doc-runtime consistency is maintained in the same edit, and (f) why the playbook does NOT gain table-rendering machinery even though the spec's original US2 named an initial-state table.

## Decision 1 — Suggestions always emit the qualified `owner/repo#N` form, uniformly, with no cwd/origin comparison

**Decision**: Step 2's emit rule interpolates the transition line's ref in its qualified `owner/repo#N` form on every non-error, ref-carrying transition line. The playbook does not detect the session's cwd, does not read `git config --get remote.origin.url`, and does not compare the transition's repo against any local git remote. The same qualified form is emitted regardless of where the operator's shell is rooted.

**Rationale**:
- **Why qualified everywhere works**: the `generacy` CLI accepts the qualified `owner/repo#N` form for `<epic-ref>` / `<child-ref>` arguments in every session cwd per [generacy#822](https://github.com/generacy-ai/generacy/issues/822) and [generacy#850](https://github.com/generacy-ai/generacy/issues/850). The suggestion `/cockpit:merge owner/repo#2` is executable from a checkout of `owner/repo`, from a checkout of a sibling repo, or from a session with no checkout at all — the CLI does the ref resolution downstream. The playbook does not need to know the operator's cwd to emit an executable suggestion.
- **Why the bare-number optimization is the wrong trade for this issue**: the bare-number form (`/cockpit:merge 2`) saves the operator ~15 characters of typing when the cwd matches the transition's repo. But this issue's entire point is copy-paste executability, not typing efficiency — and when you copy-paste, length is free. Optimizing for typing at the cost of copy-paste executability inverts the fix's own priority.
- **Why cwd/origin comparison is machinery the playbook should not have**: detecting "does the transition's repo match the session's cwd origin" requires (a) parsing the qualified ref out of each transition line (the playbook currently does not parse per-line metadata), (b) reading `git config --get remote.origin.url` from the session's cwd (adding a Bash sub-invocation on every notification), (c) normalizing both forms to a comparable canonical (SSH vs HTTPS, trailing `.git`, case), and (d) branching per-line. That is a lot of Markdown-encoded logic added to a playbook whose current design is a thin per-line pass-through. Q2's answer states this directly: option C "dissolves the question: no repo detection, no origin comparison, no logic in markdown."
- **Why the qualified form does not confuse operators**: an operator watching an epic with mixed-repo children (e.g., `owner/repo-a#2` and `owner/repo-b#3` transitions in the same stream) needs the qualified ref to disambiguate. The qualified form makes the emitted suggestion self-describing — the reader can tell at a glance which repo the suggestion targets without cross-referencing the transition line's prefix.

**Alternatives considered**:
- **Option A (Q2 alternative): playbook parses `owner/repo#N` from the transition line, then reads `git config` on the session's cwd and emits bare `N` when they match**. Rejected — see rationale above. Adds significant Markdown-encoded logic for a typing-efficiency win that doesn't matter on copy-paste; introduces per-notification `Bash` sub-invocations to read `git config`.
- **Option B (Q2 alternative): CLI does the resolution — emits either bare or qualified form per its own cwd/context**. Rejected — FR-003 becomes a CLI contract, not a plugin rule. The CLI's stdout already emits the qualified form on every transition line; a re-shape at the CLI would require CLI edits (out of scope §6, and orthogonal to the copy-paste fix). Trusting whatever the CLI provides verbatim (which is what the plugin now does under Decision 2) is strictly a subset of this alternative — the plugin does not add its own re-shaping.
- **Emit both forms**: rejected as noise. Two suggestions per line doubles the visual weight of the notification and forces the operator to pick between two copy candidates. The point of the fix is fewer decisions per keystroke, not more.

**References**:
- Qualified-ref executability: [generacy#822](https://github.com/generacy-ai/generacy/issues/822), [generacy#850](https://github.com/generacy-ai/generacy/issues/850).
- Live UX gap reproduction: [generacy-ai/tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) finding #23.
- Spec FR-003, Assumptions §1; Clarifications Q2 (2026-07-08).

## Decision 2 — Interpolate the transition line's own ref verbatim; no scope resolution (child vs. epic)

**Decision**: The playbook interpolates the ref that the transition line itself names, exactly as it appears in the CLI's stdout. No scope-awareness (child vs. epic), no substitution, no lookup — the ref character range is copied byte-for-byte into the suggestion string.

**Rationale**:
- **Why verbatim interpolation is correct by construction**: every actionable transition emitted by `generacy cockpit watch` is child-scoped. The NDJSON transition-line schema uses `repo` + `number` fields to identify the subject of the transition, and that subject is always a child issue (a spec/impl issue), never the epic itself. There is no epic-level rollup PR in this design; `/cockpit:merge` on a `completed:validate` line is a merge of the child whose validate step just completed. So "the transition line's own ref" and "the correct target ref for the suggestion" are the same value, and the playbook needs no scope-awareness.
- **Why a scope-aware branch would decay**: an "if this row is a gate transition then use the child ref, if it's a merge-readiness row then use the epic ref" branch encodes CLI-side knowledge (which transitions are per-child, which are per-epic) into the playbook. Any change to the CLI's transition semantics would silently invalidate the branch, causing the plugin to interpolate the wrong ref. The verbatim-copy rule is drift-immune by construction — whatever ref the CLI names is the ref the plugin emits.
- **Why "verbatim" is enough**: verbatim means the ref character range from the transition line, in exactly the form the CLI wrote it. The playbook does not lowercase, does not strip trailing punctuation, does not re-quote — the ref goes into the suggestion string as-emitted. Combined with Decision 1's qualified-form uniformity (which is a property of the CLI's output, not the plugin), this makes the suggestion string a mechanical transformation of the transition line, with no per-line branching.
- **Why the playbook does not need to know whether a transition is child- or epic-scoped**: even if a future schema change introduced an epic-scoped transition (which is not currently possible), the CLI would still name the correct ref on the transition line, and the verbatim-copy rule would still work. The rule is invariant under the CLI's scope semantics.

**Alternatives considered**:
- **Option A (Q3 alternative): Playbook branches on transition type — gates use child ref, `/cockpit:merge` uses child ref**. Rejected — see rationale. Encodes CLI-side knowledge; equal to option C in practice but requires more Markdown-encoded logic.
- **Option B (Q3 alternative): Playbook branches — gates use child ref, `/cockpit:merge` uses epic ref**. Rejected — factually wrong for this design (there is no epic-level rollup PR); would emit a non-executable suggestion for merge-readiness rows.
- **Playbook resolves the epic ref from the transition line's context and emits epic-scoped suggestions for merge**: rejected — same argument as B, plus requires the playbook to track running state across transition lines.

**References**:
- Transition-line NDJSON schema: `packages/orchestrator/src/services/cockpit-watch-emitter.ts` (in the `generacy` repo; not modified by this feature).
- Spec FR-001, FR-003, FR-005, Assumptions §3; Clarifications Q3 (2026-07-08).

## Decision 3 — Wrap every emitted suggestion in a single-backtick inline code span

**Decision**: Every emitted `· suggested: …` segment MUST wrap the invocation in one pair of single backticks. The emitted line shape is `<transition-line> · suggested: \`<invocation>\`` where `<invocation>` is the complete `/cockpit:<verb> <ref> [flags]` string. Triple-backtick fenced blocks are forbidden; no bold, italic, blockquote, or link-syntax rendering is used.

**Rationale**:
- **Why single backticks specifically**: Claude Code's chat surface renders single-backtick-wrapped Markdown as an inline monospace code span. Monospace signals copyability to human readers (it visually distinguishes text meant to be typed/pasted verbatim from surrounding prose), and — while there is no true click-to-copy in the playbook's chat surface — most Claude Code viewers offer double-click-to-select on code spans, giving a two-click copy path (vs. drag-select on prose). Q1 and spec Assumptions §2 both name backticks as "the strongest copy affordance available inside `/cockpit:*` command output."
- **Why triple-backtick fenced blocks are wrong here**: fenced code blocks are block-level; they cannot appear inline within a line like `<transition-line> · suggested: …`. Attempting to use them would either (a) break the line-per-transition contract by moving the suggestion to a new line, adding visual weight and disrupting the streaming cadence, or (b) confuse Markdown parsers about where the block begins/ends. The playbook's contract is one line emitted per CLI stdout line; inline code spans respect that.
- **Why not bold or italic**: bold text (`**...**`) is a strong emphasis affordance, not a copyability affordance. Bold-wrapped text does not render as monospace, so the operator has no visual cue that the string should be pasted verbatim. Italic is even weaker — it's typically used for prose emphasis or citations.
- **Why not a link**: link syntax (`[text](url)`) would render as a clickable link, but the target is not a URL — it's a slash-command invocation. Rendering it as a link would introduce a "click to nowhere" affordance that either fails silently or navigates the user away from the chat surface.
- **Why not skip the affordance and rely on the leading `/`**: some chat surfaces auto-detect `/`-prefixed strings as slash-command hints, but this is UI-specific and unreliable. Explicit backticks compose across all Markdown renderers and match the plugin's existing convention (the file already wraps `command -v generacy` and `export PATH=…` snippets in single backticks).
- **Why the rule applies to any presentation of the suggestion, not just the streamed line (FR-005)**: if a future playbook edit adds an improvised summary or table of transitions (which Out of Scope §3 discourages but does not structurally forbid), the same copy-affordance rule applies. The rule is stated once as "wrap every suggestion in single backticks" so no future edit can accidentally re-introduce the pre-fix bare-verb form in a new rendering surface.

**Alternatives considered**:
- **Wrap only the ref, not the whole invocation**: `` /cockpit:merge `owner/repo#2` ``. Rejected — the operator would have to select the ref, remember the verb, and type both. The whole invocation is the copy unit; wrapping just the ref forces manual re-assembly, which is the bug being fixed in miniature.
- **Bold or italic**: rejected — no copyability affordance; see rationale.
- **Fenced block**: rejected — block-level, breaks the inline line shape; see rationale.
- **No wrapping, rely on the reader's slash-command auto-detect**: rejected — UI-specific and inconsistent; the explicit affordance is cheap.

**References**:
- Chat-surface Markdown rendering: Claude Code renders single backticks as inline monospace consistently across the CLI, IDE extensions, and web app.
- Spec FR-002, Assumptions §2; Clarifications Q1 (2026-07-08, batch 1) — the "table does not exist" observation implicitly reinforces that backticks are the affordance carrier in the line-emit surface.

## Decision 4 — Refless non-error transition lines omit the `· suggested: …` segment, mirroring error-row behavior

**Decision**: If a non-error transition line arrives without a ref, the playbook emits the line as-is (without appending ` · suggested: …`). This mirrors the existing behavior for error rows (unchanged from today per FR-006). No warn, no log, no verb-only fallback.

**Rationale**:
- **Why omit rather than fall back to a verb-only suggestion**: a verb-only suggestion (`· suggested: \`/cockpit:merge\``) is exactly the non-executable output this issue exists to eliminate. Emitting one on a refless line would reintroduce the bug in miniature — the operator would copy the suggestion, paste it, and find it doesn't work because the ref is missing. Silent omission preserves the "every emitted suggestion is executable" invariant (SC-001) at the cost of one fewer notification per refless line, which is the right trade.
- **Why not warn**: the NDJSON transition-line schema emitted by `generacy cockpit watch` guarantees a ref on every actionable transition (Assumptions §3). A refless line is therefore a schema anomaly — either a transient CLI bug or a line-type that isn't actionable (e.g., a `watcher started` banner). Warning on every anomaly would (a) generate noise for lines that are structurally not actionable (banners aren't a bug), (b) require the playbook to introspect which line-types "should" carry a ref, and (c) provide no operator-facing recourse — there's nothing the operator can do about a missing ref except read the transition line and act on it manually, which they'd do anyway. Q5's answer names this: "the NDJSON schema guarantees refs on transition lines, so a refless line is already a schema anomaly that degrades most gracefully in silence."
- **Why not fall back to pre-#386 behavior (option B in Q5)**: option B preserves the verb-only shape "for edge cases," which is precisely the shape this issue exists to eliminate. Preserving it "for edge cases" mostly reintroduces the bug for those edge cases, and edge cases are exactly where the operator is most likely to fumble.
- **Why the mirror to error-row behavior is the right structural fit**: error rows already omit the suggestion segment; refless non-error rows are structurally similar (no actionable target). Using the same rule for both simplifies the emit-rule statement ("if there's no ref, no suggestion") and makes the file's behavior easier to read.

**Alternatives considered**:
- **Option B (Q5): verb-only fallback preserving pre-#386 behavior**. Rejected — see rationale. Bug in miniature.
- **Option C (Q5): treat as CLI contract violation, log/warn**. Rejected — see rationale. Adds noise, no operator recourse, requires line-type introspection.
- **Skip the transition line entirely (don't even print it)**: rejected — the transition line itself is still information; only the ` · suggested: …` segment is silenced.

**References**:
- Spec FR-006, FR-007; Clarifications Q5 (2026-07-08).

## Decision 5 — Update the verb mapping table's "Suggested next command" column in the same edit; use `<ref>` as the placeholder

**Decision**: Every row of the verb mapping table (seven rows: six `waiting-for:*` gates plus `completed:validate`/`/cockpit:merge`) has its "Suggested next command" cell updated to show the full interpolated invocation shape with `<ref>` as the placeholder. The pre-fix bare-verb form (e.g., `/cockpit:clarify`, `/cockpit:review --gate spec-review`) is entirely replaced (`/cockpit:clarify <ref>`, `/cockpit:review <ref> --gate spec-review`). The error-row cell continues to say `(no suggestion)`.

**Rationale**:
- **Why update the table in the same edit as the runtime emit rule**: the mapping table is the reader's mental model of what the playbook does. If step 2 emits `/cockpit:review owner/repo#3 --gate spec-review` at runtime but the table shows `/cockpit:review --gate spec-review`, a maintainer reading the table will hold the wrong model. The staler doc "wins" in the reader's head, and a future PR might "correct" the runtime to match the (stale) doc — reintroducing the bug. Table-runtime consistency is enforced by editing them together and by the grep test `grep -c "/cockpit:review --gate"` MUST return 0 (Testing §5).
- **Why the placeholder is `<ref>` (Q4 option A), not `<child-ref>` (B) or `N` (C)**: `<ref>` is short, matches the spec's own text (`the transition line's own qualified ref`), and does not lock the doc into a scope (child vs. epic) that Decision 2 explicitly says the playbook doesn't reason about. `<child-ref>` would (a) assume Q3 option A's scope answer, which was rejected in favor of C's "verbatim, no scope-awareness," and (b) introduce a placeholder token that appears nowhere else in the file. `N` is the bare-number form, which Decision 1 rejected as the emit shape; using it in the doc would contradict the emit rule.
- **Why the doc placeholder matters even though the runtime interpolates a real ref**: the doc is what the maintainer reads first. If the doc's placeholder implies bare-number (`N`), the maintainer might mistakenly assume the runtime emits bare-number. If it implies scope-awareness (`<child-ref>`), they might assume the plugin resolves scope. `<ref>` — one placeholder, one meaning, matching the emit rule — leaves no room for that confusion.
- **Why every row uses the placeholder, not just the gates**: consistency. If gates show `/cockpit:review <ref> --gate spec-review` and merge shows `/cockpit:merge` (bare), a reader might infer that merge doesn't take a ref. The runtime interpolates the ref for merge too (Decision 2's verbatim rule applies), so the table should show `/cockpit:merge <ref>` to match.
- **Why the error row stays `(no suggestion)`**: unchanged from FR-006. The error row's semantics are "no suggestion is emitted," which is not a placeholder or an invocation — it's a null. The row communicates that fact directly.

**Alternatives considered**:
- **Option B (Q4): `<child-ref>` placeholder**. Rejected — see rationale. Encodes a scope assumption the playbook doesn't make.
- **Option C (Q4): `N` placeholder (bare-number)**. Rejected — see rationale. Contradicts Decision 1's qualified-form rule.
- **Leave the table alone, add a new "runtime output" example above it**: rejected — introduces two mental models (the table's doc-view and the example's runtime-view) that the reader has to reconcile. One table, one model, one placeholder.
- **Remove the table entirely and put the mapping in prose**: rejected — the table is the file's readable summary; removing it would push the mapping into step 2's prose, making step 2 longer and harder to skim.

**References**:
- Current verb mapping table: `packages/claude-plugin-cockpit/commands/watch.md` (the `| waiting-for:… | /cockpit:… |` table).
- Spec FR-004; Clarifications Q4 (2026-07-08).

## Decision 6 — The playbook does NOT gain table-rendering machinery; FR-005 is a forward-looking constraint on any future improvisation

**Decision**: This feature does not add code to `watch.md` that fetches initial state or renders a table. The spec's original US2 named an "initial-state table," but Q1's investigation confirmed that no such table exists in the playbook today — it was one Claude session's ad-hoc presentation of the initial transition lines, not a playbook artifact. Spec FR-005 generalizes the emit rule ("any presentation of a suggestion carries the complete executable invocation") as a forward-looking constraint, but does NOT mandate that the playbook produce a table.

**Rationale**:
- **Why the initial-state table was misidentified**: the tetrad-development#88 smoke-test session did present what looked like an initial-state summary before the streaming lines started. That summary was Claude's own improvisation, generated from the first few transition lines the CLI emitted — not a section rendered from a template. The spec's US2 mistook that improvisation for a playbook feature; Q1's answer corrects the premise ("the 'initial-state table' does not exist in watch.md; it was one session's ad-hoc presentation of the #839 initial lines, and the issue text (mine) mistook it for a playbook artifact").
- **Why adding table-rendering would over-scope the fix**: producing an initial-state table would require the playbook to (a) call `generacy cockpit status <epic-ref>` or a similar sub-command to fetch initial state, (b) format the state as a table (children, current state per child, suggested next verb per child), (c) emit it before the streaming loop starts. That is a substantial addition — new sub-invocation, new formatting logic, new latency at command start — for a feature the operator didn't ask for and the spec's real defect (per-line ref interpolation) doesn't require. Q1 option C ("extend watch.md to fetch initial state") was rejected for this reason.
- **Why FR-005 is a forward-looking safety net rather than a mandate**: initial lines from the CLI are ordinary transition lines. The per-line emit rule (FR-001, FR-002, FR-003) covers them with zero extra machinery. FR-005 exists so that if a future edit does add a table or summary (against the current Out of Scope §3 recommendation, or for a different feature entirely), the emit rule extends automatically — the future author will read the file and see that every suggestion carries the complete invocation.
- **Why "no table machinery" is a plan-level constraint, not just a spec Out of Scope note**: without stating the constraint at plan level, a maintainer reading the plan might infer from FR-005 that some form of table rendering is expected. The plan's Constraints section names it explicitly ("No table-rendering machinery added") so the intent survives future PR reviews.

**Alternatives considered**:
- **Option A (Q1): the table exists — point to where**. Rejected — investigation confirmed the table doesn't exist. This is a factual correction, not a preference.
- **Option C (Q1): produce the table in-scope for #386**. Rejected — see rationale. Over-scopes the fix; the per-line rule already covers initial lines.

**References**:
- Ad-hoc initial-state presentation: [generacy-ai/tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) finding #23 — the smoke-test session log shows the initial-state summary was model-generated prose above the streaming lines, not template output.
- Spec FR-005, Assumptions §4, Out of Scope §3; Clarifications Q1 (2026-07-08, batch 2).

## Cross-cutting notes

- **Coupling between decisions**: Decision 5's `<ref>` placeholder is coupled to Decision 1's qualified-form rule and Decision 2's verbatim-interpolation rule — the placeholder's meaning ("the transition line's own qualified ref") is the composition of both. If either underlying rule changed, the placeholder in the table would need to change too.
- **What is NOT researched here (out of scope)**: (i) changes to the `generacy cockpit watch` NDJSON schema (spec Out of Scope §1); (ii) click-to-copy affordances beyond backtick code spans (Out of Scope §2); (iii) table-rendering machinery in the playbook (Out of Scope §3 and Decision 6); (iv) bare-number rendering, cwd/origin detection, or repo-detection logic in the playbook (Out of Scope §4, Decisions 1–2); (v) suggestion-format fixes in sibling cockpit commands like `status.md`, `queue.md` (Out of Scope §6); (vi) CLI-side changes to ref-resolution rules ([generacy#822](https://github.com/generacy-ai/generacy/issues/822), [#850](https://github.com/generacy-ai/generacy/issues/850)) (Out of Scope §7).
- **Preserved from prior fixes**: the byte-identical `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block established by [#378](https://github.com/generacy-ai/agency/issues/378); the inline-verbatim convention ([#380](https://github.com/generacy-ai/agency/issues/380), [#382](https://github.com/generacy-ai/agency/issues/382), [#384](https://github.com/generacy-ai/agency/issues/384)) — no shared "suggestion emit helper" or partial include is introduced; the per-line playbook contract — one CLI stdout line consumed, one notification emitted, no buffering or look-ahead.

---

*Generated by /plan for issue [generacy-ai/agency#386](https://github.com/generacy-ai/agency/issues/386)*
