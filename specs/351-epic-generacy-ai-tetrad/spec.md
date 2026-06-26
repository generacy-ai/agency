# Feature Specification: /cockpit:watch command (Monitor + reactive loop)

**Branch**: `351-epic-generacy-ai-tetrad` | **Date**: 2026-06-26 | **Status**: Draft

**Source**: [generacy-ai/agency#351](https://github.com/generacy-ai/agency/issues/351)
**Epic**: [generacy-ai/tetrad-development#85](https://github.com/generacy-ai/tetrad-development/issues/85) (Epic Cockpit) — Phase P2 / Tier v1-core / Issue A2.1
**Depends on**: G1.1, G1.2, G1.3, A1.4 (cockpit plugin scaffold lands in #350)

## Summary

Ship the `/cockpit:watch` slash command in the `claude-plugin-cockpit` Claude Code plugin. When a developer runs `/cockpit:watch <epic>`, the command launches Claude Code's `Monitor` tool against `generacy cockpit watch` as a persistent stream. Each emitted transition (typically a GitHub label change on an epic-child issue or its PR) is reconciled against the configured autonomy policy and either:

- invokes the appropriate downstream `/cockpit:*` command (e.g. `/cockpit:clarify`, `/cockpit:review`, `/cockpit:merge`), or
- emits a single user notification when policy says "human in the loop."

The command file owned by this issue is `packages/claude-plugin-cockpit/commands/watch.md`.

## User Stories

### US1: Reactive epic supervision

**As a** developer-owner of an in-flight speckit epic,
**I want** a single `/cockpit:watch` loop running in Claude Code that reacts to label transitions on the epic and its child issues/PRs,
**So that** I don't have to manually poll GitHub or hand-fire `/cockpit:clarify`, `/cockpit:review`, or `/cockpit:merge` for each transition — the loop applies my autonomy policy and either does the work or pings me.

**Acceptance Criteria**:
- [ ] Running `/cockpit:watch <epic-ref>` starts a persistent Monitor stream backed by `generacy cockpit watch <epic-ref>`.
- [ ] A single label change on an epic-child yields exactly one notification to the user (no duplicate fires for the same transition).
- [ ] The same transition triggers exactly one policy-driven action: either invoking the matching downstream `/cockpit:*` command, or surfacing a notification when policy is `notify-only`.
- [ ] The watch loop survives transient `generacy` stream errors without exiting (reconnects/backs off), and exits cleanly on user interrupt.

### US2: Autonomy-policy alignment

**As a** developer configuring how aggressive the cockpit is allowed to be,
**I want** the watch loop to honor my autonomy policy per phase (e.g. auto-clarify but human-confirmed merge),
**So that** the loop's behavior matches the trust level I've granted for each kind of transition.

**Acceptance Criteria**:
- [ ] Each transition is mapped to a downstream verb via the autonomy policy lookup.
- [ ] Transitions whose policy is `notify-only` produce a notification and no downstream verb invocation.
- [ ] Transitions whose policy is `auto` invoke the downstream verb without prompting.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Provide `packages/claude-plugin-cockpit/commands/watch.md` registering the `/cockpit:watch` slash command. | P1 | This file is the issue's isolation boundary. |
| FR-002 | The command accepts an epic reference (issue number or `owner/repo#N`) as its argument. | P1 | Argument format mirrors other `/cockpit:*` verbs. |
| FR-003 | The command invokes Claude Code's `Monitor` tool with `generacy cockpit watch <epic-ref>` as the watched process. | P1 | Persistent stream; one stdout line per transition (per Monitor convention). |
| FR-004 | Each transition event is parsed and reconciled against the autonomy policy resolved from the user's cockpit configuration. | P1 | Depends on G1.* policy primitives. |
| FR-005 | When policy resolves to a downstream verb, the loop invokes the corresponding `/cockpit:clarify`, `/cockpit:review`, or `/cockpit:merge` command for that transition. | P1 | One invocation per transition. |
| FR-006 | When policy resolves to `notify-only`, the loop emits a single user-facing notification describing the transition and what action was skipped. | P1 | No duplicate notifications for the same transition id. |
| FR-007 | Document `/cockpit:watch` in the cockpit plugin README's command table (replacing the "coming in #351–#360" stub for this row). | P2 | Already stubbed in the scaffold from A1.4. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | A single label change on an epic-child produces exactly one notification and at most one downstream action. | 1 notification / ≤1 action per transition | Manual end-to-end: relabel an issue while watch is running, observe notifications + invoked verbs. |
| SC-002 | The downstream verb chosen matches the autonomy policy for the transition. | 100% match | Cross-reference each fired action against the policy table for each tested transition class. |
| SC-003 | Watch loop remains running across at least one transient `generacy` stream error. | Loop survives ≥1 reconnect in a 10-min window | Inject a stream interruption, confirm loop reconnects and continues processing the next transition. |

## Assumptions

- The `generacy cockpit watch` subcommand exists and emits a structured, line-delimited transition stream (provided by sibling generacy work; one of G1.1/G1.2/G1.3).
- The `claude-plugin-cockpit` plugin scaffold (issue A1.4 / #350) has landed, so the `commands/` directory and marketplace entry are ready to receive `watch.md`.
- An autonomy-policy resolver is available to the slash command at runtime (provided by G1.x); this issue consumes it rather than designing it.
- Claude Code's `Monitor` tool is the agreed mechanism for persistent reactive loops in this plugin (per epic plan).

## Out of Scope

- Implementing the `generacy cockpit watch` CLI subcommand itself (lives in the generacy package / G1.* issues).
- Implementing the autonomy policy data model or its storage (G1.* issues).
- The downstream verbs `/cockpit:clarify`, `/cockpit:review`, `/cockpit:merge` themselves — `/cockpit:watch` only dispatches to them. They ship in sibling Epic Cockpit issues.
- Multi-epic concurrent watching from a single command invocation (one epic per `/cockpit:watch` call for v1).
- Web-UI / dashboard rendering of transitions — terminal/Claude Code notifications only for v1.

---

*Generated by speckit*
