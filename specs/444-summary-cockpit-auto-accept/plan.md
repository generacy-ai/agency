# Implementation Plan: `/cockpit:auto` Form 4 — issue-number list with workspace-repo inference

**Feature**: `/cockpit:auto` accepts one or more bare issue numbers (and/or qualified `owner/repo#N` refs) as a comma/whitespace-delimited list; bare numbers resolve against the workspace repo's `origin`; the skill either reuses an existing open `cockpit:tracking` issue whose resolved ref-set is identical, or auto-creates a fresh tracking issue (reusing Form 3 `--new`'s creation path minus the title prompt), then enters the existing epic-less loop against that tracking ref.

**Branch**: `444-summary-cockpit-auto-accept`
**Status**: Complete

## Summary

Add a **Form 4** invocation shape to `/cockpit:auto` in `packages/claude-plugin-cockpit/commands/auto.md`. The change is **playbook-prose-only** on the skill side, plus a small reference-implementation library for token-parsing/dedup/ref-set-equality (matching the `lib/clarification-batch-parser.ts` pattern) and re-pinned playbook-verification tests. **No engine changes, no MCP schema changes** — all four ref-resolution and tracking-issue mechanics live plugin-side (see spec § "Out of scope").

Form 4 fires when the invocation is neither `--tracking` nor `--new` and the positional token stream is not a single `owner/repo#N` (that keeps its current epic-mode meaning). The playbook then:

1. Splits args on commas + whitespace; silently discards empty tokens (Q5=A).
2. Resolves bare numbers against `git remote get-url origin` in the operator's cwd (must be a GitHub origin — fail loudly otherwise).
3. Dedupes resolved refs in first-seen order (Q3=A).
4. Validates every resolved ref via `gh api` for existence + accessibility; on any failure, emits **one diagnostic naming ALL bad refs** and exits without creating anything (Q4=A).
5. Looks up open workspace-repo issues labeled `cockpit:tracking` whose resolved ref-set is **exactly** the same as this invocation's; on hit, reuses (Q2=B — proceeds as `invocationForm: tracking-existing` against that ref, prints a "resuming existing session" notice); on miss, creates a fresh tracking issue via the existing Form 3 `--new` `gh issue create` path.
6. Title convention: `Tracking: auto session YYYY-MM-DD — #N1 #N2 …` up to 5 refs then ` (+K more)` (Q1=A); body is a flat `- [ ] owner/repo#N` task list (fully-qualified — the engine's resolver rejects bare `#N` in bodies); label `cockpit:tracking` (create it if absent).
7. Falls through to the existing `invocationForm: tracking-existing` loop — doorbell + `cockpit_await_events` keyed on the new tracking ref, G.7 scope-drained gate closes the tracking issue when every ref is terminal.

The five clarification answers from `clarifications.md` (Q1–Q5) are fully load-bearing here and are pinned into contracts/ for downstream test authors.

## Technical Context

**Language / runtime**: The skill is playbook prose interpreted by the model at slash-command time; no compile-time code path executes it. The reference-implementation library added under `lib/` is TypeScript, matching existing conventions (`packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts`, `lib/intent-recognition.ts`). Tests run under `vitest`, matching `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`.

**Frameworks / dependencies**:
- **No new runtime deps.** Token parsing, dedup, ref-set equality, and title formatting are pure functions.
- **New at model runtime**: `git remote get-url origin` (Bash), `gh api repos/<owner>/<repo>/issues/<n>` (existence probe), `gh label create cockpit:tracking` (idempotent — swallow "already exists"), `gh issue list --label cockpit:tracking --state open --json ...` (reuse detection).
- **Reused verbatim from Form 3**: the `gh issue create --title <t> --body-file <f> --label cockpit:tracking` shape at `commands/auto.md` line 640; the `cockpit_scope_add` + `cockpit_queue` post-create sequence is NOT reused — Form 4 seeds the tracking issue with a flat task-list body up front, so the engine picks up the refs on its first scope pass; step 4's synthetic-event sweep dispatches each ref.

**Boundaries preserved**:
- **Plugin-side resolution only.** The cockpit MCP server runs in the orchestrator container; its cwd is meaningless for `origin` inference. All `git`/`gh` calls happen in the operator's Claude Code session (Bash tool), before any MCP tool call fires.
- **No new MCP tool / no MCP-tool schema change.** Existing `cockpit_status`, `cockpit_await_events`, `cockpit_advance`, `cockpit_scope_add`, `cockpit_merge` surfaces cover the downstream loop unchanged.
- **Never merge on red, every gate prompts** — these two hard boundaries from `auto.md` § opening paragraph are unaffected by Form 4.

**Ambiguity rules** (extending `commands/auto.md` step 1):
- Presence of `--tracking` or `--new` still binds Forms 2/3.
- One positional matching `<owner>/<repo>#<n>` and nothing else → Form 1 (epic mode; unchanged meaning).
- Any other non-flag positional stream (bare numbers, mixed lists, multiple qualified refs) → Form 4.
- Zero non-empty tokens after splitting → usage error (existing exit path).
- Both `--tracking` and `--new` present, OR a flag + a mixed list → usage error (extension of existing "ambiguous input" branch).

## Project Structure

```
specs/444-summary-cockpit-auto-accept/
├── spec.md                              (unchanged — read-only)
├── clarifications.md                    (unchanged — read-only, source of Q1–Q5)
├── plan.md                              (this file)
├── research.md                          (technology decisions + rationale)
├── data-model.md                        (types: ParsedInvocation, ResolvedRef, RefValidationResult, TrackingReuseCandidate, RefSetEqualityRule)
├── quickstart.md                        (operator usage + expected output + error modes)
└── contracts/
    ├── invocation-form-4-parse.md      (token-split + resolution + dedup + ambiguity table extension)
    ├── ref-validation.md               (gh api probe shape + aggregated-error diagnostic format)
    ├── tracking-issue-reuse.md         (identical-ref-set detection query + reuse-notice format)
    └── tracking-issue-body.md          (title-truncation rule + label creation + flat-body shape)

packages/claude-plugin-cockpit/
├── commands/auto.md                    (EDIT — step 1 gains Form 4 bullet; usage string extended; ambiguity table updated)
├── lib/invocation-form-4.ts            (NEW — reference implementation of token-split, dedup, title-format, ref-set equality)
└── tests/playbook-verification.test.ts (EDIT — new 444-* describe block; existing 396-3 drift audit re-pinned to include the added step-1 bullet)
```

**Files intentionally not touched**:
- The engine (`generacy` binary, `packages/agency`, cluster containers) — Form 4 is a plugin-side ref-resolver + tracking-issue-creator; the engine consumes the resulting flat-body tracking issue exactly as it consumes today's `--tracking` output.
- Form 3's G.6 filing gate (`auto.md` lines 21–51 + 633–647) — Form 4 skips G.6 entirely (no operator title prompt) and jumps straight to `gh issue create` with the machine-generated title/body/label. The gate is unique to Form 3 by design (Q2=B reuse path also skips G.6 — the tracking issue already exists).
- The existing invocation-forms contract at `specs/416-operator-requested-capability/contracts/invocation-forms.md` — the new `contracts/invocation-form-4-parse.md` extends that contract by reference, not by rewrite. Cross-repo contract-file mutation would trigger a re-verification loop on #416.

## Constitution Check

**No `.specify/memory/constitution.md` exists** in this repo, so there is no project-level constitution to check against. Applying the cockpit-plugin CLAUDE.md pins by hand:

- ✅ **Playbook pin discipline** (CLAUDE.md § "Cockpit playbook pins"): `tests/playbook-verification.test.ts` pins every `commands/*.md` by heading strings and contract rules; heading renames and step additions break assertions on purpose. This plan **re-pins** the 396-3 drift audit and adds a new `444-*` describe block for Form 4's ambiguity table + usage-string + label-creation contract, rather than weakening the existing pins. Explicitly called out in spec.md acceptance criteria (final bullet).
- ✅ **Never merge on red** / **every gate prompts** (`auto.md` opening paragraph): Form 4 introduces no new merge path and no auto-approve — the operator's decision surface is unchanged after the tracking issue is created. Form 4 has no gate of its own; usage-error / bad-ref / non-git-repo failures are `Print + exit`, not gates (the operator cannot recover from these in-session; a prompt whose every option means "abort" is not a decision, per `auto.md` step 3's tool-presence-check precedent at line 64).
- ✅ **Playbook-first, code-second** (existing pattern at `lib/clarification-batch-parser.ts`): pure functions in `lib/invocation-form-4.ts` are a reference implementation of the prose, not the source of truth. Tests exercise the library; the prose is what the model interprets.
- ✅ **No new external systems / no new APIs**: `gh api` and `git remote get-url origin` are already assumed by every playbook that runs `gh issue create` (Form 3) and by pre-flight's `command -v generacy` (step 1). No new dependency graph edges.

## Key technical decisions (details in research.md)

| Decision | Choice | Alternative rejected |
|----------|--------|----------------------|
| Where does bare-number resolution happen? | Plugin-side (operator's Claude Code session, Bash `git remote get-url origin` before any MCP call) | MCP-side resolver in the cockpit server — rejected because the orchestrator container's cwd is meaningless for workspace inference |
| Ref validation strategy | Up-front `gh api` per resolved ref, aggregate all failures into one diagnostic | Skip validation and let engine surface bad refs — rejected in Q4=A (engine surfaces are much harder to diagnose than an upfront error) |
| Reuse detection query | `gh issue list --label cockpit:tracking --state open --repo <workspace> --json body,number` then parse each body's `- [ ] owner/repo#N` lines and compare as a set | GraphQL project-board query — rejected as heavier without added signal; label + open filter is the natural workspace-scoped index |
| Ref-set equality semantics | Compare the **fully-qualified resolved** set (post-dedup, order-agnostic) | Compare raw tokens — rejected because `512` and `owner/repo#512` are the same ref (Q3=A) |
| Title truncation | Up-to-5 refs then ` (+K more)` (Q1=A) | Char-cap with `…` — rejected as harder to scan and less deterministic across mixed bare/qualified inputs |
| Duplicate handling | Silent dedup, first-seen order (Q3=A) | Reject with diagnostic — rejected in Q3 as punishing a harmless input |
| Empty-token handling | Silent discard (Q5=A) | Usage error — rejected as unfriendly to natural typing artifacts |
| Re-invocation with identical ref-set | Reuse existing open `cockpit:tracking` issue with "resuming existing session" notice (Q2=B) | Always fresh, or refuse — rejected as either wasteful or hostile |
| Where does the flat task-list body land? | Fresh tracking issue body, seeded at creation time | Post-create `cockpit_scope_add` calls — rejected because it multiplies MCP calls with no correctness gain; engine's first scope pass discovers the body's task-list directly |

## Next step

Run `/speckit:tasks` to generate `tasks.md` with dependency-ordered work items derived from this plan + the four contracts.
