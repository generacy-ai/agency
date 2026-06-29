# Feature Specification: /cockpit:bug bugfix loop + AFK push notifications

**Branch**: `360-epic-generacy-ai-tetrad` | **Date**: 2026-06-29 | **Status**: Draft

**Epic**: generacy-ai/tetrad-development#85 | **Phase**: P5 | **Tier**: v3-polish | **Issue**: A5.3 (generacy-ai/agency#360)

## Summary

Add two v3-polish enhancements to the cockpit plugin:

1. **`/cockpit:bug` command** — file a bug and route it through the watch/merge loop using `process:speckit-bugfix` (playbook steps 10-11). The verb is owned by `packages/claude-plugin-cockpit/commands/bug.md` (new file).

2. **AFK push notifications in `/cockpit:watch`** — when the operator is away-from-keyboard, surface transitions via the `PushNotification` tool in addition to (or in place of) inline chat. Today `/cockpit:watch` is inline-chat-only per A5.1 clarification Q4-B; this issue lifts that scope-deferral. Owned by an edit to `packages/claude-plugin-cockpit/commands/watch.md`.

Together these close the human-out-of-the-loop gap: operators can file bugs that ride the same automated cockpit pipeline as features, and they don't have to keep the chat window focused to know when a transition needs their attention.

**Depends on**: A2.1 (`/cockpit:watch` baseline), A2.5 (`/cockpit:merge` / autonomy policy plumbing). See the epic checklist for issue numbers.

**Plan reference**: `docs/epic-cockpit-plan.md` in tetrad-development (P5 / A5.3).

## User Stories

### US1: File a bug that auto-routes through the bugfix loop

**As an** operator running the cockpit on an active epic,
**I want** a single `/cockpit:bug` verb that files a bug issue and hands it to the speckit-bugfix process,
**So that** bug reports get the same watch → spec → plan → tasks → file → merge automation as feature work, without me hand-stitching the steps.

**Acceptance Criteria**:
- [ ] `/cockpit:bug <title-or-description>` files a GitHub issue tagged as a bugfix (label or process marker per `process:speckit-bugfix` convention from playbook steps 10-11).
- [ ] The filed issue is tracked by the active `/cockpit:watch` loop — its transitions are picked up by the autonomy policy and routed like any other epic child.
- [ ] Re-running `/cockpit:bug` with the same description is idempotent in the sense that the playbook does not file duplicate issues for the same in-flight bug (engine-owned dedup, mirrors `/cockpit:file` Q5 precedent).
- [ ] The verb is a thin orchestrator — it does not call the GitHub API directly, parse refs itself, or edit tracking artifacts. Each responsibility delegates to an engine (`tasks_to_issues` or equivalent, ref resolver, manifest sync).

### US2: Get pushed when the cockpit needs attention while I'm AFK

**As an** operator who stepped away from the chat window,
**I want** the cockpit's watch loop to emit an OS push when a transition is `notify-only` or `unmapped`,
**So that** I find out about the epic stalling on my desk-check within seconds rather than the next time I refocus the chat tab.

**Acceptance Criteria**:
- [ ] `/cockpit:watch` emits a `PushNotification` for transitions that today produce an inline chat message (notify-only, unmapped, policy-error).
- [ ] Auto-dispatched transitions (mode === `auto` with a valid command) MUST NOT emit a push — the dispatch itself is the user-visible signal, identical to the inline-chat rule.
- [ ] Baseline (`from: null`) state-sync lines and same-state echoes MUST NOT emit a push (mirrors the dedup gate that already silences inline chat for these).
- [ ] The push body is concise enough to read on a notification surface and includes at minimum: epic ref, kind, `from → to`, policy class.
- [ ] Inline chat output is preserved — the push is additive, not a replacement, so the scrollback record is intact.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `/cockpit:bug` files a GitHub issue using the `process:speckit-bugfix` convention (playbook steps 10-11) and surfaces the resulting issue ref. | P1 | Engine-owned filing; playbook is a thin orchestrator. |
| FR-002 | The filed bug issue is discoverable by the active `/cockpit:watch` loop and routed through the standard autonomy policy. | P1 | No special-case branch in the watch playbook. |
| FR-003 | `/cockpit:bug` performs zero structural validation of its argument beyond empty/non-empty; ref resolution and parsing are engine-owned (mirrors `/cockpit:file` D6). | P1 | Single source of truth for ref handling lives in the engine resolver. |
| FR-004 | `/cockpit:bug --help` emits a static usage block and exits without engine calls (mirrors `/cockpit:file` help branch). | P2 | |
| FR-005 | On engine failure, `/cockpit:bug` surfaces the engine's stderr verbatim with a `[cockpit:bug]` source prefix and an optional `next:` recovery hint. No summarization. | P1 | Mirrors `/cockpit:file` D7. |
| FR-006 | `/cockpit:watch` invokes the `PushNotification` tool for every transition that would emit an inline chat line (notify-only, unmapped, policy-error). | P1 | Lifts the A5.1 Q4-B inline-chat-only restriction. |
| FR-007 | Auto-dispatched transitions MUST NOT emit a push (parity with the inline-chat suppression rule). | P1 | Defensive: prevents notification spam during fully-autonomous runs. |
| FR-008 | Baseline (`from: null`) lines and same-state echoes MUST NOT emit a push. | P1 | Dedupe gate sits *before* the push call, identical to inline chat. |
| FR-009 | The push payload is single-line and includes `<repo>#<number>`, `<kind>`, `<from> → <to>`, and `policy: <class>`. | P2 | Format mirrors the existing inline chat line. |
| FR-010 | Inline chat output remains the canonical persistent record; pushes are additive. | P1 | Operator using the chat surface alone retains full information. |
| FR-011 | `/cockpit:watch` MUST NOT fail the watch loop if `PushNotification` errors (e.g. missing OS permission); it logs the push failure inline and continues. | P2 | Push is best-effort; the inline-chat surface is the contract. |
| FR-012 | Schema forward-compat is preserved: unknown extra fields on a transition record MUST still be ignored, identical to today. | P1 | A5.1 invariant carried forward. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | A filed bug reaches the autonomy policy router. | 100% of `/cockpit:bug` invocations whose engine call succeeded. | Manual run + assert the next `/cockpit:watch` transition for the filed ref is routed through the policy. |
| SC-002 | Notify-only transitions emit a push during a watch session. | Push appears on every notify-only / unmapped / policy-error line. | Manual operator test with an OS notification surface attached. |
| SC-003 | Auto-dispatched transitions emit zero pushes. | 0 pushes for any transition with `mode === "auto"` and a valid `command`. | Manual run with a policy entry exercising both branches. |
| SC-004 | Watch loop survives a `PushNotification` failure. | Watch continues on subsequent transitions after a simulated push error. | Manual run with the push surface deliberately unavailable. |
| SC-005 | `/cockpit:bug` is idempotent on re-run. | Re-invoking the verb with the same in-flight bug does not file a duplicate. | Engine-level test (mirrors `/cockpit:file` Q5 precedent). |

## Assumptions

- The `process:speckit-bugfix` convention referenced by playbook steps 10-11 is documented (or about to be) in the cockpit epic plan, and the engine that owns issue filing recognizes it. The `/cockpit:bug` playbook only needs to pass a process hint to the engine.
- The Claude Code harness exposes a usable `PushNotification` tool in the same conversation that runs `/cockpit:watch`. If the tool is unavailable at runtime, FR-011 covers degradation.
- "AFK" is defined behaviorally: every notify-only / unmapped / policy-error line gets a push regardless of focus state. The watch playbook does not attempt to detect focus itself. (Open: see §Out of Scope.)
- The existing inline-chat format from A5.1 is the canonical wire format; the push is a re-encoding of the same record, not a parallel schema.
- Dedup state remains in-memory per `/cockpit:watch` invocation — no on-disk persistence is introduced by this issue (A5.1 invariant).

## Out of Scope

- Focus-state / idle-time detection. The push fires for every qualifying transition; this issue does not introduce an "only push when AFK" heuristic. If a follow-up wants to gate pushes on operator activity, that is a separate issue against the watch playbook.
- Per-policy push toggles (e.g. push-on-error-only) — the policy schema is not extended by this issue.
- Cross-repo bug filing — `/cockpit:bug` targets the branch's current `gh` remote, identical to `/cockpit:file` (clarification Q4 precedent).
- Push-only mode (suppressing inline chat in favor of push). The inline chat remains the persistent record; push is additive.
- Bug-specific UI in any external surface (web app, IDE extension). The verb is chat-only.
- Editing `tasks.md` or `.generacy/epics/<slug>.yaml` from the bug verb — single-writer invariants from `/cockpit:file` apply.

---

*Generated by speckit*
