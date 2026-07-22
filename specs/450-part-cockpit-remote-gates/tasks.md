# Tasks: Cockpit Remote Gates — End-to-End Dogfood

**Input**: Design documents from `/specs/450-part-cockpit-remote-gates/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/run-report-template.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files/actions, no dependencies)
- **[US1]**: This issue has a single implicit user story — the operator running the dogfood. All tasks are tagged `[US1]`.

**Note on task shape**: this issue ships **evidence**, not product code. The deliverable is a run report attached to issue #450 plus follow-up defects filed on the epic. Tasks below describe the operator's execution flow, not code changes.

## Phase 1: Preflight

- [ ] T001 [US1] Verify P1–P3 deployment prerequisites from `research.md` § Prerequisites are all green against **current state**, not memory:
  - `--gates=ui` present in `packages/claude-plugin-cockpit/commands/auto.md` with the D.12 `gate-answer` dispatch class
  - `cockpit_gate_open` / `cockpit_gate_ack` MCP tools reachable on the current cluster
  - Answers file `/workspaces/.generacy/cockpit/answers.ndjson` written by the orchestrator; doorbell tails it and emits `gate-answer` NDJSON on stdout (trigger one gate manually to observe growth)
  - Cloud inbox reachable at `https://generacy.ai/dashboard/inbox` with the operator's account able to see the driving cluster's org
  - Relay WS is authenticated (smee.io **not** on the answer path — confirm by tailing orchestrator logs while answering)
  Any missing prerequisite is a **blocker on the epic**, not on issue #450 — pause the run and file it.
- [ ] T002 [P] [US1] UI gateType rendering preflight — open a synthetic (or naturally-arriving) gate of each of `clarification`, `artifact-review`, `implementation-review`, `manual-validation`, `escalation`, `phase-queue`, `filing`, `scope-drained` and confirm the inbox renders it (icon, title, options, body). Any type that renders poorly or crashes → file as P3 defect on the epic and continue.
- [ ] T003 [P] [US1] Confirm operator has shell access to the cluster host with permission to modify egress firewall rules or bring down a network interface (needed for the D5 offline test). If neither is available, file a blocker and pause.
- [ ] T004 [P] [US1] Open a working copy of `contracts/run-report-template.md` as a live scratch pad; timestamp the **Meta / Start** field before touching the driver.

## Phase 2: Launch & Epic Selection

- [ ] T005 [US1] Pick the live epic per D1 (Q1 hybrid). Prefer an in-flight epic on `generacy-ai/generacy-cloud` (natural home of the remote-gates epic) that will plausibly hit several gate types as it progresses. Record `owner/repo#N`, title, and current phase in the report's **Meta** section.
- [ ] T006 [US1] Launch the driver: `/cockpit:auto <epic-ref> --gates=ui`. Watch for the one-line `⛩ gate open: … → answer at generacy.ai inbox` pointer each time a gate opens. Confirm the session does **not** block. If it blocks (falls back to local `AskUserQuestion`), record whether `cockpit_gate_open` errored (fallback by design per plan) or the session hung (defect).
- [ ] T007 [US1] Navigate to `https://generacy.ai/dashboard/inbox` in a browser tab, grant notification permission, and confirm the driving cluster's gates stream in live (SSE). Verify each opened gate appears within a few seconds of the driver's pointer line.

## Phase 3: Natural-path Gate Coverage

Answer gates as they arrive; capture evidence per `data-model.md § Fields to record` into the report's **Per-gate evidence** blocks. For each gate, record `gateId`, `gateKey`, `askedAt → answered` and `answered → applied` latencies, ack `outcome` + `detail`, an inbox screenshot, and a link to the GitHub audit artifact carrying UI actor attribution.

- [ ] T008 [US1] Exercise `clarification` batch — answer one clarification batch using **templated options** (recommended verdict). Confirm the marker comment `<!-- generacy-clarification-answers:... -->` on GitHub carries the UI actor's email / display name. Tick the coverage-matrix row.
- [ ] T009 [US1] Exercise `clarification` free-text — on the next (or a forced) clarification batch, submit a **free-text "Make changes"** round. Verify the session parses it with the existing clarification-directive grammar and applies the edits. Tick the coverage-matrix row.
- [ ] T010 [P] [US1] Exercise `artifact-review` (any verdict) — accept the drafted answer or push back. Tick the coverage-matrix row.
- [ ] T011 [P] [US1] Exercise `implementation-review` — **approve** on one PR. Confirm the advance comment on GitHub carries UI actor attribution and the `waiting-for:implementation-review` → `completed:implementation-review` label transition occurs. Tick the row.
- [ ] T012 [P] [US1] Exercise `implementation-review` — **request-changes** on a different PR (or a later revision of the same PR). Confirm the request-changes free-text round-trips as `freeText` and the session opens the next revision. Tick the row.
- [ ] T013 [P] [US1] Exercise `phase-queue` confirm — confirm a phase's issue queue from the inbox. Confirm the phase advances and the `cockpit_advance` audit comment carries UI actor attribution. Tick the row.
- [ ] T014 [P] [US1] Opportunistically record any `manual-validation`, `filing`, or `scope-drained` gates that fire. Not required for coverage-complete but strong evidence — tick their rows if observed.
- [ ] T015 [US1] **Non-blocking behavior check (goal 1 of the epic)** — during any of T008–T014, confirm the dispatcher advances **other** issues while a gate is open on one issue. Capture a dispatch-log excerpt or the second issue's advance timestamp as evidence in the report's **Non-blocking behavior** section. If the session blocks on gates, file as blocker.

## Phase 4: Forced Scenarios

These three gate paths are unlikely to fire naturally; each has a deterministic recipe per D3–D5.

- [ ] T016 [US1] **Escalation (per D3)** — force a red-check merge the bounded fixer cannot repair. Recipe (either works):
  - Add a test file with `expect(true).toBe(false)` and a top-of-file comment `// intentional escalation trigger — do not repair`.
  - Break a required lint / typecheck by referencing a missing dependency the fixer has no template to install.
  Merge attempt → check fails → fixer runs once → check still red → driver escalates → `escalation` gate opens. Answer from the inbox. Preflight-confirm the inbox renders the `escalation` gateType; if it doesn't, file the UI gap as a P3 rough edge and complete the down-path via the local `AskUserQuestion` fallback so the exercise is at least partially covered. Fill the report's **Escalation run** section and tick the coverage-matrix row.
- [ ] T017 [US1] **Supersession (per D4)** — hold a `phase-queue` gate open in the inbox (do **not** answer). Advance the underlying phase by a **separate** route: CLI `cockpit_advance <issue-ref>`, MCP `cockpit_advance` tool, a `waiting-for:<gate>` → `completed:<gate>` label flip on GitHub, or answering a different gate that advances the same phase. Then submit the stored-open inbox answer against the now-stale generation. Confirm:
  - Session ack `outcome` = `superseded` with `detail` explaining the state drift
  - Inbox terminal display shows `superseded`
  - **No** GitHub marker comment is created from the superseded answer
  Fill the report's **Supersession run** section and tick the coverage-matrix row.
- [ ] T018 [US1] **Offline redelivery (per D5)** — with at least one gate open and answerable:
  1. Sever the cluster's outbound relay WS to generacy.ai. Preferred: `sudo iptables -A OUTPUT -p tcp -d <relay-host> --dport 443 -j DROP` — record the exact rule in the report. Alternative (only if the cluster survives it): bring the primary NIC down.
  2. Confirm the driving process stays alive but orchestrator logs show the relay WS disconnected.
  3. Submit the answer in the inbox during the outage. Inbox should show `answered` but not `delivered`.
  4. Restore connectivity (reverse iptables rule / bring interface back up).
  5. Observe redelivery via the relay handshake; confirm the answer is applied **exactly once** (no duplicate side effects on GitHub — check labels / marker comments).
  Capture drop timestamp, restore timestamp, submitted-at timestamp, `deliveryId`, and delivered-at timestamp in the report's **Offline redelivery run** section. If a duplicate apply is observed, file as **blocker** (`deliveryId` dedup regression). Tick the coverage-matrix row.

## Phase 5: Synthetic Follow-up (Conditional)

Only if the live epic has not covered every coverage-matrix row within a bounded window (target: two working days of driver time). Skip entirely if coverage is already complete.

- [ ] T019 [US1] Seed a synthetic follow-up epic on a scratch branch specifically engineered to trigger the **missing** gate types. Record `owner/repo#N` and the seeded gate types in the report's **Meta / Synthetic follow-up epic** field.
- [ ] T020 [US1] Launch `/cockpit:auto <synthetic-epic-ref> --gates=ui` and repeat the relevant subset of Phase 3–4 tasks against the synthetic epic until every coverage-matrix row is ticked.

## Phase 6: Report Assembly & Defect Filing

- [ ] T021 [US1] File every rough edge encountered during the run as a follow-up issue on the epic **before** the report closes. Classify each with severity per `quickstart.md § File rough edges`:
  - `blocker` — prevented an entire gate type from being exercised or produced wrong behavior on the wire
  - `major` — gate worked but with confusing UX, misleading state, or missing audit attribution
  - `minor` — cosmetic, docs, ergonomic
  Populate the **Defects filed** table in the report with severity, issue link, blocker-for-this-dogfood flag, and fixed-in-this-run flag.
- [ ] T022 [US1] Update operator-facing docs where behavior surprised the run: the cockpit walkthrough, the epic plan's "Operator UX" section, or any commands/*.md whose observed behavior diverged from the playbook prose. Link every touched doc in the report's **Docs updated** section. If nothing needed updating, state that explicitly.
- [ ] T023 [US1] Fill out `contracts/run-report-template.md` completely — every section is required. Only leave a section empty when there's a filed defect explaining why. Timestamp the **End (coverage-complete)** field. Sign the report.

## Phase 7: Verification & Close-out

- [ ] T024 [US1] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` for every heading and contract rule this edit changes.
  Files edited by this issue: **none in the product tree** — this dogfood ships evidence (run report + filed defects), not code. `plan.md` names `packages/claude-plugin-cockpit/commands/auto.md` as an **exercised** file (P4 skill rework lives on epic issue #14, not here). If T022 or a fix rolled into this run touches any `commands/*.md`, treat those paths as edited and re-pin per the rule below.
  Pin sites in `playbook-verification.test.ts` that read `commands/auto.md` (used only if this run ends up editing it):
    - `:42` — `AUTO_MD_PATH = resolve(__dirname, "..", "commands", "auto.md")` (module-scope path)
    - `:44` / `:232` — "394 — auto.md unfiltered stream consumption + liveness cross-check", "396 — auto.md D.11 dispatch + tightened D.10 trigger + drift audit" describe-blocks (`readFileSync(AUTO_MD_PATH)`)
    - `:295–:328` — 396-3 drift audit (§ Dispatch heading + Trigger match, direct `readFileSync`)
    - `:917–:942` — 402-1/402-2 structural drift audit + regression against `402-drift-auto.md` fixture (contract section + ≤4 bound + cross-references)
    - `:1041–:1055` — `extractSubheadingBlock` helper (exact-heading pins; § Invariants)
    - `:1111–:1285` — 403 describe-block ledger-only contract + `phase:*` row + subagent diagnosis + invariants cost-contract (multiple `extractSubheadingBlock` calls against D.7, D.9d, D.11)
    - `:1428–:1567` — `extractInstructionsSteps` helper + 406-3 (Monitor-wake loop shape: step 4 uses `cockpit_await_events` + `maxWaitMs=1`, step 2 arms `generacy cockpit doorbell` under `Monitor`, retires `generacy cockpit watch` from the auto sensor) + 406-4 (in-memory cursor)
    - `:527` — `readdirSync(COMMANDS_DIR)` sweep (invocation-vs-`--help` drift; covers **every** `commands/*.md` playbook regardless of which one you edited)
  Re-pinning means updating the assertion to the NEW contract.
  **Do NOT weaken or delete an assertion to make the test pass** — the pin is a drift audit; weakening it deletes its value.
  If this run does not touch any `commands/*.md`, **verify manually before shipping**: run `pnpm --filter=@generacy/claude-plugin-cockpit test playbook-verification` and confirm it stays green.
- [ ] T025 [US1] Post the completed run report as a comment on `https://github.com/generacy-ai/agency/issues/450`. Apply the appropriate `completed:*` label per the epic's convention. Confirm no blocker-severity defect from T021 remains **unfiled** (blockers may remain **unfixed**, but every one must be filed with a clear reproduction).
- [ ] T026 [US1] Cross-post a one-paragraph summary (coverage-complete? blockers filed? epic still in-flight?) as a comment on the epic tracking issue so the epic owner has a synchronous handoff signal without reading the full report.

## Dependencies & Execution Order

**Sequential**: Phase 1 → 2 → 3 → 4 → (5 if needed) → 6 → 7. Each phase gates the next: preflight before launch, launch before natural coverage, natural coverage before forced scenarios (which may otherwise contaminate the natural evidence), synthetic top-up only after live-window budget expires, report assembly after all evidence captured, verification + close-out last.

**Parallel within phases**:

- Phase 1: T002, T003, T004 are independent of T001 (each verifies a different resource); T001 is the critical path.
- Phase 3: T010, T011, T012, T013, T014 are `[P]` — different gate types on different (or independent) code paths; answer them as they arrive without artificial serialization. T008 → T009 is sequential only because the "Make changes" round requires a preceding batch response. T015 is a **cross-cutting observation** measured while T008–T014 run — not a separate step in wall time.
- Phase 4: T016, T017, T018 are all sequential relative to each other (each mutates cluster / GitHub state in ways the others can observe) — run them one at a time.
- Phase 6: T021 → T022 → T023 (defects filed before docs updated before report finalized).

**Critical path**: T001 (preflight blocker check) → T006 (driver launch) → T008 (first clarification, needed for T009) → T016/T017/T018 (forced scenarios, sequential) → T023 (report) → T025 (attach) → T026 (epic handoff).

**Coverage stopping rule (per D2)**: run terminates when every row of the report's coverage matrix is ticked, regardless of whether the driven epic has reached terminal state. Record the epic's end-of-run state in **Meta**.
