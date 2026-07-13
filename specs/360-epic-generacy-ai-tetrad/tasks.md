# Tasks: `/cockpit:bug` + AFK push in `/cockpit:watch` (Epic Cockpit A5.3)

**Input**: Design documents from `/specs/360-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/bug.md, contracts/watch-push.md, clarifications.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: This issue has a single deliverable thread; tasks are tagged `[A5.3]` to match the epic checklist ref.

## Phase 1: Setup & Pre-flight Verification

- [X] T001 [A5.3] Confirm sibling pattern sources exist and are readable: `packages/claude-plugin-cockpit/commands/queue.md` (confirm-gate template), `packages/claude-plugin-cockpit/commands/file.md` (engine-owned dedup with hidden HTML marker), `packages/claude-plugin-cockpit/commands/status.md` (`MISSING_BINARY` / `AUTH_FAILURE` copy source), `packages/claude-plugin-cockpit/commands/watch.md` (the file to edit; A5.1 inline-chat surface owner). No edits in this task — just establish that the patterns referenced by plan.md Phase 0 are in place before authoring begins.
- [X] T002 [P] [A5.3] Verify host primitive availability in the target Claude Code environment per plan.md Phase 0: `AskUserQuestion`, `PushNotification`, `Monitor`. Record any deviation as a blocker before Phase 2 begins; no file edits.
- [X] T003 [P] [A5.3] Verify the `process:speckit-bugfix` label routing is already understood by the autonomy classifier / `/cockpit:watch` stream (sanity-check; no new code path is required on the watch side per research D3). No file edits.

## Phase 2: Implement `/cockpit:bug` (NEW file)

<!-- Phase boundary: Setup must complete before authoring begins. Tasks T010–T017 all write to the same single file (`packages/claude-plugin-cockpit/commands/bug.md`) and MUST execute sequentially in the order listed — no [P]. -->

- [X] T010 [A5.3] Create `packages/claude-plugin-cockpit/commands/bug.md` with the YAML frontmatter block per plan.md Phase 1 step 1: `description:` one-line palette summary, no `arguments:` block (mirrors `/cockpit:watch`'s freeform-arg pattern; the body's `## Arguments` section documents the surface).
- [X] T011 [A5.3] In `packages/claude-plugin-cockpit/commands/bug.md`, add the `## Arguments` section documenting the single freeform `<title-or-description>` positional argument per contracts/bug.md `## Invocation`. Mirror `/cockpit:queue`'s structure but DO NOT carry over its "≥2 tokens" rejection (bug titles are multi-token by design — research D2).
- [X] T012 [A5.3] In `packages/claude-plugin-cockpit/commands/bug.md`, add the **Argument handling** step per plan.md Phase 1 step 2 / data-model E1: trim outer whitespace; empty/whitespace-only → emit literal `Usage: /cockpit:bug <title-or-description>` and exit non-zero (no prompt, no engine call); otherwise capture the trimmed string as `<title>` (multi-token allowed; no tokenization, no first-line/remainder split, no Markdown stripping, no case-folding).
- [X] T013 [A5.3] In `packages/claude-plugin-cockpit/commands/bug.md`, add the **Confirmation gate** step per plan.md Phase 1 step 3 / data-model E2–E4 / research D4, D6: compute `<preview>` (truncate to 120 chars + `…` only if truncated; preview is informational, full title goes to the engine); invoke `AskUserQuestion` with the locked multi-line `question` (line 1 = ``File this as a `process:speckit-bugfix` issue?``, line 2 = blank, line 3 = `Title: <preview>`), `header: "File bug"`, `multiSelect: false`, options `Confirm` then `Cancel` with the exact descriptions in data-model E4. Affirmative test = exact string equality with `Confirm`; anything else (including `Cancel`, host's auto-added `Other`, aborted prompt, null return) routes to the Cancel branch (T016).
- [X] T014 [A5.3] In `packages/claude-plugin-cockpit/commands/bug.md`, add the **CLI pre-flight + engine invocation** step per plan.md Phase 1 step 4 / data-model E7 / research D9: gate behind `Confirm` only; run `command -v generacy >/dev/null 2>&1`; on non-zero, route to `MissingBinary` (T017a); otherwise from the repo root invoke the bug-filing engine via Bash with `<title>` as the single positional argument (no flags, no `--json`), capturing stdout, stderr, and exit code into separate variables. Document (in a brief inline note, not narrative paragraphs) that the engine owns marker computation, label application, body templating, and dedup search — the slash command does none of these.
- [X] T015 [A5.3] In `packages/claude-plugin-cockpit/commands/bug.md`, add the **Success rendering** step per plan.md Phase 1 step 5 / data-model E8 / research D7 / contracts/bug.md `## Output schema § Success`: on engine exit 0, emit `**Filed:** <repo>#<number>` (`<repo>#<number>` extracted from the engine's success payload — last stdout line OR structured JSON field per the documented convention), then one blank line, then the engine's stdout inside a triple-backtick fenced code block, verbatim (no reflow, reformat, re-align, re-decorate, or substitute). Dedup hits ("matched existing marker; reusing #<n>") render under the SAME shape — no separate "Reused:" header.
- [X] T016 [A5.3] In `packages/claude-plugin-cockpit/commands/bug.md`, add the **Cancel rendering** step per plan.md Phase 1 step 6 / data-model E9 (`Cancelled` row) / contracts/bug.md `## Output schema § Cancelled` / research D15: on any non-affirmative `AskUserQuestion` outcome, emit exactly one terse line `Cancelled: /cockpit:bug` (no fenced block, no echo of the title) and exit non-zero. The engine MUST NOT be invoked on this branch.
- [X] T017 [A5.3] In `packages/claude-plugin-cockpit/commands/bug.md`, add the **Error rendering** step per plan.md Phase 1 step 7 / data-model E9 / contracts/bug.md `## Output schema § Error - *` / research D8, D14 — three classes, first match wins, case-insensitive, no silent no-op on any path:
  - T017a `MissingBinary` — triggered by pre-flight failure in T014; emit the byte-identical `/cockpit:status` / `/cockpit:queue` install-CLI line; exit non-zero.
  - T017b `AuthFailure` — triggered by engine exit ≠ 0 AND captured stderr matching `/auth|unauthorized|401|gh auth/i`; emit the byte-identical `/cockpit:status` / `/cockpit:queue` `gh auth login` line; exit non-zero.
  - T017c `Other` — triggered by engine exit ≠ 0 with no earlier class matching; emit `Engine failed with exit code <N>.` on one line followed by captured engine stderr inside a triple-backtick fenced code block; exit non-zero.

## Phase 3: Amend `/cockpit:watch` (EDIT)

<!-- Phase boundary: Phase 2 must complete before this phase starts so the new file is reviewable in isolation. All tasks below edit the SAME single file (`packages/claude-plugin-cockpit/commands/watch.md`) and MUST execute sequentially in the order listed — no [P]. -->

- [X] T020 [A5.3] In `packages/claude-plugin-cockpit/commands/watch.md`, locate the existing step 4 ("Inline notification format") block; do NOT modify it. Add a new sub-section header within step 4 (or as a sibling step depending on the file's existing structure) that frames the inline emission and the push emission as two parallel surfaces of the same transition record, per plan.md Phase 2 step 1 / contracts/watch-push.md `## Scope of the amendment`. No format change to the inline line (A5.1 owns it byte-for-byte; research D16).
- [X] T021 [A5.3] In `packages/claude-plugin-cockpit/commands/watch.md`, add the **Push notification format** sub-section per plan.md Phase 2 step 2 / contracts/watch-push.md `## Push payload format` / data-model W3 / research D10: document the literal format `<repo>#<number> <kind> <from>→<to> [<class>]` — single line, Unicode right-arrow `→` (U+2192) with no surrounding whitespace inside the arrow, square brackets around the class token, ≤200 chars by construction (no truncation logic), no per-platform reformatting. Include the class derivation table from contracts/watch-push.md (notify-only / unmapped / `policy-error: missing command` / `policy-error: unknown mode '<value>'`) and at least 3 of the example lines from that contract.
- [X] T022 [A5.3] In `packages/claude-plugin-cockpit/commands/watch.md`, add the **Fire conditions** sub-section per plan.md Phase 2 step 3 / contracts/watch-push.md `## Fire conditions` / data-model W4: the push MUST fire for every transition that produces an inline chat line (`notify-only`, `unmapped`, `policy-error:` degraded auto, unknown-`mode` degraded auto) and MUST NOT fire for auto-dispatched, baseline (`from === null`), echo (`from === to`), or already-`seen` transitions. State the parity invariant explicitly: **inline emitted ⇔ push fired** (with the single documented exception of the malformed-record diagnostic line, which has no record to format from).
- [X] T023 [A5.3] In `packages/claude-plugin-cockpit/commands/watch.md`, add the **AFK semantics** sub-section per plan.md Phase 2 step 4 / contracts/watch-push.md `### AFK semantics` / research D11: the playbook does NOT detect operator presence; "AFK push" is the colloquial name for the OS-level surface, not a conditional fire; no timer, no idle threshold, no per-platform gating; every inline chat line is unconditionally paired with one push call.
- [X] T024 [A5.3] In `packages/claude-plugin-cockpit/commands/watch.md`, add the **Ordering** sub-section per contracts/watch-push.md `### Ordering`: for every fired transition, inline-chat line FIRST, then `PushNotification` call, then push-result handling. Inline-first ensures the always-on backup surface is never blocked or delayed by the push primitive.
- [X] T025 [A5.3] In `packages/claude-plugin-cockpit/commands/watch.md`, add the **Push failure handling** sub-section per plan.md Phase 2 step 5 / contracts/watch-push.md `## Push failure handling` / data-model W5 / research D12: on `PushNotification` error, emit exactly one inline line `[cockpit:watch] push failed: <reason>` (using the primitive's error message verbatim); continue processing the stream; do NOT retry; do NOT roll back the already-emitted inline chat line; do NOT remove the transition from `seen`. The `push failed:` diagnostic does NOT itself trigger a second push (no recursive attempt).
- [X] T026 [A5.3] In `packages/claude-plugin-cockpit/commands/watch.md`, add the **No retry** note per plan.md Phase 2 step 6: the playbook is fire-and-forget per `PushNotification` call; the host primitive owns its own delivery semantics.

## Phase 4: Optional README touch-up

<!-- Phase boundary: Phases 2 and 3 must be reviewable before this cosmetic touch-up. Skip-able for v1 per plan.md Phase 3 ("optional in this issue"). -->

- [X] T030 [P] [A5.3] (OPTIONAL — may be deferred to a follow-up) In `packages/claude-plugin-cockpit/README.md`, flip the `/cockpit:bug` row from any "coming soon" / placeholder state to a one-line live description; optionally annotate the `/cockpit:watch` row to mention "+ AFK push". Cosmetic only; does NOT block acceptance.

## Phase 5: Manual Validation

<!-- Phase boundary: All implementation phases above must complete before validation. Each task below is an independent runtime check — they may run in parallel if multiple operators are available, but most realistically run sequentially against a single live cockpit install. -->

### `/cockpit:bug` validation

- [ ] T040 [A5.3] **Acceptance — "Files+tracks a bugfix"** (plan.md Phase 4 step 1): install the plugin; run `/cockpit:bug login button is broken on Safari` against a repo where the bug-filing engine is wired up; select `Confirm`. Verify (a) a new GitHub issue is created with title `login button is broken on Safari`, (b) the issue carries the literal label `process:speckit-bugfix`, (c) the issue body contains a hidden HTML marker matching `<!-- generacy-bug: [0-9a-f]{64} -->`, (d) the slash command emits `**Filed:** <repo>#<n>` followed by the engine's stdout in a fenced block.
- [ ] T041 [P] [A5.3] **Q1=A — whole `$ARGUMENTS` is the title** (plan.md Phase 4 step 2): run `/cockpit:bug The picker shows the wrong year when locale is non-US`; verify the resulting issue's title is the full multi-token string and the body is the engine's minimal template (the slash command supplied nothing to the body).
- [ ] T042 [P] [A5.3] **Q3=A — confirm gate (Cancel path)** (plan.md Phase 4 step 3): re-run the verb; select `Cancel`; verify (a) no engine call was made (no new issue, no rate-limit consumed) and (b) the only output is the one-line `Cancelled: /cockpit:bug`.
- [ ] T043 [P] [A5.3] **Q3=A — `Other` rejection** (plan.md Phase 4 step 4): re-run; choose the host's auto-added `Other` option with arbitrary text; verify the same `Cancelled: /cockpit:bug` line and non-zero exit; no engine call.
- [ ] T044 [P] [A5.3] **Q2=C — label + marker** (plan.md Phase 4 step 5): inspect the issue created in T040 on the GitHub web UI; verify the `process:speckit-bugfix` label is attached; inspect the raw body via `gh issue view <n> --json body --jq .body` and verify the hidden marker is present.
- [ ] T045 [A5.3] **Q5=B — dedup hit** (plan.md Phase 4 step 6): re-run `/cockpit:bug login button is broken on Safari` (same input as T040); select `Confirm`; verify the engine's dedup short-circuits to the existing `<repo>#<number>` — header `**Filed:** <repo>#<n>` with the same `<n>` as T040, stdout indicates reuse (e.g. "matched existing marker; reusing #<n>"), no second issue was created. Depends on T040.
- [ ] T046 [P] [A5.3] **Q5=B — typo creates new issue** (plan.md Phase 4 step 7): run `/cockpit:bug Login button is broken on Safari` (capitalized "L"); verify a DIFFERENT `<n>` is returned (sha256 differs by one byte → marker differs → new issue). Documented behaviour, not a bug.
- [ ] T047 [P] [A5.3] **Empty-arg rejection** (plan.md Phase 4 step 8): run `/cockpit:bug` (no arguments); verify the literal `Usage: /cockpit:bug <title-or-description>` is printed, exit is non-zero, no prompt was shown.
- [ ] T048 [P] [A5.3] **`MissingBinary` path** (plan.md Phase 4 step 9): temporarily unset `PATH` for `generacy`; run `/cockpit:bug something`; select `Confirm`; verify the `MissingBinary` text matches the `/cockpit:status` / `/cockpit:queue` line byte-for-byte.
- [ ] T049 [P] [A5.3] **`Other` error path** (plan.md Phase 4 step 10): run against a repo where the `process:speckit-bugfix` label is not defined and the engine cannot auto-create it; `Confirm`; verify a single `Engine failed with exit code <N>.` line followed by a fenced stderr block.

### `/cockpit:watch` AFK push validation

- [ ] T050 [A5.3] **Acceptance — "emits a push when AFK"** (plan.md Phase 4 step 11): start `/cockpit:watch <epic-ref>` against an epic with at least one transition mapped to `notify-only`; trigger the transition (e.g. flip a label); verify (a) one inline chat line in the existing A5.1 format AND (b) one `PushNotification` call whose `message` matches `<repo>#<number> <kind> <from>→<to> [notify-only]` exactly.
- [ ] T051 [P] [A5.3] **Q4=B — push format check** (plan.md Phase 4 step 12): inspect the push payload (OS notification log or `PushNotification` tool trace); verify (a) single line, (b) no extra whitespace inside the arrow, (c) class enclosed in square brackets, (d) length ≤200 chars.
- [ ] T052 [P] [A5.3] **Auto-dispatched — no push** (plan.md Phase 4 step 13): trigger a transition mapped to an `auto` policy with a valid `command`; verify the slash command was invoked AND neither an inline chat line nor a `PushNotification` was emitted for this transition (A5.1 invariant preserved).
- [ ] T053 [P] [A5.3] **Policy-error degraded auto — push fires** (plan.md Phase 4 step 14): configure a policy entry with `mode: "auto"` and no `command` (or unknown `mode`); trigger the transition; verify both an inline `policy-error:`-prefixed chat line AND a push with `[policy-error: <reason>]`.
- [ ] T054 [P] [A5.3] **Unmapped transition — push fires** (plan.md Phase 4 step 15): trigger a transition with no matching policy entry; verify inline + push both appear, push class is `[unmapped]`.
- [ ] T055 [P] [A5.3] **Baseline line — no push, no inline** (plan.md Phase 4 step 16): restart `/cockpit:watch <epic-ref>`; verify the engine's `from: null` baseline lines produce no inline chat and no push (A5.3 amendment does not change A5.1's step 3b drop).
- [ ] T056 [P] [A5.3] **Echo line — no push, no inline** (plan.md Phase 4 step 17): simulate (or wait for) a `from === to` line; verify it produces no inline chat and no push.
- [ ] T057 [P] [A5.3] **Dedupe — second emission silent** (plan.md Phase 4 step 18): trigger the same transition twice (e.g. reconnect the watch); verify the second emission produces no inline chat and no push (existing step 3d/3e drop).
- [ ] T058 [P] [A5.3] **Push primitive failure** (plan.md Phase 4 step 19): revoke OS notification permission; restart the watch; trigger a notify-only transition; verify (a) the inline chat line still appears, (b) one `[cockpit:watch] push failed: <reason>` line appears inline, (c) the watch loop continues processing subsequent transitions.
- [ ] T059 [A5.3] **Isolation check** (plan.md Phase 4 step 20): confirm the diff for this issue touches only `packages/claude-plugin-cockpit/commands/bug.md` (new) and `packages/claude-plugin-cockpit/commands/watch.md` (edit — additions only inside step 4 and below; no edits to steps 1–3) — plus optionally `packages/claude-plugin-cockpit/README.md` if T030 was executed. Run `git diff --stat` and inspect.

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 (Setup) → Phase 2 (`/cockpit:bug`) → Phase 3 (`/cockpit:watch` amendment) → Phase 4 (optional README) → Phase 5 (Manual validation)

**Phase 2 internal ordering** (sequential, NOT parallel):
- T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017a → T017b → T017c
- All ten tasks write to the same single file (`bug.md`); they must be applied in order to keep the file readable and to keep diffs minimal.

**Phase 3 internal ordering** (sequential, NOT parallel):
- T020 → T021 → T022 → T023 → T024 → T025 → T026
- All seven tasks edit the same single file (`watch.md`); they must be applied in order. The T020 anchor sub-section MUST land before the format/conditions/handling sub-sections that hang off it.

**Phase 5 internal ordering**:
- T040 must run BEFORE T045 (the dedup-hit test needs the create-new run to compare against).
- All other Phase 5 tasks marked `[P]` can run in any order; they are independent runtime checks.
- T059 (isolation check) should be the LAST Phase 5 task — it inspects the final diff state.

**Parallel opportunities**:
- T002 and T003 can run in parallel during Phase 1 (different concerns, no file edits).
- T030 (optional README) can run in parallel with the start of Phase 5 if attempted.
- Most Phase 5 validation tasks are marked `[P]` and are independent runtime checks against the live cockpit install; pragmatically they run sequentially against a single operator's session.

**Cross-file independence**:
- Phase 2 and Phase 3 touch different files and could in principle run in parallel, but the spec.md acceptance ("Files+tracks a bugfix; emits a push when AFK") and the Phase 5 validation are easier to reason about when reviewing the new file in isolation before mutating the existing one. The phase ordering above keeps the diff easy to review and the rollback simple if a downstream review surfaces a problem with either file.

## Out-of-scope guards (do NOT add these in any task above)

Per research D16 and plan.md Constraints, the implementation MUST NOT:
- Compute, validate, or write the dedup marker (engine-owned).
- Template the GitHub issue body in any way beyond passing the title (engine-owned).
- Mutate any GitHub label directly (engine applies `process:speckit-bugfix`).
- Run any CLI other than the bug-filing engine for `/cockpit:bug`, or any tool other than `Monitor` + `AskUserQuestion` + `PushNotification` for `/cockpit:watch`.
- Persist any state on disk.
- Auto-retry the engine or the push primitive.
- Detect operator presence ("at the keyboard").
- Truncate or reformat the push payload.
- Change the inline-chat line in `/cockpit:watch` (A5.1 owns; unchanged).
- Edit `plugin.json`, `marketplace.json`, or `package.json` (A1.4 / #350 already delivered the scaffold).

---

*Generated by speckit — standard mode (fine-grained tasks).*
