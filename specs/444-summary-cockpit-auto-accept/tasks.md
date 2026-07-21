# Tasks: `/cockpit:auto` Form 4 — issue-number list with workspace-repo inference

**Input**: Design documents from `/specs/444-summary-cockpit-auto-accept/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = "workspace-repo Form 4"; all work here backs the single primary story)

---

## Phase 1: Setup & context grounding

- [X] T001 [US1] Read the existing Form 3 `--new` implementation in `packages/claude-plugin-cockpit/commands/auto.md` (step 1 forms list at lines ~21–27; the `gh issue create` shape at line ~640; the ambiguity-error branch). This is the exact prose surface Form 4 extends — copy its cadence, its bullet shapes, and its `Print + exit` failure vocabulary. Do NOT skim: subsequent tasks assume you know how the step reads today.
- [X] T002 [P] [US1] Read the prior-art library patterns to match style, exports, and testing conventions:
  - `packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts` (parser + validation shape)
  - `packages/claude-plugin-cockpit/lib/intent-recognition.ts` (pure-function + discriminated-union shape)
- [X] T003 [P] [US1] Read `specs/416-operator-requested-capability/contracts/invocation-forms.md` end-to-end. The new `contracts/invocation-form-4-parse.md` extends #416 by reference — do NOT rewrite #416's content or duplicate its rules; add only Form 4 delta.

---

## Phase 2: Reference-implementation library (`lib/invocation-form-4.ts`)

<!-- Phase boundary: Complete Phase 1 before starting Phase 2 — the library encodes rules from research.md that assume you've read the prior-art libs. -->

- [X] T010 [US1] Create `packages/claude-plugin-cockpit/lib/invocation-form-4.ts` with the ten types from `data-model.md`: `RawInvocation`, `ParsedTokens`, `InvocationForm` (discriminated union), `QualifiedRef`, `WorkspaceRepo`, `ResolvedRefSet`, `RefValidationResult`, `TrackingReuseCandidate`, `TrackingIssueSeed`, `Form4Outcome`. Export every type. No runtime deps.
- [X] T011 [US1] In `lib/invocation-form-4.ts`, implement `parseTokens(rawArguments: string): ParsedTokens`. Split rule: `rawArguments.split(/[,\s]+/).filter(t => t.length > 0)` (Q5=A: silent empty-token discard). Detect `--tracking`, `--new`, and any other `--*` as `flags.unknown`. Return `isEmpty: true` when zero non-empty tokens after splitting.
- [X] T012 [US1] In `lib/invocation-form-4.ts`, implement `dispatchForm(parsed: ParsedTokens): InvocationForm`. Follow the seven-step dispatch rule in `data-model.md § E3`. Order matters — `both-flags` before `unknown-flag`; `--tracking`/`--new` before positional shape checks; single `owner/repo#N` → epic before Form 4 catch-all.
- [X] T013 [US1] In `lib/invocation-form-4.ts`, implement `parseWorkspaceRepo(originUrl: string): WorkspaceRepo | null`. Accept all three GitHub remote URL shapes from `data-model.md § E5` (HTTPS, SSH shorthand, SSH long form). Return `null` for non-GitHub origins; caller emits the diagnostic.
- [X] T014 [US1] In `lib/invocation-form-4.ts`, implement `resolveRefs(tokens: string[], workspace: WorkspaceRepo): ResolvedRefSet`. Bare integers (`^\d+$`) resolve to `{ ...workspace, number, supplied: "bare" }`; qualified `owner/repo#N` resolve to `{ owner, repo, number, supplied: "qualified" }`. Dedup in first-seen order using `QualifiedRef` equality (owner + repo + number, ignoring `supplied`). This is Q3=A verbatim.
- [X] T015 [US1] In `lib/invocation-form-4.ts`, implement `formatTitle(refs: QualifiedRef[], workspace: WorkspaceRepo, dateUtc: string): string`. Rule (Q1=A / R5): `Tracking: auto session <YYYY-MM-DD> — <ref1> <ref2> ... <ref5> (+K more)`. Short-form (`#N`) when ref is workspace-local; qualified (`owner/repo#N`) otherwise. `(+K more)` suffix only when `refs.length > 5`.
- [X] T016 [US1] In `lib/invocation-form-4.ts`, implement `formatBody(refs: QualifiedRef[]): string`. Emit `- [ ] owner/repo#N` line per ref, one line each, no blank lines, no headings, no `## Ad-hoc` section (R7). Every ref rendered in fully-qualified form regardless of workspace-locality.
- [X] T017 [US1] In `lib/invocation-form-4.ts`, implement `refSetEqual(a: QualifiedRef[], b: QualifiedRef[]): boolean`. Order-agnostic, dedup-agnostic set compare on `(owner, repo, number)` (R4). Used by reuse detection to compare this invocation's set against each candidate's parsed body-refs.
- [X] T018 [US1] In `lib/invocation-form-4.ts`, implement `parseBodyRefs(body: string): QualifiedRef[]`. Regex: `^\s*- \[ \] ([\w.-]+)\/([\w.-]+)#(\d+)\s*$` per line (case-sensitive, whitespace-tolerant leading, ignore other bullets). Every match yields `{ owner, repo, number, supplied: "qualified" }`. This is the reuse-detection body parse from R3.

---

## Phase 3: Library tests + fixtures

<!-- Phase boundary: Complete Phase 2 — every test in this phase pulls from lib/invocation-form-4.ts exports. -->

- [X] T020 [P] [US1] Create fixtures under `packages/claude-plugin-cockpit/tests/fixtures/444-*`:
  - `444-parse-tokens-single-bare.txt` → `512`
  - `444-parse-tokens-multi-comma.txt` → `512, 513, 514`
  - `444-parse-tokens-multi-space.txt` → `512 513 514`
  - `444-parse-tokens-mixed.txt` → `512 other/repo#41, 513`
  - `444-parse-tokens-trailing-comma.txt` → `512,, 513,,`
  - `444-parse-tokens-unknown-flag.txt` → `--tracing 512`
  - `444-parse-tokens-both-flags.txt` → `--tracking foo/bar#1 --new "x"`
  - `444-body-reuse-hit.md` (existing tracking issue body with exact ref-set)
  - `444-body-reuse-miss.md` (existing tracking issue body with superset — reuse must NOT fire)
- [X] T021 [US1] Add a new `describe("444 — /cockpit:auto Form 4 — token parsing, dispatch, and library contracts", ...)` block in `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`. Do not weave into an existing describe. Include:
  - `444-lib-1 parseTokens` — empty-token discard (Q5=A), trailing-comma tolerance, whitespace normalization
  - `444-lib-2 dispatchForm` — seven-branch table from `data-model.md § E3`
  - `444-lib-3 parseWorkspaceRepo` — HTTPS, SSH shorthand, SSH long form all parse; GitLab / non-GitHub returns `null`
  - `444-lib-4 resolveRefs` — bare-and-qualified dedup collapses `512` and `workspace/repo#512` to one; first-seen order preserved
  - `444-lib-5 formatTitle` — ≤5 refs inline, `(+K more)` for >5, short-form vs qualified rendering
  - `444-lib-6 formatBody` — every line fully-qualified regardless of workspace-locality
  - `444-lib-7 refSetEqual + parseBodyRefs` — reuse HIT on identical set; reuse MISS on overlapping set; malformed body lines ignored
- [X] T022 [US1] Ensure new tests run under `pnpm --filter @generacy-ai/claude-plugin-cockpit test` (or the workspace test invocation currently used by the plugin). Fix imports and vitest paths if needed.

---

## Phase 4: Contracts

<!-- Phase boundary: Complete Phase 3 — contracts must pin what the library provably does. -->

- [X] T030 [P] [US1] Create `specs/444-summary-cockpit-auto-accept/contracts/invocation-form-4-parse.md`. Content: the token-split rule, the dispatch table (E3), the ambiguity extension table (R9), origin-parse rule (E5 accepting three URL shapes). Reference `specs/416-operator-requested-capability/contracts/invocation-forms.md` for the base; do not duplicate.
- [X] T031 [P] [US1] Create `specs/444-summary-cockpit-auto-accept/contracts/ref-validation.md`. Content: `gh api repos/<owner>/<repo>/issues/<n>` probe shape, success codes (200, 301), aggregated diagnostic format from R2 (verbatim block), atomicity guarantee (create nothing on any failure — Q4=A).
- [X] T032 [P] [US1] Create `specs/444-summary-cockpit-auto-accept/contracts/tracking-issue-reuse.md`. Content: `gh issue list --repo <workspace> --label cockpit:tracking --state open` query, body-parse regex, set-equality semantics (R4), reuse-notice format (R3), oldest-tiebreaker rule (E8).
- [X] T033 [P] [US1] Create `specs/444-summary-cockpit-auto-accept/contracts/tracking-issue-body.md`. Content: title convention with truncation rule (R5), body shape (R7, flat qualified task list), `cockpit:tracking` label creation (R6, idempotent), ledger-header value `form: tracking-list` (R8).

---

## Phase 5: Playbook edit — `commands/auto.md`

<!-- Phase boundary: Contracts land first so the prose edit can reference them by name. -->

- [X] T040 [US1] Edit `packages/claude-plugin-cockpit/commands/auto.md` step 1 to add Form 4 to the forms list (after the existing three bullets at lines ~21–27). Bullet must state: "`/cockpit:auto <issue-list>` — one or more comma/whitespace-separated GitHub issue references (bare integers resolve against the workspace repo, or qualified `owner/repo#N`; mix freely)."
- [X] T041 [US1] In `commands/auto.md` step 1, extend the usage string to: `Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>`. This is the exact string pinned by the future 444-2 test.
- [X] T042 [US1] In `commands/auto.md` step 1, add the ambiguity-table rows from `research.md § R9` in prose: (a) single positional matching `owner/repo#N` stays epic mode; (b) any other non-flag positional stream → Form 4; (c) flag combined with a positional list → usage error; (d) both flags present → usage error; (e) zero non-empty tokens → usage error.
- [X] T043 [US1] In `commands/auto.md` step 1, add the Form 4 branch prose: workspace-repo inference via Bash `git remote get-url origin` (running in the operator's session, before any MCP tool binds — cite R1); ref validation via `gh api` with the R2 aggregated diagnostic; reuse detection via `gh issue list --label cockpit:tracking --state open` with the R3 reuse-notice format; on miss, `gh label create cockpit:tracking` (idempotent — swallow "already exists") then `gh issue create --title ... --body-file ... --label cockpit:tracking`. Explicitly cite the four load-bearing Q answers by number (Q1=A, Q2=B, Q3=A, Q4=A, Q5=A) so the test-audit can pin them.
- [X] T044 [US1] In `commands/auto.md` step 1, add the ledger-header emit: `Tracking ref: <new-ref> · form: tracking-list` for freshly-created Form 4 sessions; the reuse path emits `form: tracking-existing` (per R8). This is the fourth `form:` value; every grep of "form:" in ledger post-mortems must find it.
- [X] T045 [US1] Confirm the invariants section (§ Invariants) needs NO update — Form 4 preserves "never merge on red", "every gate prompts", and every other pinned invariant. If any invariant wording tension is discovered during T040–T044, STOP and re-open plan.md instead of relaxing an invariant.

---

## Phase 6: Verification — playbook-verification re-pinning (MANDATORY)

<!-- Phase boundary: The playbook edit must land before you know what heading/contract shape to pin. -->

- [X] T050 [US1] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
  for every heading and contract rule this edit changes.
  Files edited by this issue: `packages/claude-plugin-cockpit/commands/auto.md`
  Pin sites that read the edited file(s):
    - :286: `396-3: drift audit — every GATE_VOCABULARY token has a Trigger match in auto.md § Dispatch` (`readFileSync(AUTO_MD_PATH)` → § Dispatch scan). Form 4 adds no dispatch class, so this pin should still pass; re-verify after editing.
    - :515: `398-1 (drift audit): every commands/*.md invocation matches its --help snapshot argument-kind token` (`readdirSync(COMMANDS_DIR)` sweep — covers every commands/*.md including auto.md, invocation-vs-help drift).
    - :1101, :1118: `402-*` AskUserQuestion contract audits (`readFileSync(AUTO_MD_PATH)` + `extractSubheadingBlock(...)` on gate subheadings). Form 4 introduces no gate, but verify no unintended subheading rename slipped in.
    - :1517, :1556, :1570, :1596: `406-3 / 406-4 / 406-5 / 406-6` (`readFileSync(AUTO_MD_PATH)` + `extractInstructionsSteps(...)` — reads steps 2/3/4 + § Invariants). Form 4 only edits step 1; these pins should hold unchanged.
    - :2361: `433-1` doorbell probe (`readFileSync(AUTO_MD_PATH)` — verb-existence probe string). Unchanged by Form 4.
    - :2406, :2429, :2468, :2498, :2512, :2541: `437-1 … 437-6` (`readFileSync(AUTO_MD_PATH)` + `extractSubheadingBlock(...)` on D.1–D.11 / § Ledger / § Invariants). Form 4 edits step 1 only; these pins should hold unchanged.
  Re-pinning means updating the assertion to the NEW contract.
  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit;
  weakening it deletes its value.
  If no existing pin fails after the Form 4 edit, add the three new `444-*` pins below and mark this task complete; verify manually before shipping.
- [X] T051 [US1] Add pin `444-1 form-list pin` in `tests/playbook-verification.test.ts`. Read auto.md step 1 via `extractInstructionsSteps(autoMd).get(1)`; assert step 1 contains exactly four Form bullets in order (epic, tracking-existing, tracking-new, tracking-list); assert each form's usage-string fragment appears once. Rationale: catches silent regression of the form list (adding/removing/renaming any form).
- [X] T052 [US1] Add pin `444-2 usage-string pin` in `tests/playbook-verification.test.ts`. Assert step 1 contains the literal string `Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>`. Fails if the fourth form disappears from the usage line.
- [X] T053 [US1] Add pin `444-3 cockpit:tracking label prose pin` in `tests/playbook-verification.test.ts`. Assert the literal string `cockpit:tracking` appears at least once in auto.md step 1's Form 4 branch (positive pin for label creation) AND at least once in `contracts/tracking-issue-body.md` (positive pin for contract). Add both sides so contract and prose can't drift apart silently.
- [X] T054 [US1] Run the full test suite one time end-to-end (`pnpm test` from workspace root or the plugin filter). Expect all previously-green tests to remain green; new 444-* tests to pass. Report the delta count.

---

## Phase 7: Quickstart & docs

<!-- Phase boundary: docs pin behavior demonstrated by tests. -->

- [X] T060 [US1] Confirm `specs/444-summary-cockpit-auto-accept/quickstart.md` matches the final playbook prose. Cross-check: usage examples, error diagnostics (workspace-repo failure, non-GitHub origin, bad refs, empty invocation, unknown flag), reuse-notice format, ledger `form:` value. Update quickstart if the playbook edit diverged from planning drafts.
- [X] T061 [US1] Grep for any operator-facing README in `packages/claude-plugin-cockpit/README*` describing existing forms 1–3. If it lists forms, add form 4. If it does not, do NOT add speculative doc surface — spec.md and quickstart.md are authoritative.

---

## Dependencies & Execution Order

**Sequential phase boundaries**:
Phase 1 (setup) → Phase 2 (library) → Phase 3 (library tests + fixtures) → Phase 4 (contracts) → Phase 5 (playbook edit) → Phase 6 (verification) → Phase 7 (docs).

**Parallel opportunities**:
- T002 and T003 (Phase 1) run in parallel — different files, read-only.
- T030–T033 (Phase 4 contracts) all run in parallel — four independent files.
- T020 (fixtures) and T021 (test block) share the `tests/` directory but touch different files; keep sequential to avoid confusion during implementation.

**Cross-cutting checkpoint**: T045 (invariants check) is a stop-and-re-plan gate. If any invariant wording tension appears during T040–T044, do NOT relax an invariant; STOP and revisit plan.md.

**Test-first opportunity**: T020 (fixtures) may land before T010–T018 (library) if you want a TDD flow — then T021 tests fail red until T010–T018 land. Optional; both orderings are valid.

---

*Generated by speckit /tasks*
