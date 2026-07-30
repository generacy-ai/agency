# Research: `/cockpit:auto` Form 4

Rationale, alternatives considered, and prior art referenced during planning. Every load-bearing choice traces to either a clarification answer (Q1–Q5 in `clarifications.md`) or an existing pattern in the plugin.

## R1 — Where does bare-number resolution happen?

**Decision**: Plugin-side (in the operator's Claude Code session, at slash-command time, before any MCP tool call fires).

**Why**: The cockpit MCP server runs in the orchestrator container (per `packages/claude-plugin-cockpit/commands/auto.md` step 3 "Startup sweep" — the seven `cockpit_*` MCP tools are registered per cluster-base#75; the tools' host process has no meaningful `cwd` relative to the operator's git checkout). Any `git remote get-url origin` invoked inside a MCP tool would read the orchestrator's filesystem, not the operator's — the wrong repo, or no repo at all. The only surface with the correct `cwd` is the operator's own shell session, which the model reaches via its `Bash` tool.

**Alternatives considered**:
- **New MCP tool `cockpit_resolve_bare_refs(cwd, tokens)`** — rejected. Would require passing `cwd` explicitly through every call (fragile — operators frequently invoke skills from subdirectories); would need a new schema surface, contradicting spec § "Out of scope" bullet 1 ("No engine/MCP schema changes"); and would still need a Bash step to capture `cwd` first.
- **Model reasoning about the repo from context alone** — rejected. Non-deterministic; would fail silently when the operator's cwd is not a git repo.

**Prior art**: `auto.md` step 1 already runs pre-flight Bash (`command -v generacy`, `gh auth status`, `mkdir -p .generacy/cockpit/auto-runs`) in the operator's session before any MCP tool binds. Form 4's resolution slots into the same pre-flight window.

**Failure mode**: If `git remote get-url origin` returns non-zero, or its output does not parse as a GitHub HTTPS/SSH URL (`https://github.com/<owner>/<repo>(.git)?`, `git@github.com:<owner>/<repo>(.git)?`, `ssh://git@github.com/<owner>/<repo>(.git)?`), print a diagnostic ("`/cockpit:auto` needs a workspace with a GitHub `origin` to resolve bare issue numbers; got `<observed>`") and exit non-zero **before any issue is created**. Contract details in `contracts/invocation-form-4-parse.md § R1 origin-parse rule`.

## R2 — Ref validation: up-front or lazy?

**Decision**: Up-front `gh api repos/<owner>/<repo>/issues/<n>` for every resolved ref; aggregate all failures into one diagnostic naming ALL bad refs; create nothing on any failure.

**Why (verbatim from Q4=A)**: A tracking issue referencing nonexistent numbers produces confusing engine behavior that's much harder to diagnose than an upfront error. Validation is a handful of REST reads (cheap even against the operator's default `gh` rate limits — the max ref-list size before the title-truncation regime kicks in is small in practice).

**Aggregation rule**: Diagnostic names ALL bad refs (not just the first) — reduces the "fix one → re-run → hit the next" tax when the operator pastes a stale list from an issue-tracker export. Contract shape:

```
Cannot create tracking issue — the following refs are missing or inaccessible:
  - owner/repo#999   (404 Not Found)
  - other/repo#12    (403 Forbidden — token lacks access)
Fix or remove these refs and re-run.
```

**Alternatives considered**:
- **Skip validation** — rejected in Q4=A.
- **Validate bare-resolved only, trust qualified refs** — rejected in Q4=A. A cross-repo `other/repo#12` typo produces the same confusing engine behavior as a bare-number typo; the operator's intent for pasting the ref is identical.

**Prior art**: None in the plugin — Form 3's `--new` creates the tracking issue from operator-supplied prose without validating any refs (there are none to validate at that point). Form 4 is the first invocation form where the operator supplies a set of refs at invocation time.

## R3 — Reuse detection: query shape

**Decision**: `gh issue list --repo <workspace-owner>/<workspace-repo> --label cockpit:tracking --state open --json number,body,title` in the operator's session; for each candidate, parse `- [ ] owner/repo#N` lines out of the body (whitespace-tolerant, ignore other bullets); compare the resulting resolved-ref set to this invocation's set for **exact** equality.

**Why**: `gh issue list --label X --state open` is the natural workspace-scoped index — GitHub's own label filter is the intended surface for "find synthetic containers." The `cockpit:tracking` label is added at Form 4 creation time (see R6), so it identifies exactly the class of issues eligible for reuse. Body-parse is a bounded regex against `- [ ] <owner>/<repo>#<n>` lines (the exact shape Form 4 writes at creation).

**Set-equality rule**: Both sides normalize to `Set<{owner, repo, number}>` after dedup; equality is `size equal AND every element in one is in the other`. Order does not matter. This is the same semantics as the engine's `allRefs` dedup (spec § Changes bullet 3), just applied plugin-side at reuse-detection time.

**Alternatives considered**:
- **GraphQL search across all issues** — rejected as heavier without added signal; workspace-repo scope + label filter is precise enough.
- **Overlap-based reuse (any shared ref → reuse)** — rejected in Q2 ("overlapping-but-not-identical ref-sets do NOT trigger reuse or refusal — create a fresh tracking issue"). Overlap is legitimate parallel/split work.
- **Refuse on overlap** — rejected in Q2 (D option) as hostile.

**Reuse notice** (printed before the standard startup line):

```
Resuming existing tracking session <owner>/<repo>#<n> (open since <YYYY-MM-DD HH:MM>) — ref-set matches this invocation exactly.
```

## R4 — Ref-set equality: bare vs qualified

**Decision**: Compare fully-qualified resolved refs. `512` and `owner/repo#512` (where `owner/repo` is the workspace repo) collapse to one element (Q3=A dedup rule) before equality is tested.

**Why**: Q3=A pins first-seen-order dedup at invocation time; the same normalization powers reuse detection. Bare tokens without dedup would report false-negative reuse ("`512, 513`" and "`513, 512`" would look like different sets).

## R5 — Title truncation

**Decision (Q1=A)**: Up to 5 refs inline, then ` (+K more)` where K is the remaining count. Example: `Tracking: auto session 2026-07-21 — #223 #224 #226 #227 #228 (+3 more)`.

**Why**:
- GitHub issue titles have a 256-char cap. Five qualified refs of the shape `owner-name/repo-name#12345` (~24 chars each) + prefix + separators = ~200 chars — safely under.
- Five is the natural threshold above which a reader stops scanning left-to-right (see also spec-kit issue-title conventions across the repo). Above 5, the count is more useful than the tail.
- **Formatting rule**: refs render short-form (`#N`) when the resolved repo is the workspace repo; qualified form (`owner/repo#N`) otherwise. Truncation counts on the render.

**Alternatives considered**:
- **3-then-more** (Q1 option B) — rejected as too aggressive; a 4-ref invocation would lose one ref off the title.
- **Char-cap with `…`** (Q1 option C) — rejected as harder to scan and less deterministic across mixed bare/qualified inputs.
- **Drop refs entirely once N>5** (Q1 option D) — rejected. The first N refs are the highest-signal preview of the session's scope; dropping them makes the title less informative than a plain "N issues" prefix.

## R6 — `cockpit:tracking` label

**Decision**: Apply on every Form-4-created tracking issue; create the label idempotently (`gh label create cockpit:tracking --color <?> --description "Auto-created tracking issue for /cockpit:auto"` — swallow "already exists" errors).

**Why**: Reuse detection (R3) needs a label filter to scope the candidate set correctly. Without a label, the query would either miss (searching by title convention is fragile; the convention may drift or the operator may edit titles) or over-match (searching by body pattern would return every issue that happened to include a task list).

**Prior art**: No existing `cockpit:tracking` label in the plugin (grep confirmed) — this is a fresh label. Color choice is aesthetic; suggest a neutral gray (`#cccccc`) so the label reads as "meta / synthetic" rather than a state.

## R7 — Body shape: flat qualified task list

**Decision**: Body is a flat markdown task list of fully-qualified refs:

```
- [ ] owner/repo#223
- [ ] owner/repo#224
- [ ] other/repo#41
```

No phase headings, no per-ref prose, no "Ad-hoc" section (mid-run `cockpit_scope_add` additions still land in `## Ad-hoc` as today; this rule is about the seed body only, not the running state).

**Why (spec § Changes bullet 3)**: The engine's resolver rejects bare `#N` in bodies — every ref must be `owner/repo#N`. The engine already supports flat scope bodies; terminal condition is the existing G.7 scope-drained gate (no engine change needed).

**Alternatives considered**:
- **Bare `#N` in the body when the ref is workspace-local** — rejected in spec § Changes bullet 3 ("the engine's resolver rejects bare `#N` in bodies today"). The engine change to support this is out of scope.
- **Inline phase grouping** — rejected in spec § Out of scope bullet 2.

## R8 — Reuse of Form 3's `gh issue create` path

**Decision**: Reuse the exact `gh issue create --title <t> --body-file <f> --label cockpit:tracking` shape from `auto.md` line 640 (Form 3's file-new path). Skip Form 3's G.6 filing gate entirely — Form 4 has no operator title to confirm; the title is machine-generated from the resolved ref-set + date (R5).

**Why**: Zero risk of behavioral drift on the "file the tracking issue" mechanic; every operator-visible surface after creation (ledger header, startup line, doorbell arm-up, sweep) is byte-identical to Forms 2/3 after the ref is known. Deleting Form 3's G.6 for Form 4 is safe because G.6's purpose is confirming an operator-typed free-text title before it hits GitHub — Form 4 has no such free text.

**Ledger header** (spec-implied): Written as `Tracking ref: <new-ref> · form: tracking-list` immediately after `gh issue create` succeeds. Adds a fourth `form:` value (`tracking-list`) to the existing three (`epic | tracking-existing | tracking-new`). Reuse-path invocations (R3 hit) write `form: tracking-existing` (they proceed as Form 2 against the pre-existing ref; the invocation form itself is not the identity of the run).

## R9 — Ambiguity table extension

**Existing rules** (`auto.md` step 1, `contracts/invocation-forms.md` at `specs/416-.../contracts/invocation-forms.md`):
- Presence of `--tracking` → Form 2.
- Presence of `--new` → Form 3.
- One positional matching `<owner>/<repo>#<n>` and no flags → Form 1.
- Anything else → usage error.

**New rules for Form 4** (extending the ambiguity table):

| Input pattern | Form | Notes |
|---------------|------|-------|
| One positional matching `<owner>/<repo>#<n>` and no flags | 1 (epic) | Unchanged. Qualified single ref keeps epic-mode meaning. |
| `--tracking <owner>/<repo>#<n>` | 2 | Unchanged. |
| `--new "<title>"` | 3 | Unchanged. |
| Any other non-flag positional stream (bare numbers, mixed lists, multiple qualified refs, single bare number) | **4 (issue-number list)** | New. |
| Both `--tracking` and `--new` present | usage error | Existing rule; unchanged. |
| A flag (`--tracking` / `--new`) combined with a positional list | usage error | New (extension of "ambiguous input"). |
| Zero non-empty tokens after splitting | usage error | New (Q5=A boundary). |

**Backward compatibility**: Every Form-1/2/3 invocation shape parses to the same form as before. The only newly-accepted input class is "a positional stream that would have been usage-error under pre-#444 auto.md" — a strict superset expansion.

## R10 — Test pinning strategy

**Existing pins**:
- `396-3 drift audit`: cross-checks every `GATE_VOCABULARY` token against auto.md § Dispatch. **Not affected by Form 4** (no new dispatch class).
- `398-1 invocation-vs-help drift`: pins `generacy cockpit watch` positionals only. **Not affected**.
- `402-1 AskUserQuestion contract audit`: structural check for the contract section + ≤4 bound + gate cross-references. **Not affected** — Form 4 introduces no gate.

**Re-pins required**:
- **step-1 form list**: The existing 396/402 audits do NOT pin the form list, but a new `444-1 form-list pin` should be added to prevent silent regression as forms drift. Test: parse step 1's bullet list; assert exactly four forms in order (`epic`, `tracking-existing`, `tracking-new`, `tracking-list`); assert each form's usage-string fragment appears once.
- **usage string**: Add a `444-2` test that greps auto.md for the extended `Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>` line; fails if the fourth form disappears.
- **label prose**: Add a `444-3` test asserting the `cockpit:tracking` label string appears at least once in auto.md's step 1 (Form 4 branch) and once in the tracking-issue-body contract.

**New reference-implementation coverage** (in `lib/invocation-form-4.ts`):
- Token splitting (comma + whitespace, empty-token discard, trailing-comma tolerance).
- Bare vs qualified detection + resolution against a caller-supplied `workspaceRepo`.
- Dedup: first-seen order preserved; `512` and `workspace/repo#512` collapse to one entry.
- Title formatting: ≤5 inline, then ` (+K more)`; short-form (`#N`) for workspace-local, qualified (`owner/repo#N`) otherwise.
- Ref-set equality: order-agnostic set compare after normalization.

Test fixtures live under `packages/claude-plugin-cockpit/tests/fixtures/444-*` — invocation-string → expected-parsed-form; parsed-form → expected-title; two candidate bodies → equality verdict.

## R11 — Non-goals confirmed

- **No engine change.** All four spec § Out of scope bullets are honored: no MCP schema, no phase grouping, no parallel-session lease, no engine resolver relaxation for bare `#N` in bodies.
- **No new gate.** Form 4 does not introduce a G.6-shaped filing gate (the machine-generated title needs no operator confirmation). Every failure mode is `Print + exit`.
- **No cursor / heartbeat / doorbell change.** Form 4 hands off to `invocationForm: tracking-existing` after tracking-issue creation; the entire main loop (step 4 onward) is unchanged.

## Key sources

- Spec: `/workspaces/agency/specs/444-summary-cockpit-auto-accept/spec.md`
- Clarifications: `/workspaces/agency/specs/444-summary-cockpit-auto-accept/clarifications.md`
- Existing playbook: `/workspaces/agency/packages/claude-plugin-cockpit/commands/auto.md`
- Prior invocation-forms contract: `/workspaces/agency/specs/416-operator-requested-capability/contracts/invocation-forms.md`
- Form 3 file-new implementation: `commands/auto.md` line 640 (gh issue create shape)
- Existing lib pattern: `packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts`, `lib/intent-recognition.ts`
- Playbook-verification harness: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
