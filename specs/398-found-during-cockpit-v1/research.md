# Research: #398 — Fix D.5 `<pr-ref>` drift and add invocation-vs-`--help` drift audit

Phase 0 restatement of the Q1–Q5 decisions from [clarifications.md](./clarifications.md) as design decisions with alternatives-rejected and rationale. Each decision is anchored in a directly-observed T-S6 constraint or a directly-observed pre-existing surface-drift; none is aesthetic.

## Framing: what shape of fix is this?

The observed failure is a **CLI-contract drift**, not a mechanism gap or a classification gap:

- The auto session **received** the `completed:validate` + green event and correctly classified it as D.5 (mechanism + classification worked).
- The parent followed the D.5 playbook prose **literally verbatim**: it saw `generacy cockpit merge <pr-ref>` and substituted a PR reference for `<pr-ref>` — that IS what the prose said.
- The CLI's actual contract per `--help` is an **issue** reference, not a PR reference. `generacy cockpit merge` resolves its input as an issue number.
- GitHub's shared issue/PR number space made the wrong invocation *succeed at parse time* — "issue 21" existed (it *is* PR #21), but the resolver linked to an unrelated draft (PR #25), so the CLI came back with a plausible `red / missing-label` verdict for the wrong PR.
- The session burned a full diagnosis round chasing the phantom red verdict before it re-read `--help` and realized the playbook was wrong.

No mechanism gap (the CLI was invoked; a response came back). No classification gap (D.5 was the correct dispatch class). The gap is at the *invocation* surface — the playbook's argument-kind token drifted away from the CLI's `--help` usage-string token, and the session followed the playbook to a plausible-looking confusing failure.

The fix has the same shape as #384/#388/#390/#394/#396 (instruction-drift class): pin the rule at the surface where the drift occurred (correct D.5's token to match `--help`), add a completeness-hygiene backstop the model cannot silently regress (an audit that compares every playbook invocation against the CLI's `--help` contract, with a checked-in regression fixture).

## R1 — `--help` snapshot source: checked-in fixture files with a repo-local refresh script (Q1=A)

**Decision**: Each cockpit verb the playbook invokes gets a corresponding checked-in file `packages/claude-plugin-cockpit/tests/fixtures/help-snapshots/<verb>.txt` containing the verbatim output of `generacy cockpit <verb> --help`, headed by a comment line `# captured from: generacy --version <X.Y.Z>` recording the CLI version at capture time. Refresh is a repo-local shell script (`packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh`) that enumerates the distinct verbs from `commands/*.md`, shells out `generacy cockpit <verb> --help` for each, and rewrites the snapshot files with a fresh version-tag header. The script runs inside a Generacy cluster session (where `generacy` is always on `$PATH` at `/shared-packages/node_modules/.bin`); standalone use requires the operator to install the CLI first.

**Rationale**: The audit runs in this repo's CI. CI does not (and should not) install `@generacy-ai/generacy`. The two alternatives fail on concrete requirements:

- **Q1=B (live invocation of `generacy cockpit <verb> --help` at test time)**: Would make this repo's CI depend on installing `@generacy-ai/generacy@preview` (or `@latest`); each test run would validate the playbook against whatever preview happens to be published at the moment CI runs. Version skew masquerades as drift signal — a `--help` wording change in `preview` breaks the audit until the next `latest` publication catches up, and there's no way to distinguish "playbook is genuinely wrong" from "preview changed the wording under us." This is the whole class of failure Q1=A is defined to eliminate.
- **Q1=C (hand-maintained JSON/TS manifest declaring expected argument kind + flags per verb)**: Introduces a *second* source of truth. The manifest can itself drift from `--help`; every future manifest edit is a chance to introduce a bug that the audit then blesses. The whole point of the audit is to compare the playbook against the *CLI contract*, not against a hand-maintained restatement of it. If the manifest drifts, the audit is auditing against noise; if the manifest is always regenerated from `--help`, it's just a poorly-formatted version of the snapshot file.

Q1=A is the only option that (a) runs in-repo without a CLI dependency in CI and (b) audits against the actual CLI contract (not a re-summary of it). The version-tag header (`# captured from: generacy --version X.Y.Z`) makes contract drift visible in `git blame` — a future `--help` wording change appears as a snapshot version bump in the same commit that fixes the playbook, matching the D3 principle of "audit follows the contract in the same commit that refreshes the snapshot."

**Load-bearing property**: the snapshot files are the source of truth for the audit. Every playbook invocation is checked against the snapshot; if the snapshot is stale, the audit is checking against a stale contract, which is a known-and-visible risk (the version-tag header makes staleness auditable at review time). This is a deliberate trade — CI decoupling in exchange for a documented refresh obligation. The obligation is discharged during smoke sessions where the CLI always exists.

**Alternatives rejected in-line above**: Q1=B, Q1=C.

## R2 — Invocation extraction: fenced blocks + inline backtick spans with an argument (Q2=B)

**Decision**: The audit parser scans each `commands/*.md` file for `generacy cockpit <verb>` invocations under two rules:

- **(a) Fenced code blocks** (triple-backtick or 4-space-indent) whose first non-whitespace token is `generacy cockpit <verb>`.
- **(b) Inline backtick spans** (single-backtick or double-backtick) that contain `generacy cockpit <verb>` followed by at least one additional token (i.e., the span carries an argument).

The has-an-argument rule automatically excludes bare-verb prose (`` `generacy cockpit merge` `` inside a sentence like "MUST NOT call `generacy cockpit merge`") without needing any author annotations. A bare-verb span is a *reference*, not an *invocation*; an invocation always has an argument.

**Rationale**: The observed D.5 drift lived in a *dispatch-table row* — an inline backtick span, not a fenced block. The alternatives:

- **Q2=A (fenced code blocks only)**: Would false-pass the exact bug that motivated this issue. D.5's dispatch instruction reads `2. **Merge**: \`generacy cockpit merge <pr-ref>\` (squash, branch delete...)` — that's an inline span, not a fenced block. An audit that only inspects fenced blocks would report zero drift on this file, then the session would still stall on the invocation-vs-`--help` gap. Q2=A is ceremonial, not load-bearing.
- **Q2=C (every mention, with author-annotated exceptions)**: Introduces an annotation surface that's itself drift-prone. To exclude a bare-verb mention like `MUST NOT call \`generacy cockpit merge\``, the author would need to write `<!-- audit-skip: bare-verb reference -->` next to it. A future author who reformats the paragraph strips the comment; the audit false-fails on the reformat; the author disables the audit. Q2=C's exception surfaces are more likely to drift than the playbook itself. Q2=B's has-an-argument rule is a structural discriminator, not a comment-based one — it's the same class of solution as #394's "any non-empty line is an event" rule (structural discriminator over content heuristic).

Q2=B is the load-bearing extraction rule. The has-an-argument test is a simple structural check (span contains ≥1 non-whitespace token after `generacy cockpit <verb>`), no NLP, no context inference.

**Precedent match**: #394 §7 established "structural discriminator over content heuristic" as the mechanism-gap defense principle (`.+` regex over `must-start-with-{`). Q2=B applies the same principle at the invocation surface — the has-an-argument test is a structural fact about the span, not a semantic guess about its purpose.

**Alternatives rejected in-line above**: Q2=A, Q2=C.

## R3 — Match semantics: `<issue>`, verbatim from `--help`, exact string comparison (Q3=A)

**Decision**: The canonical argument-kind token in `auto.md` D.5's `generacy cockpit merge` invocation is `<issue>` — the verbatim token from `generacy cockpit merge --help`'s usage line. The audit's match is exact string comparison — no equivalence table, no aliasing, no normalization. If a future `--help` changes `<issue>` to `<issue-ref>` (or vice versa), the audit fails on the next test run until the playbook is refreshed in the same commit that captures the new snapshot.

`merge.md`'s frontmatter is fixed in passing: `arguments.ref` (typed as "PR reference (owner/repo#N...)") is renamed to `arguments.issue` (typed as "Issue reference (owner/repo#N...)"), with the step-1 parsing prose and the two example lines co-edited to match. This is not scope creep — the spec's clarifications explicitly name `merge.md`'s `<pr-ref>` frontmatter as itself wrong per this same finding, and Q3=A makes the CLI's contract the single source of truth, which forces the slash-command wrapper to match.

**Rationale**: The spec is internally inconsistent — §Fix names `<issue-ref>` while §Assumptions declares `--help` authoritative, and `--help` says `<issue>` (not `<issue-ref>`). The spec's own §Assumptions declares the tiebreaker rule: `--help` wins. That's Q3=A.

The alternatives:

- **Q3=B (equivalence table `{"<issue>": "issue-ref", "<issue-ref>": "issue-ref", ...}`)**: A second artifact that must stay in sync with `--help`. Every future `--help` change requires two edits (snapshot + equivalence table); every future author who adds a new verb must remember to add the equivalence-table entry; the table itself is drift-prone. And it defends token cosmetics nobody needs — the playbook can just write what `--help` writes, and if `--help` is opinionated about the token spelling, the playbook is opinionated the same way (i.e., not opinionated at all — it copies).
- **Q3=C (keep playbook tokens aligned with the slash-command wrapper's frontmatter names)**: Conflates two contracts. The slash-command wrapper (`merge.md`'s frontmatter) is the *slash-command's* contract with its caller — that's a different audience (the operator typing `/cockpit:merge <arg>`) than the *CLI's* contract with its caller (the auto session running `generacy cockpit merge <arg>`). The two contracts can diverge legitimately (e.g., if the slash-command adds a wrapper argument the CLI doesn't have). What's audited here is CLI invocations inside playbooks — that's the CLI's contract, not the slash-command's. And `merge.md`'s current `<pr-ref>` frontmatter is itself wrong per this same finding, which is why the fix rewrites the frontmatter to match `--help` in the same PR — the two contracts happen to align on this axis, but the alignment is coincidental, not enforced.

Q3=A's exact-match rule has a load-bearing property: **audit failures are actionable without disambiguation**. When the audit fails, the report is `{file, line, verb, observed: '<X>', expected: '<Y>'}` — the operator's fix is a verbatim substitution. There's no "did you mean" surface, no "either would be fine" surface, no judgment call. The playbook follows the contract in the same commit that refreshes the snapshot; the audit passes; the loop closes.

**Alternatives rejected in-line above**: Q3=B, Q3=C.

## R4 — Regression fixture: minimal checked-in markdown file (Q4=A)

**Decision**: The pre-fix drift is represented as a minimal checked-in markdown file at `packages/claude-plugin-cockpit/tests/fixtures/398-drift-auto.md` containing just the offending D.5 dispatch step (and the ~10-15 surrounding lines of the § Dispatch table/prose needed for the parser to locate the section). Feeding this file through the audit MUST produce the specific failure `{file: "398-drift-auto.md", verb: "merge", observed: "<pr-ref>", expected: "<issue>"}`. Future drift regressions follow the naming pattern `<finding>-drift-<command>.md` and drop into the same fixtures directory without requiring any test-file schema change.

**Rationale**: The audit's runtime input mode is markdown files (the playbook is markdown). File fixtures exercise the actual ingestion path — the parser reads a file from disk, the same code path the production audit uses. The alternatives:

- **Q4=B (inline test-only string literal in the test file itself)**: Exercises a *different* code path than the audit's real input surface. If the parser has a bug in file-reading (e.g., a BOM-handling issue, a newline-normalization bug, a large-file boundary), a string-literal fixture won't catch it because it skips the file-reading path. The audit's real production surface is markdown files on disk; the regression fixture should mirror that surface exactly.
- **Q4=C (full snapshot of pre-fix `auto.md` alongside a diff-style expected-failure assertion)**: 400+ lines of noise around a one-line defect. The audit's failure signal is per-invocation, not per-file — reproducing the failure needs the offending line plus enough surrounding context to parse, nothing more. A full snapshot also creates a maintenance burden: every future edit to `auto.md`'s unrelated sections would need to be mirrored in the snapshot, or the snapshot would drift into staleness (and staleness on a regression fixture is a different failure mode — the fixture would eventually fail to parse at all).

Q4=A's minimal-fixture approach also gives future drift regressions a **drop-in pattern**. A new finding at, say, `queue.md`'s D.8 gets a fixture `tests/fixtures/399-drift-queue.md` following the same shape; the test file's `it("...regression")` loop picks up the new fixture with no code change — it just enumerates the `*-drift-*.md` files and runs the parser against each, asserting each produces the specific mismatch its filename implies. This is scale-friendly by construction.

**Alternatives rejected in-line above**: Q4=B, Q4=C.

## R5 — Engine-side guard: no artifact in this branch (Q5=A)

**Decision**: Nothing ships in this branch for the engine-side guard ("when an issue ref resolves to a number that is actually a pull request, error with guidance instead of resolving it"). The generacy companion finding is already filed as **generacy#906**, folding into `#904`'s resolver work if still open. The number is recorded in this spec's § Out of Scope line; that IS the handoff.

**Rationale**: The engine-side guard is out of this repo's scope (it lives in the generacy CLI, not the claude-plugin-cockpit playbook). The tracking artifact is the issue itself — anyone tracing from #398 to the engine work follows the issue link, not a repo-local doc. The alternatives:

- **Q5=B (create a follow-up issue in the generacy repo from this branch, via `gh issue create`)**: Would duplicate the tracking artifact (generacy#906 already exists). Duplicate issues get closed by hand, creating link-rot and confusion.
- **Q5=C (add a handoff doc in this repo, e.g., `docs/handoffs/398-engine-guard.md`)**: Adds a third surface (spec, issue, doc) that must be kept in sync for no reader benefit. Anyone tracing from this branch to the engine work follows the issue link — a repo-local doc is a xerox of the issue's body, and it will drift when the engine work's scope changes (which it inevitably will as generacy#904 progresses).

Q5=A's "nothing ships, record the number" approach uses the issue tracker as the single source of truth for engine-side work. Any operator tracing #398's handoff can find generacy#906 in the spec's Out of Scope line and follow it to the engine work's current state. That's a one-hop link, one source of truth, zero maintenance cost.

**Load-bearing property**: the guard's absence is not a defect of this fix. The playbook-side fix (correct D.5 + audit backstop) removes the class of failure by construction — a session following the corrected prose invokes with an issue ref on the first try, so the resolver never has an opportunity to disambiguate. The engine-side guard is a defense-in-depth for the resolver's own contract (issue-ref-that-is-really-a-PR-number → error with guidance), which protects operators of `generacy cockpit merge` directly (not through the playbook). The two fixes are complementary and independent; either shipping without the other is a partial improvement.

**Alternatives rejected in-line above**: Q5=B, Q5=C.

## R6 — Load-bearing surfaces: what the fix touches and what it doesn't

The corrected D.5 prose and the audit assertion are the two load-bearing edits. Everything else is completeness hygiene around them:

**Load-bearing** (a bug here reproduces the T-S6 diagnosis-round-burn):

- `auto.md` D.5 dispatch step 2's `<pr-ref>` → `<issue>` substitution — the runtime prose the session follows. If this is wrong, no audit can save the next session from burning the same diagnosis round.
- The audit's exact-match rule (Q3=A) applied to fenced blocks + Q2=B inline spans — the machine-checkable backstop that any future D.5-style drift at any playbook surface fails at build time.

**Completeness hygiene** (a bug here fails the audit at build time, not at runtime):

- `merge.md` frontmatter's `ref` → `issue` rename — closes the same drift at the slash-command surface so day-one audit is green.
- `tests/fixtures/help-snapshots/<verb>.txt` files — the declared CLI contract the audit checks against.
- `scripts/refresh-help-snapshots.sh` — the repo-local refresh mechanism that discharges the Q1=A sync obligation.
- `tests/fixtures/398-drift-auto.md` — the machine-checkable proof that the audit's regex logic isn't vacuous (positive-signal check via assertion 398-2).
- The two new assertions (398-1, 398-2) — the audit's build-time enforcement.

**Not touched** (out of scope):

- `auto.md` § Invariants section — no new invariant §8. The audit's guarantee lives inside the test file's assertion, not at the invariants surface. Matches SC-007 of #394 and #396's no-§8 rule.
- Sibling playbooks (`clarify.md`, `review.md`, `queue.md`, `watch.md`, `status.md`) — swept by the audit, expected day-one green. If pre-existing drift is discovered during implement, the fix is a verbatim token substitution in the same PR — that's the audit doing its job, not scope creep.
- `cockpit merge`, `cockpit advance`, `cockpit context`, `cockpit queue`, `cockpit watch`, `cockpit status`, `cockpit resume` CLI verbs — no engine-side change. The engine-side guard for PR-number-as-issue-ref lives in generacy#906.
- `packages/claude-plugin-cockpit/lib/reference-consumption.ts` (created by #394) and `lib/gate-vocabulary.ts` (created by #396) — independent modules, untouched.
- Cross-tool audit coverage (`gh`, `git`, `pnpm` `--help` matching) — scope creep. The audit's infrastructure extends per-tool if future findings show drift there (`tests/fixtures/help-snapshots/<tool>-<verb>.txt`), but this fix's shape is CLI-cockpit-verbs-only.
- Historical spec directories — deliberately byte-identical.

## Sources

- **Spec**: [spec.md](./spec.md) — observed T-S6 evidence (D.5 → PR-number-passed → resolver confusion → diagnosis-round-burn), three-part fix framing, regression-test enumeration.
- **Clarifications**: [clarifications.md](./clarifications.md) — Q1–Q5 with resolved answers.
- **Predecessor fixes**: [../384-found-during-cockpit-v1/plan.md](../384-found-during-cockpit-v1/plan.md), [../388-found-during-cockpit-v1/plan.md](../388-found-during-cockpit-v1/plan.md), [../390-found-during-cockpit-v1/plan.md](../390-found-during-cockpit-v1/plan.md), [../394-found-during-cockpit-v1/plan.md](../394-found-during-cockpit-v1/plan.md), [../396-found-during-cockpit-v1/plan.md](../396-found-during-cockpit-v1/plan.md) — the instruction-drift class this fix continues to close at successive playbook surfaces (this fix at the CLI-invocation surface).
- **CLI contract of record**: `generacy cockpit merge --help` (as captured at implement time into `tests/fixtures/help-snapshots/merge.txt`) — usage line reads `Squash-merge the PR for <issue> iff it carries completed:validate...`. This is the authoritative source per spec §Assumptions and per Q3=A.
- **Companion tracking issue**: **generacy#906** — engine-side guard for PR-number-as-issue-ref resolution errors. Recorded in this spec's § Out of Scope.
