# Implementation Plan: Fix D.5 `<pr-ref>` drift and add invocation-vs-`--help` drift audit

**Feature**: Correct `auto.md` D.5's `generacy cockpit merge <pr-ref>` to `generacy cockpit merge <issue>` (verbatim from CLI `--help` per Q3=A), fix `merge.md` frontmatter's `<pr-ref>` in passing (same finding), and add a new drift-audit assertion to the existing `playbook-verification.test.ts` suite that parses every `generacy cockpit <verb>` invocation in `commands/*.md` (fenced blocks + inline backtick spans that carry an argument) against a checked-in `--help` snapshot per verb; plus a minimal regression-fixture markdown file that reproduces the pre-fix D.5 drift.
**Branch**: `398-found-during-cockpit-v1`
**Date**: 2026-07-10
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Close the T-S6 diagnosis-round-burn observed on the cockpit v1.5 auto-mode integration smoke test (generacy-ai/tetrad-development#92, finding #49). The auto session's first merge attempt followed `auto.md` D.5's dispatch instruction verbatim — `generacy cockpit merge <pr-ref>` — and passed the PR number: `generacy cockpit merge christrudelpw/sniplink#21`. The CLI's actual contract is an **issue** ref (`--help`: "Squash-merge the PR for **<issue>** iff it carries `completed:validate`…"; sibling `merge.md` slash-command's own body agrees). GitHub's shared issue/PR number space made this fail confusingly rather than loudly: "issue 21" exists (it *is* PR #21), the resolver linked it to an unrelated draft (PR #25), and the session got a plausible-looking `red / missing-label` verdict for a nonsense query — a full diagnosis round burned before the session re-read `--help` and corrected to issue refs.

Three edits, applied in the same PR:

1. **Correct D.5 in `auto.md`.** Change the two occurrences of `<pr-ref>` in D.5 (the dispatch step's CLI invocation and any co-located example) to `<issue>` — the verbatim `--help` usage-string token (Q3=A). The § Dispatch table row for D.5 does not name the argument, so no table edit is needed there; only the D.5 prose block's step 2 and any co-located example line.

2. **Fix `merge.md` frontmatter in passing.** The slash-command's `arguments.ref` frontmatter currently declares `"PR reference (owner/repo#N, #N, or bare integer)"`. That is the same D.5 drift at a different surface — the CLI's contract is an issue, not a PR. Rename the argument from `ref` to `issue`, rewrite the description to say "Issue reference (owner/repo#N, #N, or bare integer). Optional; falls back to the current branch's open PR's linked issue." Update the step-1 parsing prose in the same file, plus the two example invocations at the bottom (`/cockpit:merge` and `/cockpit:merge generacy-ai/agency#789 --max-fix-attempts=2` — the latter's `#789` is documented as a PR ref today; it becomes an issue ref, so the example line needs a co-edited comment or a new example number). This is the smallest-in-scope surface change consistent with Q3=A.

3. **Add the drift audit to `playbook-verification.test.ts`.** One new assertion appended to the existing 396 describe block (or a new `398 —` describe block adjacent to it). The audit:
   - Parses every `commands/*.md` file for `generacy cockpit <verb>` invocations. **Two extraction modes** (Q2=B): (a) inside fenced code blocks whose first token matches, (b) inline backtick spans that parse as `verb + argument` (i.e., the span has at least one token after the verb — bare-verb mentions like `` `generacy cockpit merge` `` inside prose are excluded by the has-an-argument rule).
   - For each parsed invocation, reads the checked-in `--help` snapshot for that verb from `tests/fixtures/help-snapshots/<verb>.txt` (Q1=A). Extracts the usage-string argument-kind token (e.g., `<issue>`, `<epic-ref>`, `<pr-ref>` — whatever verbatim appears between angle brackets in the usage line).
   - **Asserts an exact string match** (Q3=A): the argument-kind token in the playbook invocation equals the argument-kind token in the snapshot's usage line. No equivalence table. No aliasing.
   - Fails loudly with the offending file:line, the observed token, and the expected token.

Also ship:

- **`packages/claude-plugin-cockpit/tests/fixtures/help-snapshots/merge.txt`** (and the same for the other cockpit verbs the playbook invokes — `advance`, `resume`, `queue`, `context`, `status`, `watch`; enumerated at implement time by grepping `commands/*.md` for `generacy cockpit <verb>` and taking the distinct verb set). Each snapshot is the verbatim `generacy cockpit <verb> --help` output, headed by a comment line `# captured from: generacy --version <X.Y.Z>` (Q1=A version-tagged). The set of snapshots shipped in this PR is the exact set the audit needs to be green day one — no snapshots for verbs the playbook doesn't invoke.
- **`packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh`** — a repo-local shell script (Q1=A refresh-script clause). Invocation: `bash scripts/refresh-help-snapshots.sh`. Behavior: enumerate the distinct verbs from `commands/*.md`, shell-out `generacy cockpit <verb> --help` for each, write the output to `tests/fixtures/help-snapshots/<verb>.txt` prefixed by the `# captured from: generacy --version <X.Y.Z>` header. Runs happily inside a cluster session (where `generacy` is on `$PATH` at `/shared-packages/node_modules/.bin`); prints a clear error and exits non-zero if the CLI is missing. Does **not** run automatically in CI (the whole point of Q1=A rejecting Q1=B is to decouple snapshot refresh from CI-installed `generacy`). Documented in `quickstart.md` as the one-liner to run during a smoke session when a `--help` string changes.
- **`packages/claude-plugin-cockpit/tests/fixtures/398-drift-auto.md`** — the minimal regression fixture (Q4=A). Contains just the pre-fix D.5 dispatch-table row plus the ~10-15 surrounding lines needed for the parser to identify the section (the § Dispatch table's header + surrounding rows for context). Feeding this file through the audit MUST produce the specific failure "D.5 invocation uses `<pr-ref>` but merge.md `--help` says `<issue>`" — this is the drift the tightened audit is defined to catch, so this fixture is the machine-checkable proof that the audit's regex logic isn't vacuous.
- **One new drift-audit assertion (398-1)** in `tests/playbook-verification.test.ts`: reads all `commands/*.md`, parses every invocation per Q2=B rules, cross-checks each argument-kind token against the corresponding `--help` snapshot, and asserts the (probably-empty-day-one) mismatch list is empty. Also, in the same test file: **one companion regression assertion (398-2)** that feeds `tests/fixtures/398-drift-auto.md` through the same parser + audit and asserts the specific `<pr-ref>` vs `<issue>` mismatch is reported (a positive-signal check that guards against the audit silently degrading to no-op).

**Companion tracking artifact** (out of this repo, no artifact needed in this branch per Q5=A): the engine-side guard ("when an issue ref resolves to a number that is actually a pull request, error with guidance instead of resolving it") is filed as **generacy#906**, folding into `#904`'s resolver work if still open. Recorded in this spec's Out of Scope line; no handoff doc, no follow-up issue in this repo.

The change is **playbook prose fix (2 verbatim token substitutions in `auto.md` D.5, one frontmatter rename + one description rewrite + one step-1 prose edit + two example-line edits in `merge.md`) + N help-snapshot fixture files (one per distinct cockpit verb the playbook invokes) + one refresh script + one regression fixture + two new test assertions**. No runtime code change to `cockpit watch`, `cockpit status`, or the reference-consumption module; no engine-side change; no new CLI verb. Sibling playbooks that DON'T invoke `generacy cockpit merge` with a positional argument (`clarify.md`, `queue.md`, `watch.md`, `status.md`, `review.md`) will be swept by the audit and either pass green day one or reveal additional pre-existing drift — if pre-existing drift is discovered during implement, the fix is a co-located token substitution per verb in the same PR (this is completeness hygiene, not scope creep, because the audit is either exhaustive or misleading).

This is the **CLI-contract-drift analogue** of the #396 vocabulary-drift fix at a different playbook surface:
- **#396** closed a *classification gap* at the dispatch surface (under-specified catch-all → "known but not actionable" invented as a third bucket → silent no-op) with an explicit `waiting-for:*`-must-be-named-or-D.10 trigger + a completeness-hygiene audit against a declared vocabulary.
- **#398** closes a *CLI-contract gap* at the invocation surface (playbook's argument-kind token drifted away from `--help`'s → the session followed the playbook to a plausible-looking confusing failure → burned a diagnosis round to realize the playbook was wrong) with a `--help`-snapshot-driven audit that compares every playbook invocation against the CLI contract.

Same instruction-drift class (#384/#388/#390/#394/#396), same fix shape (pin the rule at the surface + backstop with a regression fixture the model cannot silently regress).

## Technical Context

**Language/Version**: Markdown (playbook prose interpreted by Claude at runtime; also parsed as text by the audit); TypeScript (Vitest) for the two new assertions; Bash for the refresh script.
**Primary Dependencies**: None new on the runtime side. Existing runtime: Claude Code slash-command executor. `generacy cockpit merge`, `generacy cockpit advance`, `generacy cockpit context`, `generacy cockpit queue`, `generacy cockpit watch`, `generacy cockpit status`, `generacy cockpit resume` remain the authoritative CLI verbs (contract unchanged; only the playbook's *invocation* prose is edited to match). On the test side: Vitest — already a dev-dep in the plugin package (introduced by #394, extended by #396).
**Storage**: Filesystem — two files edited (`packages/claude-plugin-cockpit/commands/auto.md`, `packages/claude-plugin-cockpit/commands/merge.md`); one file extended (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — created by #394, extended by #396, extended again here with two more assertions); one script created (`packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh`); N help-snapshot fixtures created (`packages/claude-plugin-cockpit/tests/fixtures/help-snapshots/<verb>.txt`, one per distinct cockpit verb invoked from `commands/*.md`); one regression fixture created (`packages/claude-plugin-cockpit/tests/fixtures/398-drift-auto.md`).
**Testing**:
- **Static** (necessary but proven insufficient by the #384–#396 arc — static-only fails at behavioral drift): greps for the substituted `<issue>` token in `auto.md` D.5 (positive signal), a grep asserting `<pr-ref>` does NOT appear in `auto.md` at all (negative signal — the smoking-gun anchor for this finding), a grep on `merge.md`'s frontmatter for the renamed `issue` argument (positive signal), and a grep asserting `<pr-ref>` does NOT appear in `merge.md` (negative signal). See [quickstart.md](./quickstart.md) § Static checks.
- **Behavioral**: two new assertions appended to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`:
  - **(398-1)**: read all `commands/*.md`, parse every `generacy cockpit <verb>` invocation per the Q2=B extraction rules (fenced blocks + inline spans with an argument), read the corresponding `tests/fixtures/help-snapshots/<verb>.txt` snapshot, extract the usage-line argument-kind token, and assert an exact string match. On mismatch, fail with `{file, line, observed, expected}`.
  - **(398-2)**: feed `tests/fixtures/398-drift-auto.md` through the same parser + audit and assert the specific `{observed: '<pr-ref>', expected: '<issue>'}` mismatch is reported (positive-signal regression — this fixture MUST fail the audit if it were a real playbook file, which is the whole point of the audit).
- **True verifier**: a re-run of the cockpit v1.5 auto-mode integration smoke test on the same T-S6 corpus (an epic with at least one issue reaching `completed:validate` + green). The auto session follows the corrected D.5 prose and invokes `generacy cockpit merge <issue-ref>` on the first attempt (no diagnosis-round burn). Adherence is probabilistic; the corrected prose + audit backstop remove the class of failure by construction; the regression fixture is defense-in-depth against future D.5-style drift at any playbook surface. Empirical confirmation is the true verifier.

**Target Platform**: Claude Code slash-command runtime (any platform where `packages/claude-plugin-cockpit` is installed). Vitest runs in Node.js (repository-standard). The refresh script runs in Bash (inside a Generacy cluster session where the CLI is on `$PATH`; standalone use requires the operator to install `@generacy-ai/generacy@latest` first).

**Project Type**: Single-package playbook edits + one new script + N new fixture files + one regression fixture + suite extension (one plugin package touched; no cross-package changes; no cross-repo changes to `tetrad-development` or `generacy` in this branch — engine-side guard tracked separately as generacy#906 per Q5).

**Performance Goals**: N/A (playbook adherence, not throughput). Adherence targets: 0 CLI-contract-drift diagnosis-round-burns on the T-S6 corpus (SC parallel to #396's 0-silent-stalls); 100% of `generacy cockpit <verb>` invocations in `commands/*.md` (fenced or Q2=B inline) match their `--help` usage-string argument-kind token verbatim; the drift audit passes green day one across all N snapshot files.

**Constraints**:
- **The audit's runtime input mode is markdown files, so the regression fixture is a markdown file, not an inline string** (Q4=A). Feeding `tests/fixtures/398-drift-auto.md` through the audit exercises the actual ingestion path — future drift fixtures follow the `<finding>-drift-<command>.md` naming pattern and drop into the same fixtures directory without any test-file schema change.
- **Snapshot source is checked-in fixture files, not live CLI invocation** (Q1=A). CI does not shell out to `generacy cockpit <verb> --help`; the snapshot files are the source of truth. Refresh is a one-liner (`bash scripts/refresh-help-snapshots.sh`) intended to run during a cluster session where the CLI always exists. Version-tagging the snapshots (`# captured from: generacy --version X.Y.Z` header) makes contract drift visible in `git blame` — a future `--help` wording change appears as a snapshot version bump in the same commit that fixes the playbook, matching the D3 approach of "audit follows the contract in the same commit that refreshes the snapshot."
- **Invocation extraction is Q2=B: fenced blocks OR inline backtick spans with an argument** (Q2=B). The observed D.5 drift lived in a dispatch-table row (an *inline backtick span*), not a fenced block. Q2=A (fenced-only) would false-pass the exact bug that motivated this issue. Q2=C (every mention, with author annotations for exceptions) introduces an annotation surface that's itself drift-prone. Q2=B's "has-an-argument" rule excludes bare-verb prose (`MUST NOT call \`generacy cockpit merge\``) automatically — an argument-less span isn't a call, it's a reference.
- **Match semantics are exact string comparison** (Q3=A). No `<issue>` ⟷ `<issue-ref>` equivalence table. If a future `--help` changes `<issue>` to `<issue-ref>` (or vice versa), the audit fails until the playbook is refreshed to match — that's the audit working, not a false positive. The equivalence-table alternative (Q3=B) defends token cosmetics nobody needs and adds a second artifact that can itself drift.
- **`merge.md`'s frontmatter argument is renamed `ref` → `issue`.** This is a slash-command *argument name* edit, not a schema edit — the argument's declared type (string, optional) is unchanged. Any prose in `merge.md` that refers to `<pr-ref>` in step 1 or in the two example lines is co-edited. This is per the Q3=A "fix it in passing" clause (the spec's clarifications explicitly name `merge.md`'s `<pr-ref>` frontmatter as itself wrong per this same finding).
- **The audit checks ONLY `generacy cockpit <verb>` invocations** (Q2=B scope, applied to `generacy cockpit *` specifically). Other CLI invocations in the playbook (`gh issue view`, `git checkout`, `pnpm test`) are outside this fix's scope — they belong to their respective tools' `--help` contracts, and adding cross-tool contract audits is scope creep. If future findings show drift at those surfaces, that's a follow-up finding using the same infrastructure (`tests/fixtures/help-snapshots/<tool>-<verb>.txt` extended per-tool).
- **Scope boundary**: `auto.md` (2-line edit in D.5), `merge.md` (frontmatter rename + description + step-1 parsing prose + 2 example lines), `tests/playbook-verification.test.ts` (2 new assertions), `scripts/refresh-help-snapshots.sh` (new), N help-snapshot fixtures (new; N ≈ 5-8 based on distinct verbs invoked in `commands/*.md`), one regression fixture `398-drift-auto.md` (new). Sibling playbooks that invoke `generacy cockpit <verb>` will be swept by the audit and either pass green day one or reveal pre-existing drift — pre-existing drift is fixed in the same PR by verbatim token substitution (that's the definition of "the audit is exhaustive"). If drift is deep enough to require design judgment (e.g., a verb the playbook uses that doesn't have a `--help` snapshot yet because the CLI verb has been renamed since the playbook was written), the fix is: refresh the snapshot, then reconcile the playbook prose against it — flagged in the PR description, not deferred.
- **No new invariant number**. Consistent with #394's SC-007 and #396's no-§8 rule. The audit's guarantee lives inside the test file's assertion, not at the `auto.md` § Invariants surface. A future audit-adherence invariant would be its own finding, not this fix's shape.

**Scale/Scope**: Two files edited: `auto.md` (2 line edits in D.5, no net line-count change), `merge.md` (~5-line net edit — frontmatter argument rename + description rewrite + step-1 prose + 2 example lines). One file extended: `tests/playbook-verification.test.ts` (~70-100 net added lines for two new assertions + fixture-reads + parser helpers). One new script `scripts/refresh-help-snapshots.sh` (~30-50 lines). N new fixture files under `tests/fixtures/help-snapshots/` (~20-100 lines each, depending on `--help` output length; N ≈ 5-8). One new regression fixture `tests/fixtures/398-drift-auto.md` (~15-25 lines). Zero files deleted, zero files renamed. No changes to `lib/reference-consumption.ts` (created by #394) or `lib/gate-vocabulary.ts` (created by #396).

## Constitution Check

No `.specify/memory/constitution.md` file exists in this repository (`.specify/` contains only `templates/`). No governance gates to check. #384 through #396 recorded the same finding — nothing has changed on that surface.

## Project Structure

### Documentation (this feature)

```text
specs/398-found-during-cockpit-v1/
├── spec.md                                # Feature spec (read-only)
├── clarifications.md                      # Q1–Q5 with resolved answers (read-only)
├── plan.md                                # THIS FILE
├── research.md                            # Design decisions and rationale (Phase 0)
├── data-model.md                          # Playbook structural model: pre/post layout of auto.md D.5 + merge.md frontmatter; snapshot fixture shape; audit-parser input/output; regression fixture shape
├── quickstart.md                          # Verification runbook (static grep + Vitest + refresh-script one-liner)
├── contracts/
│   ├── d5-token-fix.md                    # Contract: verbatim token substitution in auto.md D.5 (source: --help exact match)
│   ├── merge-md-frontmatter-fix.md        # Contract: merge.md frontmatter argument rename + prose sync
│   ├── help-snapshot-format.md            # Contract: tests/fixtures/help-snapshots/<verb>.txt file format + version-tag header
│   ├── invocation-parser-rules.md         # Contract: Q2=B extraction rules (fenced blocks + inline spans with argument)
│   ├── drift-audit-assertion.md           # Contract: assertion 398-1 shape + failure mode + assertion 398-2 regression check
│   └── refresh-script.md                  # Contract: bash scripts/refresh-help-snapshots.sh behavior + degradation clauses
├── checklists/                            # (empty — reserved for /checklist skill)
└── tasks.md                               # Phase 2 output — generated by /tasks (NOT created by /plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   ├── auto.md                            # MODIFIED — D.5 dispatch step 2's <pr-ref> → <issue> (verbatim from --help)
│   └── merge.md                           # MODIFIED — frontmatter argument rename (ref → issue), description rewrite, step-1 parsing prose sync, 2 example lines
├── lib/
│   ├── reference-consumption.ts           # UNCHANGED — created by #394
│   └── gate-vocabulary.ts                 # UNCHANGED — created by #396
├── scripts/
│   └── refresh-help-snapshots.sh          # NEW — repo-local refresh script (Q1=A refresh clause)
└── tests/
    ├── playbook-verification.test.ts      # EXTENDED — two new assertions (398-1, 398-2)
    └── fixtures/
        ├── 394-mixed-event-shapes.ndjson  # UNCHANGED — created by #394
        ├── 394-actionable-live-state.json # UNCHANGED — created by #394
        ├── 396-merge-conflicts-live-state.json # UNCHANGED — created by #396
        ├── 396-someday-gate-live-state.json    # UNCHANGED — created by #396
        ├── 398-drift-auto.md              # NEW — minimal markdown fixture reproducing the pre-fix D.5 drift (Q4=A)
        └── help-snapshots/
            ├── merge.txt                  # NEW — verbatim `generacy cockpit merge --help` output, headed by version tag
            ├── advance.txt                # NEW — verbatim `generacy cockpit advance --help` output
            ├── resume.txt                 # NEW — verbatim `generacy cockpit resume --help` output
            ├── queue.txt                  # NEW — verbatim `generacy cockpit queue --help` output
            ├── context.txt                # NEW — verbatim `generacy cockpit context --help` output
            ├── status.txt                 # NEW — verbatim `generacy cockpit status --help` output
            └── watch.txt                  # NEW — verbatim `generacy cockpit watch --help` output
```

The exact set of snapshot files is determined at implement time by running the enumeration step of the audit locally against `commands/*.md` and reading off the distinct `generacy cockpit <verb>` verbs it finds. The list above (`merge`, `advance`, `resume`, `queue`, `context`, `status`, `watch`) is the expected set based on a quick spot-check of the current playbook prose; deviations get resolved in the PR (add the missing snapshot; remove the unused one).

Sibling files (untouched — byte-identical across this branch):

```text
packages/claude-plugin-cockpit/commands/
├── clarify.md      # Invokes generacy cockpit context/advance — swept by the audit; expected green (its prose uses <issue-ref> which matches --help)
├── review.md       # Invokes generacy cockpit advance — swept by the audit; expected green
├── queue.md        # Invokes generacy cockpit queue — swept by the audit; expected green (its prose uses <epic-ref>/<phase-ref> matching --help)
├── watch.md        # Invokes generacy cockpit watch — swept by the audit; expected green
└── status.md       # Invokes generacy cockpit status — swept by the audit; expected green
```

If any of these sibling playbooks turn out to have pre-existing drift on the same axis (invocation argument-kind token ≠ `--help` usage-string token), the fix is a verbatim token substitution in the same PR — the audit is exhaustive by design; a shipped audit that reveals additional drift is not scope creep, it's the audit doing its job.

Historical artifacts (deliberately untouched):

```text
specs/372-epic-generacy-ai-tetrad/plan.md    # Status: Complete; byte-identical
specs/384-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/388-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/390-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/394-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/396-found-during-cockpit-v1/           # Status: Complete; byte-identical
```

Companion tracking artifact (out of this repo — no artifact in this branch):

```text
generacy#906                                 # Engine-side guard: PR-number-as-issue-ref → error with guidance; folds into #904's resolver work if still open (Q5=A). Recorded in this spec's § Out of Scope; no handoff doc, no follow-up issue in this repo.
```

**Structure Decision**: Single-package playbook edits + one refresh script + N snapshot fixtures + one regression fixture + suite extension. The "structure" is the internal layout of `auto.md`'s D.5 dispatch step (2 verbatim-token substitutions) + `merge.md`'s frontmatter/prose (5-line net edit) + the snapshot fixtures' directory shape + the audit parser's extraction rules — see [data-model.md](./data-model.md) for pre/post layout and fixture shapes — plus the six contract files — see [contracts/](./contracts/) for the D.5 substitution contract, the `merge.md` frontmatter contract, the snapshot-file format, the parser-extraction rules, the audit assertion, and the refresh-script contract.

## Constitution Check (re-check)

No constitution file present. No gates to re-check.

## Complexity Tracking

No constitution violations to justify. The change is intentionally minimal (a 2-token substitution in `auto.md`, a small frontmatter/prose fix in `merge.md`, one refresh script, N snapshot fixtures, one regression fixture, and two new test assertions) and matches the fix scope named in the spec (correct D.5, add invocation-vs-`--help` drift coverage, regression fixture). The design explicitly rejects:

- **Live CLI invocation at test time** (Q1=B rejected). Would make this repo's CI depend on installing `@generacy-ai/generacy@preview` (or `@latest`); each test run would validate the playbook against whatever preview happens to be published at the moment CI runs, rather than against the contract the playbook was written for. Version skew masquerades as drift signal — exactly the failure mode Q1=A was chosen to eliminate.
- **Hand-maintained JSON/TS manifest of expected argument kinds** (Q1=C rejected). Introduces a second source of truth (the manifest) that can itself drift from `--help`; every future manifest edit is a chance to introduce a bug that the audit then blesses. The whole point of the audit is to compare the playbook against the *CLI contract*, not against a hand-maintained restatement of it.
- **Fenced-code-blocks-only invocation extraction** (Q2=A rejected). The observed D.5 drift lived in a *dispatch-table row* — an inline backtick span, not a fenced block. Q2=A would false-pass the exact bug that motivated this issue. Extraction MUST include inline spans that carry an argument, or the audit is ceremonial.
- **Every-mention extraction with author-annotated exceptions** (Q2=C rejected). Annotation surfaces are drift surfaces of their own — a bare-verb mention like `MUST NOT call \`generacy cockpit merge\`` would require an inline comment saying "not an invocation, don't audit"; the comment is invisible to a future author who reformats the paragraph; the comment gets stripped, the audit false-fails, the author disables the audit. Q2=B's has-an-argument rule excludes bare-verb prose automatically without any author annotations.
- **Equivalence table for argument-kind tokens** (Q3=B rejected). A separate artifact (`{"<issue>": "issue-ref", "<issue-ref>": "issue-ref"}`) that must itself stay in sync with `--help`. Defends token cosmetics nobody needs. If a future `--help` wording change breaks the audit, that's the audit working — the playbook should follow the contract in the same commit that refreshes the snapshot.
- **Keeping playbook tokens aligned with the slash-command wrapper's frontmatter names** (Q3=C rejected). The slash-command wrapper (`merge.md`'s frontmatter) is its own contract surface; what's audited here is CLI invocations inside playbooks. Conflating two contracts blurs the drift signal — and `merge.md`'s current `<pr-ref>` frontmatter is itself wrong per this same finding, which is why the fix rewrites the frontmatter to match `--help` in the same PR.
- **Inline test-only string literal for the regression fixture** (Q4=B rejected). The audit's runtime input mode is markdown files; using a string literal exercises a different code path than the audit's real input surface. File fixtures also give future drift regressions a drop-in naming pattern (`<finding>-drift-<command>.md`) that scales; string literals accumulate in the test file and are harder to maintain.
- **Full pre-fix `auto.md` snapshot + diff-style expected-failure assertion for the regression fixture** (Q4=C rejected). 400+ lines of noise around a one-line defect. The audit's failure signal is per-invocation, not per-file — reproducing the failure needs the offending line plus enough surrounding context to parse, nothing more.
- **Filing a follow-up issue in the `generacy` repo from this branch** (Q5=B rejected). The number is already concrete (generacy#906). Filing a fresh issue would duplicate the tracking artifact; recording the number in this spec's Out of Scope is sufficient.
- **Adding a handoff doc in this repo for the engine-side guard** (Q5=C rejected). The tracking artifact is the issue itself (generacy#906). A handoff doc adds a third surface (spec, issue, doc) that must be kept in sync for no reader benefit — anyone tracing from this branch to the engine work follows the issue number, not a repo-local doc.
- **Adding invariant §8 "Every CLI invocation matches --help"**. Rejected as scope creep. The rule already lives in the audit's assertion (398-1); a numbered invariant in `auto.md` would be a belt-and-suspenders duplicate — same anti-pattern SC-007 of #394 rejected for step-4/step-5 changes and #396 rejected for the D.10 tightening. If future drift shows the invariants surface is needed, that's a follow-up finding, not this fix's shape.
- **Cross-tool audit coverage** (`gh`, `git`, `pnpm` `--help` matching). Rejected: scope creep. Adds infrastructure for surfaces that haven't produced findings yet. If future findings show drift at those surfaces, the same infrastructure extends per-tool (`tests/fixtures/help-snapshots/<tool>-<verb>.txt`) — that's a follow-up, not this fix's shape.
- **Auto-running the refresh script in CI**. Rejected: reintroduces Q1=B's version-skew problem. The refresh script is intentionally operator-triggered during a cluster session, not CI-triggered.

## Phase Layering

- **Phase 0 (research)**: Captured in [research.md](./research.md) — Q1–Q5 decisions with rationale (resolved in `clarifications.md`; research.md restates them as design decisions with alternatives-rejected).
- **Phase 1 (design)**: [data-model.md](./data-model.md) (pre/post layout of `auto.md` D.5 + `merge.md` frontmatter; `tests/fixtures/help-snapshots/<verb>.txt` file shape; audit-parser input/output; regression fixture shape), [contracts/](./contracts/) (six contract files: D.5 token fix, `merge.md` frontmatter fix, help-snapshot format, invocation-parser rules, drift-audit assertion, refresh-script), [quickstart.md](./quickstart.md) (verification runbook — static greps + Vitest suite + refresh-script one-liner).
- **Phase 2 (tasks)**: Generated by `/tasks` from this plan — NOT created here.

## Key Design Decisions (from clarifications)

| # | Decision | Source |
|---|----------|--------|
| D1 | **`--help` snapshot source is checked-in fixture files under `tests/fixtures/help-snapshots/<verb>.txt`, each headed by the `generacy --version` it was captured from.** A repo-local refresh script (`scripts/refresh-help-snapshots.sh`) regenerates them; runs happily inside a cluster session where the CLI is on `$PATH`. Rejected: live invocation at test time (Q1=B — version skew masquerades as drift signal), hand-maintained manifest (Q1=C — introduces a second source of truth that can itself drift). | Q1=A |
| D2 | **Invocation extraction covers fenced code blocks whose first token is `generacy cockpit <verb>` AND inline backtick spans that parse as `verb + argument`.** The has-an-argument rule automatically excludes bare-verb prose (`MUST NOT call \`generacy cockpit merge\``) without needing author annotations. This is load-bearing — the observed D.5 drift lived in a dispatch-table row (inline backtick span), so fenced-only (Q2=A) would false-pass the bug. Rejected: fenced-only (Q2=A — false-passes D.5), every-mention with author annotations (Q2=C — annotation drift surface). | Q2=B |
| D3 | **Canonical argument-kind token in `auto.md` D.5 is `<issue>`, verbatim from `generacy cockpit merge --help`; audit match is exact string comparison.** Spec §Assumptions declares `--help` authoritative, which settles the spec's own internal inconsistency (spec §Fix wrote `<issue-ref>`, but `<issue>` is what `--help` says). An equivalence table (Q3=B) is a second artifact that can itself drift; keeping tokens aligned with the slash-command wrapper's frontmatter (Q3=C) conflates two contracts. `merge.md`'s current `<pr-ref>` frontmatter is itself wrong per this same finding — fix it in passing (renamed `ref` → `issue`, description + prose + example lines synced). | Q3=A |
| D4 | **The pre-fix drift is represented as a minimal checked-in markdown fixture (`tests/fixtures/398-drift-auto.md`) with just the offending D.5 row and enough surrounding context to parse.** The audit's real input mode is markdown files, so file fixtures exercise the actual ingestion path; future drift regressions get a drop-in naming pattern (`<finding>-drift-<command>.md`). Rejected: inline string literal in the test file (Q4=B — different code path from the audit's real input surface), full pre-fix `auto.md` snapshot + diff assertion (Q4=C — 400+ lines of noise around a one-line defect). | Q4=A |
| D5 | **No artifact ships in this branch for the engine-side guard.** The generacy companion finding is already filed as **generacy#906** (PR-number-as-issue-ref → error with guidance, folding into #904's resolver work if still open). Recorded in this spec's Out of Scope line; that IS the handoff. Rejected: filing a follow-up issue from this branch (Q5=B — duplicates the tracking artifact), adding a handoff doc in this repo (Q5=C — third surface with no reader benefit). | Q5=A |

## Invocation-vs-`--help` mapping (audit surface, day one expected state)

Sourced by grepping `packages/claude-plugin-cockpit/commands/*.md` for `generacy cockpit <verb>` (fenced + Q2=B inline). Distinct verbs enumerated at implement time; the expected set based on current playbook prose:

| Verb | Snapshot file | Expected `--help` argument-kind token | Playbook invocation sites (expected day-one) |
|------|---------------|---------------------------------------|----------------------------------------------|
| `merge` | `help-snapshots/merge.txt` | `<issue>` | `auto.md` D.5 step 2 (post-fix), `merge.md` step 4 (post-fix in the frontmatter-rename sweep) |
| `advance` | `help-snapshots/advance.txt` | `<issue-ref>` (or whatever `--help` says) | `auto.md` D.1, D.2, D.3, D.4, D.7, D.8, D.11; `clarify.md`, `review.md` |
| `resume` | `help-snapshots/resume.txt` | `<issue-ref>` (or whatever `--help` says) | `auto.md` D.7 |
| `queue` | `help-snapshots/queue.txt` | `<epic-ref>` + `<phase>` (or whatever `--help` says) | `auto.md` D.8; `queue.md` |
| `context` | `help-snapshots/context.txt` | `<issue-ref>` (or whatever `--help` says) | `auto.md` D.1; `clarify.md` |
| `status` | `help-snapshots/status.txt` | `<epic-ref>` (or whatever `--help` says) | `auto.md` steps 3, 4a, 5 (multiple sites); `status.md` |
| `watch` | `help-snapshots/watch.txt` | `<epic-ref>` (or whatever `--help` says) | `auto.md` step 2; `watch.md` |

**Audit assertion (398-1)**: `∀ invocation ∈ commands/*.md (per Q2=B rules): invocation.argument-kind-token === helpSnapshot(invocation.verb).usage-argument-kind-token`. Day one: all invocations match; audit green. If a pre-existing sibling-playbook drift is discovered during implement, fix it verbatim in the same PR — the audit is exhaustive by design.

**Regression assertion (398-2)**: feeding `tests/fixtures/398-drift-auto.md` through the same parser + audit MUST report `{file: "398-drift-auto.md", verb: "merge", observed: "<pr-ref>", expected: "<issue>"}`. Positive-signal check — guards against the audit silently degrading to no-op via a regex-scope bug or an unnoticed refactor.

## Verification Layering

Static (necessary but not sufficient — the #384–#396 experience proved static-only fails at behavioral defects):

- `auto.md` D.5 dispatch step 2 contains the exact string `generacy cockpit merge <issue>` (positive greppable anchor).
- `auto.md` D.5 dispatch step 2 does NOT contain the string `<pr-ref>` (negative anchor — the smoking gun for this finding).
- `merge.md`'s frontmatter contains `name: issue` (positive anchor for the argument rename).
- `merge.md` does NOT contain `<pr-ref>` anywhere (negative anchor — the same drift at the slash-command surface).
- `tests/fixtures/help-snapshots/` contains one `<verb>.txt` file per distinct verb invoked from `commands/*.md`; each file starts with a `# captured from: generacy --version <X.Y.Z>` header line.
- `scripts/refresh-help-snapshots.sh` exists, is executable, and its shebang line is `#!/usr/bin/env bash` (or the repo-standard equivalent).
- `git diff origin/develop -- packages/claude-plugin-cockpit/commands/{clarify,review,queue,watch,status}.md` — sibling-playbook diff is either empty (no pre-existing drift) or is the co-located token substitutions the audit revealed (see § Complexity Tracking constraint on sibling drift).
- Historical spec directories show zero changes on this branch.
- `auto.md` § Invariants section shows zero changes (no new §8).

Behavioral (evidence, not proof — two assertions appended to `tests/playbook-verification.test.ts`):

- **398-1 (drift audit — FR-004 shape from spec)**: read all `commands/*.md`, parse every `generacy cockpit <verb>` invocation per Q2=B extraction rules, cross-check each argument-kind token against `tests/fixtures/help-snapshots/<verb>.txt`, assert the mismatch list is empty. Fails on any pre-existing drift (day-one green expected) and on any future edit that introduces new drift.
- **398-2 (positive-signal regression — FR-005 shape from spec)**: feed `tests/fixtures/398-drift-auto.md` through the same parser + audit, assert the exact `{observed: '<pr-ref>', expected: '<issue>'}` mismatch is reported for the D.5 invocation site. This is the machine-checkable proof that the audit's regex logic isn't vacuous — if a future refactor accidentally scopes the parser to fenced blocks only (Q2=A regression), 398-2 fails first, before real playbook drift can silently pass.

True verifier:

- A re-run of the cockpit v1.5 auto-mode integration smoke test on the T-S6 corpus (an epic with at least one issue reaching `completed:validate` + green, driving through `auto.md` D.5). The auto session follows the corrected D.5 prose and invokes `generacy cockpit merge <issue-ref>` on the first attempt — no PR-number-passed → resolver-confusion → diagnosis-round-burn. Adherence is probabilistic; the corrected prose + audit backstop remove the class of failure by construction; the regression fixture is defense-in-depth against future D.5-style drift at any playbook surface. Empirical confirmation across a variety of runs is the true verifier (SC pattern parallel to #394's SC-001 and #396's 0-silent-stalls).
